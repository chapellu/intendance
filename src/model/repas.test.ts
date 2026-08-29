import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { comble, ditLeManque, estUnRepas, incomplet, manqueALAssiette, manqueAuRepas } from "./repas";
import { complements, offre } from "./scoring";
import type { Apports, Catalogue, Plat } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const poids = catalogue.equilibre.poids;
const plat = (id: string): Plat => catalogue.plats.find((p) => p.id === id)!;
const ap = (p: Partial<Apports>): Apports =>
  ({ proteine: "oeuf", feculent: "riz", legumes: ["racine"], profil: "rapide", ...p });

describe("ce qui fait un repas", () => {
  test("les trois piliers, et « rien » se dit de trois façons", () => {
    // Le catalogue écrit `aucune`, `aucun` et `[]` selon le pilier. Les traiter
    // séparément ferait trois fois la même faute.
    expect(manqueAuRepas(ap({}))).toEqual([]);
    expect(manqueAuRepas(ap({ proteine: "aucune" }))).toEqual(["proteine"]);
    expect(manqueAuRepas(ap({ feculent: "aucun" }))).toEqual(["feculent"]);
    expect(manqueAuRepas(ap({ legumes: [] }))).toEqual(["legumes"]);
  });

  test("un champ absent vaut « rien », il ne plante pas", () => {
    expect(manqueAuRepas({} as Apports)).toEqual(["proteine", "feculent", "legumes"]);
  });

  test("la phrase se lit en français", () => {
    expect(ditLeManque(["feculent"])).toBe("il manque un féculent");
    expect(ditLeManque(["proteine", "feculent"])).toBe("il manque une protéine et un féculent");
    expect(ditLeManque(["proteine", "feculent", "legumes"]))
      .toBe("il manque une protéine, un féculent et des légumes");
    expect(ditLeManque([])).toBe("");
  });
});

describe("sur le vrai corpus", () => {
  test("LA BOLOGNAISE ET LE RÔTI MANQUENT DE LA MÊME CHOSE", () => {
    // Le point de la remarque qui a ouvert ce module. J'avais séparé « ce n'est
    // pas un plat » de « il manque juste un accompagnement » ; c'était un
    // découpage de degré, pas de nature. Les deux sont des briques, et il leur
    // manque un féculent.
    expect(manqueAuRepas(plat("sauce-bolognaise").apports)).toEqual(["feculent"]);
    expect(manqueAuRepas(plat("roti-roule-herbes-fenouil").apports)).toEqual(["feculent"]);
  });

  test("un plat monté se suffit", () => {
    expect(estUnRepas(plat("pates-bolognaise").apports)).toBe(true);
    expect(estUnRepas(plat("poulet-roti").apports)).toBe(true);
  });

  test("la majorité du corpus est complète — sinon le terme punirait tout", () => {
    const jouables = catalogue.plats.filter((p) =>
      p.creneaux.some((c) => c === "dejeuner" || c === "diner"));
    const complets = jouables.filter((p) => estUnRepas(p.apports));
    expect(complets.length).toBeGreaterThan(jouables.length / 2);
  });
});

describe("le prix d'une brique", () => {
  test("il croît avec ce qui manque", () => {
    // Un rôti sans féculent est presque un dîner ; une pâte à pizza nue ne l'est
    // pas du tout. Les compter pareil rendrait le terme aveugle à la différence
    // qui a motivé son écriture.
    const un = incomplet([plat("roti-roule-herbes-fenouil")], poids).score;
    const deux = incomplet([plat("pate-a-pizza-pique-nique")], poids).score;
    expect(deux).toBeLessThan(un);
    expect(un).toBe(poids["repas_incomplet"]);
  });

  test("un repas complet ne paie rien", () => {
    expect(incomplet([plat("pates-bolognaise")], poids)).toMatchObject({ score: 0, dit: "" });
  });

  test("un prix, pas un interdit : la brique reste jouable", () => {
    // On a le droit de dîner d'une soupe. L'app doit seulement cesser de faire
    // comme si c'était un repas entier.
    const jeu = creerJeu(catalogue, 7, new Date("2026-08-28T12:00:00Z"));
    const slot = jeu.creneaux.findIndex((c) => c.repas === "diner");
    const cartes = offre(jeu, jeu.choix, slot);
    expect(cartes.some((c) => c.plat.id === "sauce-bolognaise")).toBe(true);
  });

  test("aucune brique dans les dix premières propositions", () => {
    // Le critère que l'utilisateur a posé : « il manque la moitié ». Une brique
    // peut être choisie, elle ne doit plus être SUGGÉRÉE comme un dîner entier.
    const jeu = creerJeu(catalogue, 7, new Date("2026-08-28T12:00:00Z"));
    const slot = jeu.creneaux.findIndex((c) => c.repas === "diner");
    const dix = offre(jeu, jeu.choix, slot).slice(0, 10);
    expect(dix.filter((c) => c.manqueAuRepas.length)).toHaveLength(0);
  });

  test("la carte porte la phrase, pas seulement le score", () => {
    const jeu = creerJeu(catalogue, 7, new Date("2026-08-28T12:00:00Z"));
    const slot = jeu.creneaux.findIndex((c) => c.repas === "diner");
    const c = offre(jeu, jeu.choix, slot).find((x) => x.plat.id === "sauce-bolognaise");
    expect(c?.ditLeManque).toBe("il manque un féculent");
  });
});

/* ─────────────────────────────────────────────────────────────── assembler */

describe("l'assiette, et pas le plat", () => {
  test("LA BOLOGNAISE AVEC DES PÂTES NE MANQUE PLUS DE RIEN", () => {
    // Le but du ticket, en une ligne. « Ce sont simplement des briques qu'il
    // faut assembler » : la sauce seule manque d'un féculent, la sauce avec les
    // pâtes est un dîner.
    expect(manqueALAssiette([plat("sauce-bolognaise")])).toEqual(["feculent"]);
    expect(manqueALAssiette([plat("sauce-bolognaise"), plat("pates-nature")])).toEqual([]);
  });

  test("le pilier est couvert dès qu'un seul plat l'apporte, jamais par addition", () => {
    // Mettre du pain à côté des pâtes ne rend pas le repas plus complet, et
    // deux féculents ne comblent pas la protéine qui manque à côté.
    const soupe = [plat("veloute-potiron"), plat("riz-nature"), plat("pain-a-table")];
    expect(manqueALAssiette(soupe)).toEqual(["proteine"]);
    expect(manqueALAssiette([...soupe, plat("oeufs-durs")])).toEqual([]);
  });

  test("une assiette vide ne manque de rien", () => {
    // Un créneau qu'on n'a pas rempli n'est pas un repas raté : c'est une
    // décision à prendre, et l'écran le dit déjà autrement.
    expect(manqueALAssiette([])).toEqual([]);
    expect(incomplet([], poids).score).toBe(0);
  });

  test("la brique complétée ne se paie plus", () => {
    const seule = incomplet([plat("roti-roule-herbes-fenouil")], poids).score;
    const servie = incomplet([plat("roti-roule-herbes-fenouil"), plat("riz-nature")], poids);
    expect(seule).toBe(poids["repas_incomplet"]);
    expect(servie).toMatchObject({ score: 0, dit: "" });
  });
});

describe("les briques du corpus", () => {
  const briques = catalogue.plats.filter((p) => p.accompagnement);

  test("elles couvrent les trois piliers qui manquaient", () => {
    // Le corpus vient d'un livre de cuisine : personne n'y écrit « faire cuire
    // des pâtes ». Le détail des manques a décidé de la liste, pas le goût —
    // 14 plats sans féculent, 11 sans protéine, 4 sans légumes.
    const apporte = (pilier: string) =>
      briques.filter((p) => comble(p.apports).includes(pilier as never)).length;
    expect(apporte("feculent")).toBeGreaterThanOrEqual(4);
    expect(apporte("proteine")).toBeGreaterThanOrEqual(2);
    expect(apporte("legumes")).toBeGreaterThanOrEqual(2);
  });

  test("AUCUNE NE DÉCLARE DE PROFIL", () => {
    // Le profil porte « varier les plaisirs » et se pénalise en cas de
    // répétition. Un accompagnement ne décide d'aucun format de repas : lui en
    // donner un ferait payer au plat principal une répétition que personne n'a
    // servie.
    expect(briques.filter((p) => p.apports.profil)).toHaveLength(0);
  });

  test("aucune ne produit de reste", () => {
    // Un accompagnement se cuisine à la taille du repas. La conséquence à
    // connaître : il ne peut pas être la source d'une offre de surproduction.
    expect(briques.filter((p) => p.emits.length)).toHaveLength(0);
  });

  test("AUCUNE NE REMONTE COMME PROPOSITION DE DÎNER", () => {
    // Sans le drapeau, le riz nature et le pain gagneraient la main : jouables
    // partout, presque gratuits. L'app proposerait un bol de riz en dîner — la
    // faute que T26 vient de corriger, refaite par l'autre bout.
    const jeu = creerJeu(catalogue, 7, new Date("2026-08-28T12:00:00Z"));
    const slot = jeu.creneaux.findIndex((c) => c.repas === "diner");
    expect(offre(jeu, jeu.choix, slot).filter((c) => c.plat.accompagnement)).toHaveLength(0);
  });
});

describe("ce qu'on propose pour compléter", () => {
  const jeu = () => creerJeu(catalogue, 7, new Date("2026-08-28T12:00:00Z"));
  const diner = (j: ReturnType<typeof jeu>) => j.creneaux.findIndex((c) => c.repas === "diner");

  test("sous une bolognaise, ce sont des féculents", () => {
    const j = jeu();
    const i = diner(j);
    j.choix[i] = "sauce-bolognaise";
    const trois = complements(j, i).slice(0, 3);
    expect(trois.every((c) => c.comble.includes("feculent"))).toBe(true);
    expect(trois.every((c) => c.restera.length === 0)).toBe(true);
  });

  test("LE GAIN VAUT EXACTEMENT LA PÉNALITÉ ANNULÉE", () => {
    // Aucun poids nouveau : la valeur d'une brique est la pénalité qu'elle
    // efface. Sans ça, les deux termes finiraient par ne plus se répondre.
    const j = jeu();
    const i = diner(j);
    j.choix[i] = "sauce-bolognaise";
    const riz = complements(j, i).find((c) => c.plat.id === "riz-nature")!;
    // Le riz est au bocal du garde-manger : rien de plus à acheter, donc le
    // gain ne se paie d'aucun marginal.
    expect(riz.marginal).toBe(0);
    expect(riz.score).toBe(-(poids["repas_incomplet"] ?? 0));
  });

  test("une soupe réclame deux briques, et l'app le dit", () => {
    const j = jeu();
    const i = diner(j);
    j.choix[i] = "veloute-potiron";
    const riz = complements(j, i).find((c) => c.plat.id === "riz-nature")!;
    expect(riz.comble).toEqual(["feculent"]);
    expect(riz.restera).toEqual(["proteine"]);
  });

  test("une brique déjà posée ne se propose plus, et le plat cesse de la réclamer", () => {
    const j = jeu();
    const i = diner(j);
    j.choix[i] = "sauce-bolognaise";
    j.accompagnements[i] = ["pates-nature"];
    expect(complements(j, i).some((c) => c.plat.id === "pates-nature")).toBe(false);
    // Le rôti proposé SUR ce créneau ne dit plus « il manque un féculent » : le
    // féculent y est déjà, et la carte note une assiette.
    const roti = offre(j, j.choix, i).find((c) => c.plat.id === "roti-roule-herbes-fenouil");
    expect(roti?.ditLeManque).toBe("");
  });

  test("du riz tous les soirs finit par se payer", () => {
    // Cinq accompagnements sur neuf sont des féculents : rien n'empêcherait de
    // poser du riz partout si la répétition ne comptait pas.
    const j = jeu();
    const soirs = j.creneaux.map((c, i) => ({ c, i })).filter((x) => x.c.repas === "diner");
    const [a, b, c] = [soirs[0]!, soirs[1]!, soirs[2]!];
    for (const s of [a, b, c]) j.choix[s.i] = "roti-roule-herbes-fenouil";
    const seul = complements(j, a.i).find((x) => x.plat.id === "riz-nature")!.score;
    j.accompagnements[a.i] = ["riz-nature"];
    j.accompagnements[b.i] = ["riz-nature"];
    const troisieme = complements(j, c.i).find((x) => x.plat.id === "riz-nature")!;
    expect(troisieme.score).toBeLessThan(seul);
    expect(troisieme.pourquoi.join(" ")).toContain("encore du riz");
  });
});
