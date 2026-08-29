import { describe, expect, test } from "vitest";
import { aPartager, encoderPartage, lirePartage, type Partage } from "./partage";

const jourISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const semaine = {
  jours: [{ date: new Date("2026-08-28T12:00:00") }, { date: new Date("2026-08-29T12:00:00") }],
  creneaux: [
    { jour: 0, repas: "diner" },
    { jour: 1, repas: "dejeuner" },
    { jour: 1, repas: "diner" },
  ],
};

describe("ce qui voyage", () => {
  test("les décisions, jamais la liste", () => {
    // Transporter le résultat plutôt que ses entrées se garantirait de diverger
    // le jour où le catalogue change — la faute du JSON resté à 51 plats.
    const p = aPartager("2026-08-28", semaine.creneaux, semaine.jours,
      ["pates-bolognaise", null, "lasagnes"], [4, 4, 2], jourISO);
    expect(p.decisions).toEqual([
      { jour: "2026-08-28", repas: "diner", plat: "pates-bolognaise", parts: 4, avec: [] },
      { jour: "2026-08-29", repas: "diner", plat: "lasagnes", parts: 2, avec: [] },
    ]);
  });

  test("l'assiette voyage entière, pas seulement le plat", () => {
    // Le riz posé sous le rôti est une ligne de courses. Le taire enverrait à
    // ma femme une liste plus courte que la vraie — et c'est précisément le
    // genre de manque qui ne se voit qu'au magasin.
    const p = aPartager("2026-08-28", semaine.creneaux, semaine.jours,
      ["roti-roule-herbes-fenouil", null, null], [4, 4, 4], jourISO,
      [["riz-nature"], [], []]);
    expect(p.decisions[0]!.avec).toEqual(["riz-nature"]);
  });

  test("UN ACCOMPAGNEMENT NE VOYAGE PAS SEUL", () => {
    // Sans plat principal, le créneau n'a pas été décidé. Envoyer « du riz
    // mardi soir » ferait acheter du riz pour un repas qui n'existe pas.
    const p = aPartager("2026-08-28", semaine.creneaux, semaine.jours,
      [null, null, null], [4, 4, 4], jourISO, [["riz-nature"], [], []]);
    expect(p.decisions).toHaveLength(0);
  });

  test("un créneau vide ou sauté ne part pas", () => {
    // Ni l'un ni l'autre ne produit de course.
    const p = aPartager("2026-08-28", semaine.creneaux, semaine.jours,
      [null, "SAUTE", null], [4, 4, 4], jourISO);
    expect(p.decisions).toHaveLength(0);
  });

  test("LE JOUR VOYAGE EN DATE, JAMAIS EN INDEX", () => {
    // `creneau.jour` est un index dans la semaine courante. L'envoyer tel quel
    // ferait tomber « le dîner de lundi » sur un autre jour à l'arrivée — la
    // faute que `db/schema.ts` documente en tête, et qui ne lève rien.
    const p = aPartager("2026-08-28", semaine.creneaux, semaine.jours,
      [null, null, "lasagnes"], [4, 4, 4], jourISO);
    expect(p.decisions[0]!.jour).toBe("2026-08-29");
  });
});

describe("l'aller-retour", () => {
  const p: Partage = {
    depuis: "2026-08-28",
    decisions: [{ jour: "2026-08-28", repas: "diner", plat: "pâtes-à-l'ail", parts: 2.5, avec: [] }],
  };

  test("ce qui part revient identique, accents compris", () => {
    expect(lirePartage(encoderPartage(p))).toEqual(p);
  });

  test("l'assiette aussi fait l'aller-retour", () => {
    const avec: Partage = {
      depuis: "2026-08-28",
      decisions: [{
        jour: "2026-08-28", repas: "diner", plat: "roti-roule-herbes-fenouil",
        parts: null, avec: ["riz-nature", "salade-verte-vinaigrette"],
      }],
    };
    expect(lirePartage(encoderPartage(avec))).toEqual(avec);
  });

  test("un lien d'avant les accompagnements se relit encore", () => {
    // Les liens déjà envoyés n'ont pas le champ. Absent vaut vide : refuser ces
    // liens-là punirait quelqu'un pour avoir reçu un message la semaine dernière.
    const vieux = btoa(JSON.stringify({
      depuis: "2026-08-28",
      decisions: [{ jour: "2026-08-28", repas: "diner", plat: "lasagnes", parts: null }],
    }));
    expect(lirePartage(vieux)?.decisions[0]!.avec).toEqual([]);
  });

  test("le champ vide ne part pas sur le fil", () => {
    // Une dizaine d'octets par repas sur une URL qu'une messagerie peut couper.
    expect(atob(encoderPartage(p).replace(/-/g, "+").replace(/_/g, "/")))
      .not.toContain("avec");
  });

  test("un `avec` mal formé invalide le lot", () => {
    const c = btoa(JSON.stringify({
      depuis: "2026-08-28",
      decisions: [{ jour: "2026-08-28", repas: "diner", plat: "x", parts: null, avec: [3] }],
    }));
    expect(lirePartage(c)).toBeNull();
  });

  test("l'encodage tient dans une URL", () => {
    const c = encoderPartage(p);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(c)).toBe(c);
  });
});

describe("un lien abîmé ne produit jamais une liste fausse", () => {
  test("tronqué, il est refusé", () => {
    // Les messageries coupent les URL longues, et un JSON amputé peut rester
    // syntaxiquement plausible. Une liste à moitié lue est une liste dont on ne
    // sait pas ce qui manque.
    const c = encoderPartage({
      depuis: "2026-08-28",
      decisions: [{ jour: "2026-08-28", repas: "diner", plat: "lasagnes", parts: null, avec: [] }],
    });
    expect(lirePartage(c.slice(0, Math.floor(c.length / 2)))).toBeNull();
  });

  test("vide, illisible, ou de la mauvaise forme : null, jamais une exception", () => {
    for (const mauvais of ["", "pas-du-base64!!", btoa("null"), btoa("[]"), btoa('{"depuis":"x"}')])
      expect(lirePartage(mauvais)).toBeNull();
  });

  test("une décision mal formée invalide le lot", () => {
    // Accepter les décisions valides et jeter les autres en silence donnerait
    // une liste incomplète que personne ne saurait incomplète.
    const c = btoa(JSON.stringify({ depuis: "2026-08-28", decisions: [{ jour: 3, repas: "diner", plat: "x" }] }));
    expect(lirePartage(c)).toBeNull();
  });
});
