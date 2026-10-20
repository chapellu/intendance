// T138 — la table apprise et l'entrée d'un ticket, contre un vrai Dexie.

import { beforeEach, describe, expect, test } from "vitest";
import { lireJournal } from "./journal";
import { Base } from "./schema";
import { apprendre, lireAppris, rentrerUnTicket } from "./tickets";

let base: Base;
let n = 0;
beforeEach(() => {
  n += 1;
  base = new Base(`test-tickets-${n}`);
});

const AUJOURDHUI = new Date(2026, 9, 20, 18, 0);

describe("la table apprise", () => {
  test("retient un id comme un « pas pour la cuisine », et le choix suivant écrase", async () => {
    await apprendre(base, [
      { cle: "carrefour|CARREFOUR|POIREAU VRAC", ingredient: "poireaux" },
      { cle: "carrefour|CARREFOUR|PQ LOTUS X12", ingredient: null },
    ]);
    await apprendre(base, [{ cle: "carrefour|CARREFOUR|POIREAU VRAC", ingredient: "poireau" }]);
    const a = await lireAppris(base);
    expect(a.get("carrefour|CARREFOUR|POIREAU VRAC")?.ingredient).toBe("poireau");
    expect(a.get("carrefour|CARREFOUR|PQ LOTUS X12")?.ingredient).toBeNull();
    expect(a.size).toBe(2);
  });
});

describe("rentrerUnTicket", () => {
  test("une entrée datée de l'achat, saisie aujourd'hui, prix compris ; la liste se coche", async () => {
    const r = await rentrerUnTicket(
      base,
      "2026-10-03",
      [
        { cle: "gf|J|POTIMARRON", ingredient: "potimarron", unites: 1, parUnite: { amount: 1060, unit: "g" }, prixTTC: 2.63 },
        { cle: "gf|J|SAC CABAS", ingredient: null, unites: 1, parUnite: null, prixTTC: 0.1 },
      ],
      new Map([["potimarron", ["g"]]]),
      AUJOURDHUI,
    );
    expect(r).toEqual({ rentrees: 1, cochees: 1 });
    const [e] = await lireJournal(base);
    expect(e).toMatchObject({ sorte: "entree", jour: "2026-10-03", saisi: "2026-10-20" });
    expect(e?.sorte === "entree" && e.lignes).toEqual([
      { ingredient: "potimarron", unites: 1, parUnite: { amount: 1060, unit: "g" }, zone: null, etat: "sec", prixTTC: 2.63 },
    ]);
    expect(await base.courses.get("potimarron|g")).toMatchObject({ rentre: true, coche: false });
    // « pas pour la cuisine » est appris aussi, pour ne plus jamais le demander.
    expect((await lireAppris(base)).get("gf|J|SAC CABAS")?.ingredient).toBeNull();
  });

  test("un ticket sans date ne rentre pas", async () => {
    await expect(rentrerUnTicket(base, "", [], new Map(), AUJOURDHUI)).rejects.toThrow(/sans date/);
    expect(await lireJournal(base)).toEqual([]);
  });
});
