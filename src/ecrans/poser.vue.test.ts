import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, type Jeu } from "../model/jeu";
import { main, offre, type Carte } from "../model/scoring";
import type { Catalogue } from "../model/types";
import { contexte, rejouer } from "../model/journal";
import type { Reste } from "../model/questions";
import {
  chercher,
  classeEtat,
  entreesDeLaCarte,
  normaliser,
  sortiesDeLaCarte,
  trouver,
  TROUVAILLES_MAX,
} from "./poser.vue";

const LUNDI = new Date("2026-08-17T12:00:00Z");
const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

let jeu: Jeu;
beforeEach(() => {
  jeu = creerJeu(catalogue, 7, LUNDI);
});

const creneau = (jour: number, repas: string): number => {
  const i = jeu.creneaux.findIndex((c) => c.jour === jour && c.repas === repas);
  if (i < 0) throw new Error(`pas de créneau ${repas} le jour ${jour}`);
  return i;
};
const carte = (slot: number, id: string): Carte => {
  const c = offre(jeu, jeu.choix, slot).find((x) => x.plat.id === id);
  if (!c) throw new Error(`${id} n'est pas jouable sur le créneau ${slot}`);
  return c;
};

describe("ce que la carte consomme", () => {
  test("le coût au panier est toujours la dernière ligne", () => {
    // C'est la ligne qu'on cherche : elle doit être au même endroit sur les
    // quatre cartes, sinon on la relit à chaque fois.
    for (const c of offre(jeu, jeu.choix, creneau(0, "diner")).slice(0, 8)) {
      const e = entreesDeLaCarte(c);
      expect(e.at(-1)?.etat === "à acheter" || e.at(-1)?.etat === "trouvé").toBe(true);
      expect(e.at(-1)?.texte).toMatch(/panier|rien de plus à acheter/);
    }
  });

  test("un plat gratuit le dit en « trouvé », pas en « 0 article »", () => {
    const c = offre(jeu, jeu.choix, creneau(0, "diner")).find((x) => x.marginal === 0);
    if (!c) return; // une semaine vide n'a pas toujours de plat gratuit
    const derniere = entreesDeLaCarte(c).at(-1)!;
    expect(derniere.etat).toBe("trouvé");
    expect(derniere.texte).toBe("rien de plus à acheter");
  });

  test("le pluriel des articles s'accorde", () => {
    const un = entreesDeLaCarte({ ...carte(creneau(0, "diner"), "lasagnes"), marginal: 1 });
    const deux = entreesDeLaCarte({ ...carte(creneau(0, "diner"), "lasagnes"), marginal: 2 });
    expect(un.at(-1)?.texte).toBe("1 article de plus au panier");
    expect(deux.at(-1)?.texte).toBe("2 articles de plus au panier");
  });

  test("un plat qui exige un reste introuvable dit que ça ne s'achète pas", () => {
    // `reste-de-la-veille` réclame un reste de plat et n'a pas de repli : sur
    // une semaine vide, rien ne le couvre et rien ne le vend. C'est le seul cas
    // où l'app n'a aucune solution à proposer, et il doit se distinguer d'un
    // simple manque, qui, lui, part aux courses.
    const c = carte(creneau(1, "dejeuner"), "reste-de-la-veille");
    expect(c.manque).toBe(true);
    const absent = entreesDeLaCarte(c).find((e) => e.etat === "absent");
    expect(absent?.texte).toMatch(/ça ne s’achète pas$/);
  });

  test("une base déjà cuite se dit « trouvé », une base entamée « pas assez »", () => {
    jeu.choix[creneau(0, "diner")] = "sauce-bolognaise";
    const c = carte(creneau(2, "diner"), "pates-bolognaise");
    expect(c.chaine).toBe(true);
    const ligne = entreesDeLaCarte(c)[0]!;
    expect(ligne.etat).toBe(c.partiel ? "pas assez" : "trouvé");
    expect(ligne.texte.length).toBeGreaterThan(0);
  });
});

describe("ce que la carte produit", () => {
  test("les quantités sont dites PAR LOT, pas à l'échelle du créneau", () => {
    // Le plat n'est pas encore posé et les parts peuvent encore changer :
    // annoncer 1 400 g pour en livrer 700 serait une promesse non tenue.
    const p = jeu.plats["sauce-bolognaise"]!;
    const s = sortiesDeLaCarte(p);
    const brut = p.emits[0]?.qty?.amount;
    expect(s[0]?.texte).toContain("par lot");
    expect(s[0]?.texte).toContain(String(brut).replace(".", ","));
  });

  test("un plat sans sortie n'en invente pas", () => {
    const p = jeu.plats["croque-monsieur-salade"]!;
    expect(sortiesDeLaCarte(p).filter((s) => s.icone !== "bebe")).toHaveLength(
      p.emits.length,
    );
  });

  test("un reste de plat va au frigo, même quand le plat se congèle", () => {
    const avecReste = Object.values(jeu.plats).find((p) =>
      p.emits.some((e) => e.kind === "reste-plat" && e.congelo),
    );
    if (!avecReste) return;
    const n = avecReste.emits.findIndex((e) => e.kind === "reste-plat" && e.congelo);
    expect(sortiesDeLaCarte(avecReste)[n]?.icone).toBe("frigo");
  });
});

describe("le vocabulaire fermé des états", () => {
  test("deux couleurs seulement : ce qui est là, ce qui manque", () => {
    expect(classeEtat("trouvé")).toBe("trouve");
    expect(classeEtat("pas assez")).toBe("court");
    // « À acheter » n'est pas un problème : c'est une ligne de liste.
    expect(classeEtat("à acheter")).toBe("");
    expect(classeEtat("absent")).toBe("");
  });
});

describe("la main", () => {
  test("elle ne bouge pas tant qu'on ne repioche pas", () => {
    jeu.slot = creneau(0, "diner");
    const a = main(jeu).map((c) => c.plat.id);
    const b = main(jeu).map((c) => c.plat.id);
    expect(b).toEqual(a);
  });

  test("repiocher change la main", () => {
    jeu.slot = creneau(0, "diner");
    const a = main(jeu).map((c) => c.plat.id);
    jeu.repioches[jeu.slot] = 1;
    expect(main(jeu).map((c) => c.plat.id)).not.toEqual(a);
  });

  test("chaque créneau a sa propre main", () => {
    jeu.slot = creneau(0, "diner");
    const a = main(jeu).map((c) => c.plat.id);
    jeu.slot = creneau(1, "diner");
    expect(main(jeu).map((c) => c.plat.id)).not.toEqual(a);
  });
});

/* ══════════════════ T80 — chercher un plat qu'on a déjà dans la tête ══════ */

describe("la frappe trouve le plat", () => {
  const plats = catalogue.plats;

  test("l'accent, la casse et la ponctuation ne comptent pas", () => {
    // C'est ce qu'on tape d'un pouce : personne ne compose un circonflexe pour
    // retrouver un plat, et « César » s'écrit « cesar » sur un clavier pressé.
    expect(trouver(plats, "PÂTES").map((p) => p.id)).toEqual(trouver(plats, "pates").map((p) => p.id));
    expect(trouver(plats, "cesar").length).toBeGreaterThan(0);
    expect(trouver(plats, "gnocchi").map((p) => p.id)).toContain("gnocchis-poelees");
  });

  // ÉPROUVÉ NON VIDE, ET MESURÉ : « ri » ramène 7 plats par début de mot et 24
  // par sous-chaîne. Les 17 autres sont des « grillées », des « frisé », des
  // « crémeux » — des plats dont on ne voit pas ce qu'ils font là, et une liste
  // qu'on ne s'explique pas est une liste qu'on cesse de lire.
  test("on cherche par début de mot, jamais par sous-chaîne", () => {
    const parPrefixe = trouver(plats, "ri");
    const parSousChaine = plats.filter((p) => normaliser(p.titre).includes("ri"));
    expect(parPrefixe.length).toBeGreaterThan(0);
    expect(parSousChaine.length).toBeGreaterThan(parPrefixe.length);
    for (const p of parPrefixe)
      expect(normaliser(p.titre).split(" ").some((m) => m.startsWith("ri"))).toBe(true);
  });

  test("tous les mots tapés doivent y être, pas seulement l'un d'eux", () => {
    const deux = trouver(plats, "salade riz");
    expect(deux.length).toBeGreaterThan(0);
    for (const p of deux) {
      const mots = normaliser(p.titre).split(" ");
      expect(mots.some((m) => m.startsWith("salade"))).toBe(true);
      expect(mots.some((m) => m.startsWith("riz"))).toBe(true);
    }
    expect(deux.length).toBeLessThan(trouver(plats, "salade").length);
  });

  test("une lettre ne cherche rien : elle feuillette", () => {
    // Mesuré sur les 138 titres : « a » en ramènerait 83, « e » 34.
    expect(trouver(plats, "a")).toEqual([]);
    expect(trouver(plats, " ")).toEqual([]);
    expect(trouver(plats, "")).toEqual([]);
  });

  test("le titre qui commence par ce qu'on a tapé passe devant", () => {
    const r = trouver(plats, "salade");
    expect(r.length).toBeGreaterThan(1);
    expect(normaliser(r[0]!.titre).startsWith("salade")).toBe(true);
    // Et le dernier ne commence pas par là, sinon l'ordre ne prouve rien.
    expect(normaliser(r.at(-1)!.titre).startsWith("salade")).toBe(false);
  });
});

describe("ce que la recherche montre du plat qu'on a nommé", () => {
  const ctx = contexte(catalogue);
  const savoirAvec = (repondu: Record<string, Reste>, recents: string[] = []) => ({
    rejeu: rejouer(catalogue, [], ctx, "2026-08-17"),
    passe: { repondu: new Map(Object.entries(repondu)), depense: new Map() },
    cuisinesRecemment: new Set(recents),
    planchers: [],
  });

  test("elle rend des cartes entières, prêtes à poser", () => {
    const r = chercher(jeu, jeu.choix, creneau(0, "diner"), "gnocchi");
    expect(r.total).toBe(1);
    expect(r.trouvailles[0]!.carte.plat.id).toBe("gnocchis-poelees");
    expect(r.trouvailles[0]!.ecarts).toEqual([]);
    expect(entreesDeLaCarte(r.trouvailles[0]!.carte).length).toBeGreaterThan(0);
  });

  // LA PROMESSE DU TICKET. Le plat bloqué est TROUVÉ — c'est ce que T78 a
  // tranché, appliqué à la recherche : on ne retire pas ce que quelqu'un vient
  // de nommer, on dit pourquoi on ne l'avait pas proposé.
  test("un plat que l'offre écarte est trouvé quand même, et l'écart le dit", () => {
    const slot = creneau(0, "diner");
    const savoir = savoirAvec({ "boeuf-hache": "non" });
    const viande = catalogue.plats.find((p) =>
      p.ingredients.some((i) => i.id === "boeuf-hache" && !i.base),
    )!;
    const r = chercher(jeu, jeu.choix, slot, viande.titre, savoir);
    const t = r.trouvailles.find((x) => x.carte.plat.id === viande.id)!;
    expect(t).toBeDefined();
    expect(t.ecarts.map((e) => e.cle)).toContain("bloque");
  });

  test("le cooldown est dit alors qu'il n'écarte pas de l'offre", () => {
    // Il écarte de la MAIN, et c'est pour ça qu'on cherche : le plat n'a jamais
    // été proposé sans qu'aucun écart de l'offre puisse l'expliquer.
    const slot = creneau(0, "diner");
    const r = chercher(jeu, jeu.choix, slot, "gnocchi", savoirAvec({}, ["gnocchis-poelees"]));
    const e = r.trouvailles[0]!.ecarts;
    expect(e.map((x) => x.cle)).toEqual(["recent"]);
    expect(e[0]!.texte).toContain(`${catalogue.equilibre.main.cooldown_jours} jours`);
  });

  test("l'ordre ne bouge pas d'un créneau à l'autre", () => {
    // UNE RECHERCHE N'EST PAS UNE PROPOSITION. Trier par note aurait donné deux
    // réponses différentes à la même question selon le créneau — et on cherche
    // justement parce qu'on a déjà décidé.
    const a = chercher(jeu, jeu.choix, creneau(0, "diner"), "salade");
    const b = chercher(jeu, jeu.choix, creneau(2, "dejeuner"), "salade");
    expect(b.trouvailles.map((t) => t.carte.plat.id)).toEqual(
      a.trouvailles.map((t) => t.carte.plat.id),
    );
  });

  test("le plafond coupe, et le total dit de combien", () => {
    // Mesuré : « salade » ramène 11 titres, au-dessus des huit qu'on montre.
    const r = chercher(jeu, jeu.choix, creneau(0, "diner"), "salade");
    expect(r.total).toBeGreaterThan(TROUVAILLES_MAX);
    expect(r.trouvailles.length).toBe(TROUVAILLES_MAX);
  });

  test("un créneau qui n'existe pas ne trouve rien plutôt que de mentir", () => {
    const r = chercher(jeu, jeu.choix, jeu.creneaux.length, "salade");
    expect(r).toEqual({ trouvailles: [], total: 0 });
  });
});
