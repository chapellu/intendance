import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { SEUIL_A_MANGER, SEUIL_URGENT } from "./axe";
import { lireCatalogue } from "./catalogue";
import { ecoulement, nom, PLAFOND_ARTICLES, type Ecoulable } from "./ecoulement";
import type { Catalogue } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const poids = catalogue.equilibre.poids;

const placard = (id: string, fraction: number): Ecoulable => ({ id, fraction, ou: "placard" });
const depot = (id: string, fraction: number): Ecoulable => ({ id, fraction, ou: "depot" });

describe("un seul barème pour tous les stocks", () => {
  test("LE PLACARD VAUT EXACTEMENT CE QU'IL VALAIT AVANT L'AXE", () => {
    // La promesse de T57, que T47 ne doit pas casser en passant : 0,4 ×
    // `ecoule: 5` rend l'ancien `ecoule_placard_entame: 2`, au point près, et 1,0
    // rend l'ancien `ecoule_placard_urgent: 5`. Ces deux blocs donnent une
    // ÉCHELLE au placard ; ils ne lui donnent pas un poids neuf. Le jour où l'on
    // voudra qu'il pèse plus, ça se décidera dans `equilibre.yaml`.
    expect(ecoulement([placard("pates", 0.4)], poids).score).toBe(2);
    expect(ecoulement([placard("pates", 1)], poids).score).toBe(5);
  });

  test("D'OÙ ÇA VIENT NE CHANGE PLUS RIEN AU CHIFFRE — c'est tout le ticket", () => {
    // La paire abandonnée classait par ENDROIT : un lot du frigo valait 5, un du
    // congélateur 5 + 3 (les deux tests étaient indépendants, et le catalogue
    // annonçait pourtant l'inverse). Deux choses également avancées dans leur vie
    // valent maintenant la même chose, où qu'elles soient rangées.
    const f = 0.7;
    expect(ecoulement([depot("sauce-bolognaise", f)], poids).score).toBe(
      ecoulement([placard("pates", f)], poids).score,
    );
  });

  test("un plat qui n'écoule rien ne gagne rien, et ne dit rien", () => {
    expect(ecoulement([], poids)).toMatchObject({ score: 0, articles: [], payes: 0, marque: "" });
  });

  test("LE SCORE CUMULE — trois articles valent trois fois un article", () => {
    // La règle « un seul bonus par plat » est abandonnée depuis T59. Elle
    // défendait contre le bruit des aromates ubiquitaires ; T60 les a retirés à
    // la source, et le remède n'a plus rien à soigner.
    const un = ecoulement([placard("a", 0.4)], poids).score;
    const trois = ecoulement(
      [placard("a", 0.4), placard("b", 0.4), depot("c", 0.4)],
      poids,
    ).score;
    expect(trois).toBe(3 * un);
  });

  test("PAS DE DÉGRESSIVITÉ : les trois premiers comptent plein", () => {
    const plein = [placard("a", 1), depot("b", 1), placard("c", 1)];
    expect(ecoulement(plein, poids).score).toBe(3 * (poids["ecoule"] ?? 0));
  });

  test("au-delà de trois articles le plat ne gagne plus rien", () => {
    // Le quatrième ne dit plus rien de neuf sur ce plat-là : il dit qu'il a une
    // longue liste d'ingrédients, et `article_marginal` la fait déjà payer.
    const trois = [placard("a", 1), placard("b", 1), depot("c", 1)];
    const cinq = [...trois, placard("d", 1), depot("e", 1)];
    expect(ecoulement(cinq, poids).score).toBe(ecoulement(trois, poids).score);
    expect(ecoulement(cinq, poids).payes).toBe(PLAFOND_ARTICLES);
    // Mais la LISTE, elle, dit tout ce que le plat écoule : la phrase ne ment pas
    // pour justifier le chiffre.
    expect(ecoulement(cinq, poids).articles).toHaveLength(5);
  });

  test("UN SEUL PLAFOND POUR LES DEUX STOCKS, jamais trois articles chacun", () => {
    // LE PIÈGE DE CE TICKET, et il ne se serait vu sur aucun écran. Laisser
    // `placardDuPlat` plafonner de son côté et le dépôt du sien aurait fait six
    // articles là où la règle en promet trois — le plafond aurait cessé d'être un
    // plafond sans qu'aucune ligne ne change de sens.
    const six = [
      placard("a", 1), placard("b", 1), placard("c", 1),
      depot("d", 1), depot("e", 1), depot("f", 1),
    ];
    expect(ecoulement(six, poids).score).toBe(3 * (poids["ecoule"] ?? 0));
  });

  test("le plafond coupe la queue de la liste, pas un article au hasard", () => {
    // Les plus pressés d'abord. Sans cet ordre, le plafond retiendrait ce que
    // l'ordre où les sources ont été empilées met en tête — un fait sur le code,
    // pas sur ce que le plat écoule. Et le placard passe toujours avant le dépôt
    // dans cette pile : sans tri, un bocal urgent perdrait sa place au profit
    // d'un paquet de biscottes.
    const e = ecoulement(
      [placard("tard", 0.4), depot("tot", 1), placard("milieu", 0.8), depot("hors", 0.1)],
      poids,
    );
    expect(e.articles.map((a) => a.id)).toEqual(["tot", "milieu", "tard", "hors"]);
    expect(e.score).toBe(11);
  });

  test("à égalité, l'ordre est stable — deux rendus donnent le même score", () => {
    const a = ecoulement([placard("zebre", 0.5), depot("abeille", 0.5)], poids);
    const b = ecoulement([depot("abeille", 0.5), placard("zebre", 0.5)], poids);
    expect(a.articles.map((x) => x.id)).toEqual(["abeille", "zebre"]);
    expect(b.articles).toEqual(a.articles);
  });

  test("UN ARTICLE COMPTE UNE FOIS, MÊME S'IL ARRIVE DEUX FOIS", () => {
    // Impossible sur le corpus d'aujourd'hui — le placard nomme des ingrédients
    // d'achat (`pates`) et le dépôt des sorties cuisinées (`sauce-bolognaise`),
    // et les deux vocabulaires ne se croisent pas. Traité quand même : le jour où
    // un type porterait le nom d'un ingrédient, un plat prendrait deux places sur
    // trois pour un seul objet, et rien ne le dirait. On garde le plus pressé.
    const e = ecoulement([placard("pates", 0.4), depot("pates", 0.9)], poids);
    expect(e.articles).toHaveLength(1);
    expect(e.articles[0]!.fraction).toBe(0.9);
  });

  test("le mot suit le même axe que le chiffre", () => {
    // `marque` n'est pas un rang à part : c'est le seuil de T57, franchi par le
    // plus pressé des articles. Un paquet entamé du placard (0,4) reste sous les
    // deux ; il faut le dépôt pour atteindre le haut, et c'est très exactement ce
    // que T47 vient brancher.
    expect(ecoulement([placard("pates", 0.4)], poids).marque).toBe("");
    expect(ecoulement([depot("x", SEUIL_A_MANGER)], poids).marque).toBe("à manger");
    expect(ecoulement([depot("x", SEUIL_URGENT)], poids).marque).toBe("urgent");
    // Le plus pressé commande, pas le premier arrivé ni la moyenne.
    expect(ecoulement([placard("pates", 0.4), depot("x", 1)], poids).marque).toBe("urgent");
  });

  test("les noms sortent lisibles, pas en identifiants", () => {
    expect(nom(placard("poudre-amande", 0.4))).toBe("poudre amande");
    expect(nom(depot("sauce-bolognaise", 1))).toBe("sauce bolognaise");
  });
});

describe("reconstituer est un forfait, écouler est une rampe", () => {
  // LE POINT DE BASCULE EST MESURÉ, PAS DÉCRÉTÉ — c'est la promesse de T47 :
  // « tôt dans la vie d'un lot reconstituer gagne, tard écouler gagne, et
  // l'arbitrage cesse d'être une règle ». Ces tests lisent les poids ; ils
  // tomberont si l'un d'eux bouge, et c'est ce qu'on leur demande — la phrase
  // écrite dans `ecoulement.ts` et dans `equilibre.yaml` devra alors être relue
  // plutôt que recopiée.
  const bascule = (cle: string) => (poids[cle] ?? 0) / (poids["ecoule"] ?? 1);

  test("écouler passe devant le plancher par type à 0,60 de vie consommée", () => {
    expect(bascule("plancher_type")).toBeCloseTo(0.6, 10);
  });

  test("ET DEVANT LE PLANCHER DE SECOURS EXACTEMENT AU SEUIL « URGENT »", () => {
    // 0,80 est `SEUIL_URGENT`. Les quatre nombres — `ecoule`, `plancher_congelo`,
    // `chaine_couverte` et le seuil de Don't Starve — ont été posés à vue, à des
    // mois d'écart, sans que personne ne vise cet alignement. C'est donc un
    // CONSTAT sur les valeurs d'aujourd'hui, pas un invariant à défendre. Ce
    // qu'il dit : le plat qui recharge le tiroir d'urgence gagne, jusqu'au jour
    // où le bocal qu'on remplacerait franchit la ligne « urgent ».
    expect(bascule("plancher_congelo")).toBeCloseTo(SEUIL_URGENT, 10);
    expect(bascule("chaine_couverte")).toBeCloseTo(SEUIL_URGENT, 10);
  });

  test("un seul article ne passe JAMAIS devant une protéine qui manque", () => {
    // Il faudrait une fraction de 1,20, et `Vie.fraction` plafonne à 1. Écouler
    // départage donc toujours deux plats également bons quand il n'y en a qu'un à
    // écouler ; il ne commande qu'à partir de deux, et c'est assumé (Workspace#41
    // demande d'encourager « au maximum » l'utilisation des stocks).
    expect(bascule("proteine_manquante")).toBeGreaterThan(1);
    expect(ecoulement([depot("x", 1)], poids).score).toBeLessThan(poids["proteine_manquante"]!);
  });

  test("LA PAIRE ABANDONNÉE N'EST PLUS AU CATALOGUE", () => {
    // `ecoule_frigo` et `ecoule_congelo` sont supprimés COMME PAIRE : ils ne se
    // lisaient que l'un par rapport à l'autre, et en retirer un seul aurait laissé
    // un barème par endroit avec une seule case.
    expect(poids["ecoule_frigo"]).toBeUndefined();
    expect(poids["ecoule_congelo"]).toBeUndefined();
    expect(poids["ecoule"]).toBeGreaterThan(0);
  });
});
