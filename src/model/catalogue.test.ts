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

  // `cuisinable` ET `steps` NE PEUVENT PAS SE CONTREDIRE, et c'est tout ce
  // qu'on exige du corpus sur ce point.
  //
  // LA PROMESSE PRÉCÉDENTE ÉTAIT PLUS FORTE ET ELLE A ÉTÉ RETIRÉE : « aucun
  // plat ne peut se cuisiner sans étapes » interdisait de LIVRER une saisie
  // « niveau plan ». C'était le deuxième des trois chemins ; l'utilisateur a
  // choisi le troisième le 15/09/2026 — proposer en le disant — et la saisie en
  // trente secondes redevient donc utilisable de bout en bout. Garder les deux
  // reviendrait à rendre l'affichage inatteignable pour toujours.
  //
  // Ce qui reste, c'est l'unique vérité : le drapeau déclaré et les étapes
  // portées disent la même chose. `sansRecette()` lit le drapeau ; s'ils
  // divergeaient, l'écran annoncerait « sans recette écrite » sur un plat qui a
  // ses étapes, ou se tairait sur un plat qui n'en a pas.
  test("aucun plat ne se déclare cuisinable autrement que ses étapes", () => {
    for (const p of lireCatalogue(brut()).plats)
      expect(p.cuisinable, `${p.id} porte ${p.steps.length} étape(s)`).toBe(p.steps.length > 0);
  });

  // LA TABLE DES OUTILS ÉTAIT EXPORTÉE ET JETÉE ICI — même geste que les six
  // champs d'étape de T72. Ce test épingle qu'elle traverse, et qu'elle couvre
  // vraiment le vocabulaire de `needs` : une capacité absente de la table
  // produirait une étape muette plutôt qu'une erreur.
  test("chaque capacité que les étapes réclament a son entrée dans la table", () => {
    const c = lireCatalogue(brut());
    const besoins = new Set(c.plats.flatMap((p) => p.steps.flatMap((e) => e.needs)));
    expect(besoins.size).toBeGreaterThan(0);
    for (const n of besoins) expect(c.foyer.outils[n]).toBeDefined();
  });

  test("chaque plat porte un rôle, et le corpus en montre plusieurs", () => {
    const plats = lireCatalogue(brut()).plats;
    const roles = new Set(plats.map((p) => p.role));
    expect(roles.size).toBeGreaterThan(1);
    expect(roles.has("plat")).toBe(true);
    // Le défaut est résolu À L'EXPORT : aucun plat ne peut arriver sans rôle.
    for (const p of plats) expect(p.role, p.id).toBeTruthy();
  });

  // L'ASSIETTE TRAVERSE, ET SON ABSENCE AUSSI. Un plat muet rend `[]` — « la
  // recette ne dit pas avec quoi la servir » — et surtout pas une erreur : 120
  // des 138 plats sont dans ce cas, et le seront longtemps.
  test("l’accompagnement traverse l’export, et se tait quand il n’y en a pas", () => {
    const plats = lireCatalogue(brut()).plats;
    const escalopes = plats.find((p) => p.id === "escalopes-emmental-champignons")!;
    expect(escalopes.avec.map((a) => a.id)).toEqual(["riz", "salade-verte"]);
    expect(escalopes.avec[0]).toMatchObject({ nom: "riz", qty: 300, unit: "g" });
    expect(plats.find((p) => p.id === "gratin-de-pates-tomates")!.avec).toEqual([]);
    for (const p of plats) expect(Array.isArray(p.avec)).toBe(true);
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

  // LES DEUX SENS, PARCE QUE LES DEUX MENTENT DIFFÉREMMENT. Un plat qui a ses
  // étapes mais se déclare non cuisinable porterait « sans recette écrite » à
  // l'écran au-dessus d'un guide complet ; l'inverse rouvre exactement la
  // plainte du 14/09 — une fiche vide qui ne dit pas pourquoi.
  test("un plat qui a ses étapes et se déclare non cuisinable", () => {
    const casse = abime((c) => {
      const plats = c["plats"] as Record<string, unknown>[];
      plats.find((x) => (x["steps"] as unknown[]).length > 0)!["cuisinable"] = false;
    });
    expect(casse).toThrow(CatalogueInvalide);
    expect(casse).toThrow(/cuisinable/);
  });

  test("un plat sans étapes qui se déclare cuisinable", () => {
    const casse = abime((c) => {
      const p = (c["plats"] as Record<string, unknown>[])[0]!;
      p["steps"] = [];
      p["cuisinable"] = true;
    });
    expect(casse).toThrow(/cuisinable/);
  });

  // Un `label` renommé en amont passerait en `undefined` et l'écran dirait
  // « Outil : » suivi de rien — le mensonge plausible que ce chargeur existe
  // pour attraper. `null` reste licite : c'est « aucun outil du foyer ».
  test("un outil dont le libellé a disparu", () => {
    const casse = abime((c) => {
      const foyer = c["foyer"] as Record<string, unknown>;
      const outils = foyer["outils"] as Record<string, Record<string, unknown>>;
      delete outils[Object.keys(outils)[0]!]!["label"];
    });
    expect(casse).toThrow(CatalogueInvalide);
    expect(casse).toThrow(/outils/);
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

  // UN RÔLE INCONNU NE SE LAISSE PAS LIRE COMME UN PLAT. Le défaut vit dans
  // `export_json.py` ; si l'export écrivait autre chose — une faute de frappe,
  // une valeur retirée de l'union — le chargeur le dirait plutôt que de rendre
  // au dîner une pâte brisée.
  test("un rôle que l'union ne connaît pas", () => {
    const casse = abime((c) => {
      (c["plats"] as Record<string, unknown>[])[0]!["role"] = "apéritif";
    });
    expect(casse).toThrow(CatalogueInvalide);
    expect(casse).toThrow(/role/);
  });

  // UNE LIGNE D'ACCOMPAGNEMENT SANS QUANTITÉ afficherait « NaN g de riz » et
  // ajouterait un NaN au panier, qui contaminerait le total de la ligne. Les
  // quatre champs sont donc obligatoires, alors que l'export n'a aucune raison
  // de les omettre — c'est justement la dérive qu'on veut voir échouer ici.
  test("un accompagnement sans quantité", () => {
    const casse = abime((c) => {
      const plats = c["plats"] as Record<string, unknown>[];
      const p = plats.find((x) => (x["avec"] as unknown[]).length > 0)!;
      delete (p["avec"] as Record<string, unknown>[])[0]!["qty"];
    });
    expect(casse).toThrow(CatalogueInvalide);
    expect(casse).toThrow(/avec/);
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
