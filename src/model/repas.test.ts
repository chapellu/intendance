import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { ditLeManque, estUnRepas, incomplet, manqueAuRepas } from "./repas";
import { offre } from "./scoring";
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
    const un = incomplet(plat("roti-roule-herbes-fenouil"), poids).score;
    const deux = incomplet(plat("pate-a-pizza-pique-nique"), poids).score;
    expect(deux).toBeLessThan(un);
    expect(un).toBe(poids["repas_incomplet"]);
  });

  test("un repas complet ne paie rien", () => {
    expect(incomplet(plat("pates-bolognaise"), poids)).toMatchObject({ score: 0, dit: "" });
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
