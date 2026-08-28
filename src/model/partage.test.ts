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
      { jour: "2026-08-28", repas: "diner", plat: "pates-bolognaise", parts: 4 },
      { jour: "2026-08-29", repas: "diner", plat: "lasagnes", parts: 2 },
    ]);
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
    decisions: [{ jour: "2026-08-28", repas: "diner", plat: "pâtes-à-l'ail", parts: 2.5 }],
  };

  test("ce qui part revient identique, accents compris", () => {
    expect(lirePartage(encoderPartage(p))).toEqual(p);
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
      decisions: [{ jour: "2026-08-28", repas: "diner", plat: "lasagnes", parts: null }],
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
