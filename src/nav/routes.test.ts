import { describe, expect, test } from "vitest";
import { ENTREE_CUISINE, chemin, dansCuisine, lireRoute, pleinEcran, ROUTE_DEFAUT, type Route } from "./routes";
import { JOURS_VISIBLES } from "./jours";

const TOUTES: Route[] = [
  { ecran: "cockpit" },
  { ecran: "jardin" },
  { ecran: "aujourdhui" },
  { ecran: "semaine" },
  { ecran: "prevoir" },
  { ecran: "courses" },
  { ecran: "stock" },
  { ecran: "fil" },
  { ecran: "fil", creneau: { jour: "2026-08-19", repas: "diner" } },
  { ecran: "poser", creneau: { jour: "2026-08-19", repas: "diner" } },
  { ecran: "parts", creneau: { jour: "2026-08-19", repas: "dejeuner" } },
  { ecran: "cuisiner", creneau: { jour: "2026-08-19", repas: "diner" } },
];

describe("les routes", () => {
  test("chaque écran fait l'aller-retour sans rien perdre", () => {
    // Si ce test passe pour les dix, aucune URL de l'app ne peut mentir sur
    // l'écran qu'elle désigne.
    for (const r of TOUTES) expect(lireRoute(chemin(r))).toEqual(r);
  });

  test("le fil a deux formes, et elles ne se confondent pas", () => {
    // Sans créneau c'est l'ouverture, avec c'est un pas. Les lire pareil
    // ferait rouvrir le choix de l'horizon au milieu d'une passe.
    expect(lireRoute("#/cuisine/fil")).toEqual({ ecran: "fil" });
    expect(lireRoute("#/cuisine/fil/2026-08-19/diner")).toEqual({
      ecran: "fil",
      creneau: { jour: "2026-08-19", repas: "diner" },
    });
    expect(lireRoute("#/cuisine/fil/demain/diner")).toEqual(ROUTE_DEFAUT);
  });

  test("les écrans ont des chemins distincts", () => {
    const chemins = TOUTES.map(chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
  });

  test("une URL de travers retombe sur le cockpit, jamais sur un écran blanc", () => {
    for (const mauvais of ["", "#", "#/", "#/nimporte", "#/cuisine/quoi", "#/cuisine/poser"])
      expect(lireRoute(mauvais)).toEqual(ROUTE_DEFAUT);
  });

  test("un jour qui n'en est pas un est refusé", () => {
    // Sans ça, l'écran s'ouvrirait sur un créneau fantôme : la clé tirée de
    // l'URL ne désignerait aucune ligne de la base.
    expect(lireRoute("#/cuisine/poser/demain/diner")).toEqual(ROUTE_DEFAUT);
    expect(lireRoute("#/cuisine/poser/2026-8-19/diner")).toEqual(ROUTE_DEFAUT);
    expect(lireRoute("#/cuisine/parts/2026-08-19/")).toEqual(ROUTE_DEFAUT);
  });

  test("`#/cuisine` est la PORTE de la facette, pas un écran — T88", () => {
    // Elle désignait « Aujourd'hui » en dur. Éteindre les jours aurait donc
    // fait du lien le plus court de l'app une impasse : le bouton de la barre
    // du bas, le raccourci mis en favori et la notification auraient tous
    // ouvert un écran qu'on ne montre plus. Voir `nav/jours.ts`.
    expect(lireRoute("#/cuisine")).toEqual(ENTREE_CUISINE);
    expect(ENTREE_CUISINE.ecran).toBe(JOURS_VISIBLES ? "aujourdhui" : "fil");
  });

  test("« Aujourd'hui » garde une URL à lui, éteint ou non", () => {
    // CE QU'ON CACHE RESTE ADRESSABLE, et c'est ce qui distingue un
    // interrupteur d'une amputation : `#/cuisine/aujourdhui` s'ouvre encore si
    // on la tape. Sans ce chemin propre, `chemin` et `lireRoute` cesseraient
    // d'être réciproques dès que l'entrée change de destination.
    expect(chemin({ ecran: "aujourdhui" })).toBe("#/cuisine/aujourdhui");
    expect(lireRoute("#/cuisine/aujourdhui")).toEqual({ ecran: "aujourdhui" });
  });

  test("la racine ouvre le cockpit — la coquille montre la journée, pas la facette", () => {
    expect(lireRoute("#/")).toEqual({ ecran: "cockpit" });
    expect(ROUTE_DEFAUT.ecran).toBe("cockpit");
  });

  test("un créneau se nomme (jour, repas) dans l'URL, jamais par son index", () => {
    // Même raison qu'en base : `#/cuisine/poser/8` désignerait le dîner de
    // mercredi aujourd'hui et celui de samedi après-demain. Une URL qu'on
    // s'envoie pour la rouvrir sur le téléphone est exactement le cas où le
    // décalage se produit.
    const c = chemin({ ecran: "poser", creneau: { jour: "2026-08-19", repas: "diner" } });
    expect(c).toBe("#/cuisine/poser/2026-08-19/diner");
    expect(c).not.toMatch(/\/\d+$/);
  });

  test("la sous-navigation cuisine sait qui lui appartient", () => {
    expect(dansCuisine({ ecran: "aujourdhui" })).toBe(true);
    expect(dansCuisine({ ecran: "stock" })).toBe(true);
    expect(dansCuisine({ ecran: "cockpit" })).toBe(false);
    expect(dansCuisine({ ecran: "jardin" })).toBe(false);
    // « En cuisine » sort de la coquille : on le lit à bout de bras.
    expect(dansCuisine({ ecran: "cuisiner", creneau: { jour: "2026-08-19", repas: "diner" } })).toBe(false);
    expect(pleinEcran({ ecran: "cuisiner", creneau: { jour: "2026-08-19", repas: "diner" } })).toBe(true);
    expect(pleinEcran({ ecran: "semaine" })).toBe(false);
  });

  test("la fiche peut viser un plat qu'on n'a pas encore posé", () => {
    // « Fiche » depuis une carte de la main : on lit la recette d'un candidat,
    // pendant que le créneau porte peut-être encore autre chose.
    const r = { ecran: "cuisiner", creneau: { jour: "2026-08-19", repas: "diner" }, plat: "lasagnes" } as const;
    expect(chemin(r)).toBe("#/cuisine/cuisiner/2026-08-19/diner/lasagnes");
    expect(lireRoute(chemin(r))).toEqual(r);
    // Sans plat, la fiche est celle du créneau — et l'URL n'invente pas un
    // segment vide.
    const sans = { ecran: "cuisiner", creneau: { jour: "2026-08-19", repas: "diner" } } as const;
    expect(chemin(sans)).toBe("#/cuisine/cuisiner/2026-08-19/diner");
    expect(lireRoute(chemin(sans))).toEqual(sans);
  });

  test("un chemin traînant une barre finale désigne le même écran", () => {
    expect(lireRoute("#/cuisine/semaine/")).toEqual({ ecran: "semaine" });
  });
});
