// T187 — la viande et le poisson au stock : la porte, la date, la congélation.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { limiteAuFroid, phraseDeLimite, porteDuRayon, seCongele } from "./froid";
import { ceQuiEstIci } from "./ici";
import { contexte, rejouer, type Evenement } from "./journal";
import { horsDuReleve } from "../ecrans/stock.vue";

const catalogue = lireCatalogue(JSON.parse(readFileSync("public/cuisine-data.json", "utf8")));
const ctx = contexte(catalogue);

const entree = (jour: string, ingredient: string, zone: string | null): Evenement => ({
  sorte: "entree", jour, saisi: jour, maj: 1,
  lignes: [{ ingredient, unites: 1, parUnite: null, zone, etat: "frais" }],
});
const deplacement = (jour: string, ingredient: string, de: string | null, vers: string): Evenement =>
  ({ sorte: "deplacement", ingredient, de, vers, unites: null, jour, saisi: jour, maj: 2 }) as Evenement;

describe("T187 — la porte d'un achat", () => {
  test("la viande et le poisson frais au frigo, le surgelé au congélateur, les pâtes nulle part", () => {
    expect(porteDuRayon(catalogue, "poulet")).toBe("frigo");
    expect(porteDuRayon(catalogue, "saumon")).toBe("frigo");
    expect(porteDuRayon(catalogue, "colin-surgele")).toBe("congelo");
    expect(porteDuRayon(catalogue, "pates")).toBeNull();
  });

  test("toute la viande crue se congèle ; le jambon, non", () => {
    for (const id of ["poulet", "boeuf-hache", "roti-veau", "jarret-boeuf", "cabillaud"]) expect(seCongele(catalogue, id)).toBe(true);
    expect(seCongele(catalogue, "jambon")).toBe(false);
  });
});

describe("T187 — la date limite", () => {
  test("un poulet rentré au frigo lundi : à manger d'ici mercredi", () => {
    const rejeu = rejouer(catalogue, [entree("2026-11-09", "poulet", "frigo")], ctx, "2026-11-10");
    const l = limiteAuFroid(catalogue, rejeu, "poulet", "frigo", "2026-11-10")!;
    expect(l).toEqual({ le: "2026-11-11", jours: 1 });
    expect(phraseDeLimite(l)).toBe("à manger d'ici demain");
    expect(phraseDeLimite({ le: "2026-11-11", jours: 0 })).toBe("à manger aujourd'hui");
    expect(phraseDeLimite({ le: "2026-11-09", jours: -2 })).toBe("date passée · vérifier l'étiquette");
    expect(phraseDeLimite({ le: "2026-11-13", jours: 3 })).toBe("à manger d'ici ven. 13/11");
  });

  test("congelé mardi, l'horloge repart pour trois mois", () => {
    const rejeu = rejouer(
      catalogue,
      [entree("2026-11-09", "poulet", "frigo"), deplacement("2026-11-10", "poulet", "frigo", "congelo")],
      ctx,
      "2026-11-12",
    );
    expect(rejeu.congeleLe?.get("poulet")).toBe("2026-11-10");
    const h = horsDuReleve(catalogue, rejeu, "2026-11-12").find((x) => x.id === "poulet")!;
    expect(h.porte).toBe("congelo");
    expect(h.de).toBe("congelo");
    expect(h.congelable).toBe(false);
    expect(h.limite!.jours).toBeGreaterThan(80);
    expect(phraseDeLimite(h.limite!)).toMatch(/^à consommer avant le \d\d\/\d\d$/);
  });

  test("au frigo, la ligne propose de congeler", () => {
    const rejeu = rejouer(catalogue, [entree("2026-11-12", "poulet", "frigo")], ctx, "2026-11-12");
    const h = horsDuReleve(catalogue, rejeu, "2026-11-12").find((x) => x.id === "poulet")!;
    expect(h).toMatchObject({ porte: "frigo", de: "frigo", congelable: true });
    expect(h.limite?.jours).toBe(2);
  });

  test("un colin rentré sans place va derrière la porte du congélateur", () => {
    const rejeu = rejouer(catalogue, [entree("2026-11-12", "colin-surgele", null)], ctx, "2026-11-12");
    const h = horsDuReleve(catalogue, rejeu, "2026-11-12").find((x) => x.id === "colin-surgele")!;
    expect(h.porte).toBe("congelo");
    expect(h.limite?.jours).toBeGreaterThan(200);
  });
});

describe("T187 — ce soir", () => {
  test("le poulet congelé à la maison n'est pas là pour ce soir ; le colin surgelé, si", () => {
    const rejeu = rejouer(
      catalogue,
      [
        entree("2026-11-09", "poulet", "frigo"),
        deplacement("2026-11-10", "poulet", "frigo", "congelo"),
        entree("2026-11-10", "colin-surgele", "congelo"),
      ],
      ctx,
      "2026-11-12",
    );
    const ici = ceQuiEstIci(catalogue, [], rejeu, "2026-11-12");
    expect(ici.has("poulet")).toBe(false);
    expect(ici.has("colin-surgele")).toBe(true);
  });
});
