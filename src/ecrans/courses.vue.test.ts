import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, test } from "vitest";
import { base, cleDeLArticle, cocher, lireCourses, rentrer, rentrerLesCoches } from "../db";
import { articles, calculer, type Calcul } from "../model/calcul";
import { lireCatalogue } from "../model/catalogue";
import { creerJeu, type Jeu } from "../model/jeu";
import type { Catalogue } from "../model/types";
import { UNITE_PLANCHER, type LignePlancher } from "../model/plancherGardeManger";
import {
  basculeDe,
  horsListe,
  marque,
  phraseDuPlancher,
  quantiteDeLArticle,
  vueDesCourses,
} from "./courses.vue";

const LUNDI = new Date("2026-08-17T12:00:00Z");
const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);

let jeu: Jeu;
let calc: Calcul;
beforeEach(async () => {
  jeu = creerJeu(catalogue, 7, LUNDI);
  const i = jeu.creneaux.findIndex((c) => c.jour === 0 && c.repas === "diner");
  jeu.choix[i] = "lasagnes";
  const j = jeu.creneaux.findIndex((c) => c.jour === 1 && c.repas === "diner");
  jeu.choix[j] = "poulet-roti";
  calc = calculer(jeu);
  await base.courses.clear();
});

const vue = async () => vueDesCourses(catalogue, calc.panier, await lireCourses(base));

describe("la liste", () => {
  test("elle est calculée, pas stockée : rien en base ne la fabrique", async () => {
    const v = await vue();
    expect(v.articles.length).toBe(articles(calc.panier).length);
    expect(await base.courses.count()).toBe(0);
  });

  test("elle suit l'ordre du magasin, et personne ne disparaît", async () => {
    const v = await vue();
    expect(v.rayons.length).toBeGreaterThan(1);
    // Chaque article de la liste appartient à exactement un rayon.
    expect(v.rayons.flatMap((r) => r.articles).length).toBe(v.articles.length);
  });
});

describe("cocher n'est pas rentrer", () => {
  test("au magasin, le doigt coche ; à la maison, il rentre", () => {
    const a = { cle: "x", ligne: {} as never, coche: false, rentre: false, plancher: null };
    expect(basculeDe("magasin", a)).toEqual({ rentrer: false, valeur: true });
    expect(basculeDe("maison", a)).toEqual({ rentrer: true, valeur: true });
    // Et la puce s'allume sur l'état du mode où l'on est, pas sur l'autre.
    expect(marque("magasin", { ...a, coche: true })).toBe(true);
    expect(marque("maison", { ...a, coche: true })).toBe(false);
  });

  test("rentrer un article le sort du caddie", async () => {
    const cle = cleDeLArticle(articles(calc.panier)[0]!);
    await cocher(base, cle, true);
    expect((await vue()).coches).toBe(1);
    await rentrer(base, cle, true);
    const v = await vue();
    expect(v.coches).toBe(0);
    expect(v.rentres).toBe(1);
  });

  test("« tout rentrer » vide le caddie d'un coup", async () => {
    const arts = articles(calc.panier).slice(0, 3);
    for (const a of arts) await cocher(base, cleDeLArticle(a), true);
    expect(await rentrerLesCoches(base)).toBe(3);
    const v = await vue();
    expect(v.coches).toBe(0);
    expect(v.rentres).toBe(3);
  });

  test("les deux états survivent au rechargement — c'est tout le sujet", async () => {
    // Une liste qu'on met en poche entre deux rayons et qui se vide au retour
    // n'est pas une liste.
    const cle = cleDeLArticle(articles(calc.panier)[0]!);
    await cocher(base, cle, true);
    const relu = await lireCourses(base);
    expect(relu.get(cle)?.coche).toBe(true);
  });
});

describe("les orphelins", () => {
  test("un état qui ne correspond plus à aucun article se compte", async () => {
    await cocher(base, "quelque-chose-de-la-semaine-derniere|g", true);
    const v = await vue();
    expect(v.orphelins).toBe(1);
    // Et il ne se glisse pas dans la liste affichée.
    expect(v.articles.some((a) => a.cle.startsWith("quelque-chose"))).toBe(false);
  });

  test("un état ni coché ni rentré n'est pas un orphelin, c'est un vide", async () => {
    await cocher(base, "vieux|g", true);
    await cocher(base, "vieux|g", false);
    expect((await vue()).orphelins).toBe(0);
  });
});

/* ═══════════ T41 — ce qui est sous son plancher EST la liste Carrefour ════ */

/** Une ligne de plancher, réduite à ce que la vue en regarde. */
const sous = (p: Partial<LignePlancher> & { ingredient: string }): LignePlancher => ({
  nom: p.ingredient.replace(/-/g, " "),
  niveau: 2,
  a: 0,
  manque: 2,
  confiance: "sur",
  vuLe: "2026-08-26",
  usage: null,
  ...p,
});

describe("T41 — la liste vit sans plan", () => {
  test("une denrée sous son plancher entre dans la liste sans qu'aucun plat la demande", async () => {
    // LA PROMESSE ENTIÈRE DU TICKET. `graines-courge` n'est cité par aucune des
    // 86 recettes : il n'existe donc aucun chemin par lequel la semaine puisse
    // le faire apparaître. S'il est dans la liste, c'est le plancher.
    const avant = await vue();
    expect(avant.articles.some((a) => a.ligne.id === "graines-courge")).toBe(false);

    const v = vueDesCourses(catalogue, calc.panier, await lireCourses(base), [
      sous({ ingredient: "graines-courge", usage: "apero" }),
    ]);
    const ligne = v.articles.find((a) => a.ligne.id === "graines-courge");
    expect(ligne).toBeDefined();
    expect(ligne!.ligne.n).toBe(0);
    expect(ligne!.plancher?.usage).toBe("apero");
    expect(v.parPlancher).toBe(1);
  });

  test("elle se range dans son rayon, pas dans une section à part", async () => {
    // Un rayon se traverse UNE FOIS. Une seconde liste obligerait à revenir sur
    // ses pas devant les conserves.
    const v = vueDesCourses(catalogue, calc.panier, await lireCourses(base), [
      sous({ ingredient: "graines-courge" }),
    ]);
    const rayon = v.rayons.find((r) => r.articles.some((a) => a.ligne.id === "graines-courge"));
    expect(rayon?.nom).toBe("épicerie");
  });

  test("un ingrédient que la semaine réclame DÉJÀ ne fait pas une seconde ligne", async () => {
    // Sinon on achèterait deux fois, ce qu'une liste de courses n'a pas le droit
    // de faire. La demande de la semaine porte la ligne, le plancher l'annote.
    const deja = articles(calc.panier)[0]!;
    const v = vueDesCourses(catalogue, calc.panier, await lireCourses(base), [
      sous({ ingredient: deja.id }),
    ]);
    const lignes = v.articles.filter((a) => a.ligne.id === deja.id);
    expect(lignes.length).toBe(1);
    expect(lignes[0]!.plancher).not.toBeNull();
    // Et la ligne reste celle de la semaine : sa quantité n'a pas été remplacée.
    expect(lignes[0]!.ligne.unit).toBe(deja.unit);
    expect(v.parPlancher).toBe(0);
  });

  test("le panier rendu porte les lignes de plancher — sinon rentrer ne range rien", async () => {
    // C'est `panier` qui donne sa quantité à un article au moment où il entre au
    // stock (T27). Sans les lignes de plancher dedans, cocher « 2 boîtes » puis
    // les rentrer ne mettrait rien dans le placard, et le plancher les
    // redemanderait le lendemain.
    const v = vueDesCourses(catalogue, calc.panier, await lireCourses(base), [
      sous({ ingredient: "graines-courge" }),
    ]);
    const ligne = v.panier.get(`graines-courge|${UNITE_PLANCHER}`);
    expect(ligne).toBeDefined();
    expect(ligne!.qty).toBe(2);
  });

  test("cocher une ligne de plancher n'atteint aucune ligne de la semaine", async () => {
    // La clé est `id|unité`, et le corpus n'emploie pas ce mot : les deux états
    // ne peuvent pas se marcher dessus.
    const v = vueDesCourses(catalogue, calc.panier, await lireCourses(base), [
      sous({ ingredient: "graines-courge" }),
    ]);
    const cle = v.articles.find((a) => a.ligne.id === "graines-courge")!.cle;
    await cocher(base, cle, true);
    const apres = vueDesCourses(catalogue, calc.panier, await lireCourses(base), [
      sous({ ingredient: "graines-courge" }),
    ]);
    expect(apres.coches).toBe(1);
    expect(apres.articles.filter((a) => a.coche).map((a) => a.ligne.id)).toEqual([
      "graines-courge",
    ]);
  });

  test("la phrase dit le placard, jamais « 0 plat »", () => {
    const p = sous({ ingredient: "mais", a: 1, niveau: 3, manque: 2 });
    expect(phraseDuPlancher(p, 0)).toBe("sous son plancher — 1 sur 3");
    // Quand la semaine en demande aussi, les deux raisons se disent.
    expect(phraseDuPlancher(p, 2)).toBe("2 plats · sous son plancher — 1 sur 3");
    // Et un chiffre qu'on n'a pas vu récemment ne se donne pas pour sûr.
    expect(phraseDuPlancher({ ...p, confiance: "probable" }, 0)).toContain("à vérifier");
  });

  test("les unités d'achat s'accordent, les grammes non", () => {
    expect(quantiteDeLArticle({ id: "x", nom: "x", qty: 2, unit: UNITE_PLANCHER, n: 0 }))
      .toBe("2 unités");
    expect(quantiteDeLArticle({ id: "x", nom: "x", qty: 1, unit: UNITE_PLANCHER, n: 0 }))
      .toBe("1 unité");
    expect(quantiteDeLArticle({ id: "x", nom: "x", qty: 500, unit: "g", n: 1 })).toBe("500 g");
  });
});

describe("le hors-liste", () => {
  test("ce qui ne s'achète pas est nommé en français, jamais « courses »", () => {
    const h = horsListe(catalogue, calc.provenances);
    expect(h.length).toBeGreaterThan(0);
    for (const [label, n] of h) {
      expect(label).not.toBe("courses");
      expect(n).toBeGreaterThan(0);
      // Le libellé vient du catalogue, pas d'un identifiant recraché tel quel.
      expect(Object.values(catalogue.provenances)).toContain(label);
    }
  });

  test("une provenance à zéro ne s'affiche pas", () => {
    expect(horsListe(catalogue, { placard: 0, frigo: 2 })).toEqual([
      [catalogue.provenances.frigo, 2],
    ]);
  });
});
