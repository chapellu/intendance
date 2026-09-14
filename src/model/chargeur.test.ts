// CE QUE LE CHARGEUR CESSAIT DE JETER — l'écart de port n° 2.
//
// Le premier écart était celui des cinq réglages parsés et jamais lus (#43,
// #45, #50) ; celui-ci est de la même espèce mais c'est l'UTILISATEUR qui l'a
// trouvé, en cuisinant :
//
//   « J'ai fait les lentilles et si j'avais suivi bêtement les étapes j'aurais
//   attendu 30 minutes que les lentilles soient cuites avant de faire cuire les
//   carottes. »
//
// `lentilles-mijotees` porte pourtant `parallel_with: lancer-mijotage` sur
// l'étape des carottes. Le champ est écrit à la main, validé par `verifier.py`,
// lu par `compile.py`, exclu de la somme des gestes par `anticipation.py`,
// exporté sous `enParallele` — et `Etape` ne le déclarait pas. Le guide a fait
// attendre un temps que sa propre donnée disait de ne pas attendre.
//
// CE FICHIER TIENT DES PROMESSES, IL NE FIGE PAS DES TAILLES. Les comptes du
// corpus s'impriment avec `npm run chargeur` et bougeront à la prochaine
// recette saisie ; les figer ici ferait rougir la suite pour une bonne
// nouvelle. Ce qui est épinglé ci-dessous, c'est ce qui doit rester vrai quel
// que soit le corpus — et, sur les quatre champs, le fait qu'il en reste AU
// MOINS un porteur, parce que zéro porteur voudrait dire que le chargeur a
// recommencé à jeter.

import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import type { Catalogue, Etape } from "./types";

const brut = JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown;
const catalogue: Catalogue = lireCatalogue(brut);
const etapes: Etape[] = catalogue.plats.flatMap((p) => p.steps);

/** Le plat par lequel l'utilisateur a trouvé le trou. Il sert de témoin : tant
 *  qu'il est au catalogue, c'est sur lui qu'on vérifie, pas sur un plat tiré au
 *  hasard — « changer un classement change ce qu'un parcours traverse ». */
const LENTILLES = catalogue.plats.find((p) => p.id === "lentilles-mijotees");

describe("les quatre champs que l'export porte et que l'app jetait", () => {
  test("le chargeur les fait exister, et le corpus en porte", () => {
    expect(etapes.filter((e) => e.uses !== null).length).toBeGreaterThan(0);
    expect(etapes.filter((e) => e.enParallele !== null).length).toBeGreaterThan(0);
    expect(etapes.filter((e) => e.attente !== null).length).toBeGreaterThan(0);
    expect(etapes.filter((e) => e.rattrapage !== null).length).toBeGreaterThan(0);
  });

  test("les carottes de la plainte savent enfin qu'elles tournent avec le mijotage", () => {
    expect(LENTILLES).toBeDefined();
    const enParallele = LENTILLES!.steps.filter((e) => e.enParallele !== null);
    expect(enParallele.length).toBeGreaterThan(0);
    // La cible est une étape du MÊME plat — c'est tout ce que le modèle promet.
    // Ce que l'écran en FAIT reste ouvert sur Workspace#57 : ce bloc ne dessine
    // rien, exprès.
    for (const e of enParallele)
      expect(LENTILLES!.steps.map((s) => s.id)).toContain(e.enParallele);
  });
});

describe("`uses` : l'absence est une donnée, pas un vide", () => {
  // LA PROMESSE QUI COÛTE LE PLUS CHER À TENIR, et la seule raison pour
  // laquelle `uses` n'est pas un `string[]`. `[]` = « rien à verser ici », on
  // remue, on enfourne. `null` = « la recette n'a pas encore le lien ». Un
  // écran qui confond les deux promet qu'une étape ne consomme rien alors
  // qu'on l'ignore — le mensonge plausible que ce chargeur existe pour
  // attraper. `export_json.py` l'écrit déjà en commentaire ; ici on le tient.
  test("le chargeur garde les deux, et le corpus contient les deux", () => {
    expect(etapes.some((e) => e.uses === null)).toBe(true);
    expect(etapes.some((e) => e.uses?.length === 0)).toBe(true);
  });

  // CE TEST A TROUVÉ LE CINQUIÈME CHAMP JETÉ, et c'est pour ça qu'il vise `ref`
  // et non `id`. Écrit d'abord contre `id`, il rougissait sur 29 des 357
  // références, réparties sur 9 plats : `farine-pate`, `sel-farce`,
  // `huile-garniture`… Onze plats du corpus portent deux lignes d'un même id —
  // la farine de la pâte et celle de la crème — et c'est exactement ce que
  // `ref` existe pour distinguer. `export_json.py` la porte depuis toujours ;
  // `ingredient()` ne la lisait pas. Livrer `uses` sans elle, c'était livrer un
  // lien mort sur un plat sur quinze.
  test("un `uses` non vide ne nomme que des lignes du plat", () => {
    for (const p of catalogue.plats) {
      const lignes = new Set(p.ingredients.map((i) => i.ref));
      for (const e of p.steps)
        for (const ref of e.uses ?? [])
          expect(
            lignes.has(ref),
            `${p.id}/${e.id} : \`uses\` cite ${ref}, absent des lignes`,
          ).toBe(true);
    }
  });

  // LA RÈGLE EST CONDITIONNELLE, et ce test l'a réapprise en rougissant : écrit
  // d'abord comme « deux lignes d'un même id portent toujours deux `ref` », il
  // tombait sur `petits-pots-creme-glacee` et `quiche-faisselle-cebettes`, qui
  // doublent un id sans porter le moindre `uses`. `verifier.py:231` ne réclame
  // un `ref` que là où `uses` existe — sans étape qui cite une ligne, rien n'a
  // besoin de les distinguer, et en exiger deux serait de la cérémonie. Onze
  // plats doublent un id ; neuf ont des `uses`, et ce sont ces neuf-là qui
  // doivent lever l'ambiguïté.
  test("`ref` distingue ce que `id` confond, partout où une étape cite", () => {
    const ambigus = catalogue.plats.filter(
      (p) =>
        new Set(p.ingredients.map((i) => i.id)).size < p.ingredients.length &&
        p.steps.some((e) => e.uses?.length),
    );
    expect(ambigus.length).toBeGreaterThan(0);
    for (const p of ambigus)
      expect(
        new Set(p.ingredients.map((i) => i.ref)).size,
        `${p.id} : deux lignes partagent un \`ref\`, et une étape les cite`,
      ).toBe(p.ingredients.length);
  });
});

describe("l'attente, seconde horloge", () => {
  test("une attente est un nombre de minutes, jamais zéro ni négative", () => {
    for (const e of etapes) if (e.attente !== null) expect(e.attente).toBeGreaterThan(0);
  });

  // `attenteSouple` a un défaut à `true` côté Python et l'export le résout
  // toujours : le chargeur exige donc le booléen plutôt que de re-défaulter, et
  // une étape sans attente le porte quand même — il ne décrit pas l'attente, il
  // décrit ce qui se passe si on la dépasse.
  test("la souplesse est toujours dite, et la rigidité est rare", () => {
    for (const e of etapes) expect(typeof e.attenteSouple).toBe("boolean");
    expect(etapes.filter((e) => !e.attenteSouple).length).toBeLessThan(etapes.length / 2);
  });
});

describe("le rattrapage traverse le snake_case", () => {
  // `export_json.py` recopie l'objet YAML tel quel au lieu de le recomposer
  // champ par champ comme il le fait partout ailleurs : `cout_min` arrive au
  // milieu de `attenteRaison` et `porteAssaisonnement`. Le chargeur traduit, et
  // c'est son travail — mais la traduction est exactement le genre de chose
  // qu'un renommage en amont casserait en silence.
  test("`cout_min` devient `coutMin`, et il chiffre un vrai repli", () => {
    const avec = etapes.filter((e) => e.rattrapage !== null);
    expect(avec.length).toBeGreaterThan(0);
    for (const e of avec) {
      expect(e.rattrapage!.coutMin).toBeGreaterThan(0);
      expect(e.rattrapage!.action.length).toBeGreaterThan(0);
      expect(e.rattrapage!.effet.length).toBeGreaterThan(0);
    }
  });

  test("un repli coûte moins de temps que l'attente qu'il remplace", () => {
    // Sinon ce n'est pas un repli. Les six du corpus sont des trempages : 720
    // minutes de nuit deviennent 60 de pousse à température ambiante. Si cette
    // promesse tombe un jour, c'est la recette qu'il faut relire, pas le test.
    for (const e of etapes)
      if (e.rattrapage && e.attente)
        expect(
          e.rattrapage.coutMin,
          `${e.id} : le repli coûte ${e.rattrapage.coutMin} min pour une attente de ${e.attente}`,
        ).toBeLessThan(e.attente);
  });
});

describe("`enParallele` est une référence, donc elle se vérifie à la frontière", () => {
  // ÉPROUVÉ NON VIDE : un id mort ne lèverait rien sans ce mur, il produirait
  // un appariement silencieusement vide et le guide remettrait les deux gestes
  // à la queue leu leu — le bug d'origine, revenu par une autre porte.
  test("un plat qui vise une étape inexistante est refusé au chargement", () => {
    const copie = JSON.parse(JSON.stringify(brut)) as {
      plats: { id: string; steps: { id: string; enParallele: string | null }[] }[];
    };
    const cible = copie.plats.find((p) => p.steps.some((s) => s.enParallele !== null));
    expect(cible).toBeDefined();
    const fautive = cible!.steps.find((s) => s.enParallele !== null)!;
    fautive.enParallele = "une-etape-qui-n-existe-pas";
    expect(() => lireCatalogue(copie)).toThrow(/enParallele/);
  });

  test("aucune étape du corpus ne se vise elle-même", () => {
    // Une étape en parallèle d'elle-même passerait le test d'existence et
    // bouclerait n'importe quel affichage qui suit le lien.
    for (const e of etapes) expect(e.enParallele).not.toBe(e.id);
  });
});
