import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { CatalogueInvalide, lireCatalogue } from "./catalogue";

// Le test lit le VRAI export, pas une maquette. Une maquette ne dérive jamais ;
// c'est précisément la dérive de l'export que ce chargeur est là pour attraper.
const brut = () => JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown;

describe("le catalogue réel", () => {
  test("se lit sans lever", () => {
    const c = lireCatalogue(brut());
    expect(c.plats.length).toBeGreaterThan(40);
    expect(c.foyer.parts).toBeGreaterThan(0);
    expect(c.creneaux.repas["diner"]).toBeDefined();
  });

  test("porte les trois espaces, chacun avec ses deux plafonds", () => {
    const { espaces } = lireCatalogue(brut()).foyer;
    for (const e of ["frigo", "congelo", "placard"] as const) {
      expect(espaces[e].places).toBeGreaterThan(0);
      expect(espaces[e].contenants).toBeGreaterThan(0);
    }
  });

  test("chaque plat sait ce qu'il produit et ce qu'il attend", () => {
    for (const p of lireCatalogue(brut()).plats) {
      expect(Array.isArray(p.emits)).toBe(true);
      expect(Array.isArray(p.accepts)).toBe(true);
      expect(p.portions).toBeGreaterThan(0);
    }
  });

  // AUCUN PLAT NE SE SERT SANS SES ÉTAPES, et c'est l'utilisateur qui a dû le
  // dire : « tu m'as encore fourni une recette sans étapes » (14/09/2026),
  // devant les gnocchis poêlés, à l'heure de les faire.
  //
  // Le dépôt le savait, en une ligne, depuis le début — `catalogue.py` :
  // « a plan-level entry has no steps: it can be planned, not cooked ». Quinze
  // plats de `_repertoire.yaml` étaient entrés à ce niveau-là, `verifier.py`
  // les comptait en clair dans sa dernière ligne, et RIEN entre ce compte et
  // l'écran n'en tenait compte : la fiche les ouvrait sur leur liste
  // d'ingrédients, un bouton « Terminer », et pas un mot pour dire pourquoi.
  // #50 avait déjà croisé ces quinze-là — mais pour un autre symptôme, le
  // stock qui ne descendait pas — et avait réparé le bouton sans voir que le
  // trou était la recette.
  //
  // LA SAISIE « NIVEAU PLAN » RESTE LÉGITIME : c'est elle qui a permis
  // d'atteindre les trente plats sans lesquels le choix ne veut rien dire. Ce
  // test ne l'interdit pas, il interdit de la LIVRER — un plat entré en trente
  // secondes doit avoir ses étapes avant d'atteindre l'export, ou l'app doit
  // apprendre à dire qu'il n'en a pas. Tant que le second chemin n'existe pas,
  // c'est le premier qui tient, et ce test est ce qui le tient.
  test("aucun plat ne peut se cuisiner sans étapes", () => {
    const muets = lireCatalogue(brut())
      .plats.filter((p) => p.steps.length === 0)
      .map((p) => p.id);
    expect(muets, `${muets.length} plat(s) servis sans étapes : ${muets.join(", ")}`).toEqual([]);
  });

  test("les identifiants de plats sont uniques", () => {
    const ids = lireCatalogue(brut()).plats.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// Chaque cas ci-dessous est une façon dont l'export peut dériver sans que rien
// ne casse visiblement — et produire un écran faux plutôt qu'une erreur.
describe("un export qui a dérivé échoue bruyamment", () => {
  const abime = (f: (c: Record<string, unknown>) => void) => {
    const c = brut() as Record<string, unknown>;
    f(c);
    return () => lireCatalogue(c);
  };

  test("un espace inconnu sur une sortie", () => {
    const casse = abime((c) => {
      const plats = c["plats"] as Record<string, unknown>[];
      const p = plats.find((x) => (x["emits"] as unknown[]).length > 0)!;
      (p["emits"] as Record<string, unknown>[])[0]!["espace"] = "cellier";
    });
    expect(casse).toThrow(CatalogueInvalide);
    expect(casse).toThrow(/espace/);
  });

  test("un plat à zéro portion — le facteur d'échelle divise par là", () => {
    const casse = abime((c) => {
      (c["plats"] as Record<string, unknown>[])[0]!["portions"] = 0;
    });
    expect(casse).toThrow(/portions/);
  });

  test("une quantité passée en chaîne", () => {
    const casse = abime((c) => {
      const p = (c["plats"] as Record<string, unknown>[])[0]!;
      (p["ingredients"] as Record<string, unknown>[])[0]!["qty"] = "400";
    });
    expect(casse).toThrow(/qty/);
  });

  test("un NaN, qui contaminerait chaque somme qu'il touche", () => {
    const casse = abime((c) => {
      (c["plats"] as Record<string, unknown>[])[0]!["minutes"] = Number.NaN;
    });
    expect(casse).toThrow(/nombre fini/);
  });

  test("le dîner disparu de la configuration", () => {
    const casse = abime((c) => {
      const cr = c["creneaux"] as Record<string, unknown>;
      const repas = { ...(cr["repas"] as Record<string, unknown>) };
      delete repas["diner"];
      cr["repas"] = repas;
    });
    expect(casse).toThrow(/diner/);
  });

  test("une date de naissance illisible sur une ligne de stock", () => {
    const casse = abime((c) => {
      (c["stock"] as Record<string, unknown>[])[0]!["born"] = "le 6 août";
    });
    expect(casse).toThrow(/date ISO/);
  });

  test("un `accepts` qui ne vise ni sortie ni classe", () => {
    const casse = abime((c) => {
      const plats = c["plats"] as Record<string, unknown>[];
      const p = plats.find((x) => (x["accepts"] as unknown[]).length > 0)!;
      const a = (p["accepts"] as Record<string, unknown>[])[0]!;
      a["type"] = null;
      a["kind"] = null;
    });
    expect(casse).toThrow(/type. ou un .kind/);
  });

  test("le chemin fautif est dans le message", () => {
    const casse = abime((c) => {
      (c["plats"] as Record<string, unknown>[])[3]!["titre"] = 42;
    });
    expect(casse).toThrow(/plats\[3\]\.titre/);
  });
});
