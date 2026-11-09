import { describe, expect, test } from "vitest";
import { dormant, moisPlus, repartir, type Projet } from "./epargne";

const MOIS = "2026-11";
const projet = (id: string, rythme: Projet["rythme"], deja = 0): Projet => ({ id, nom: id, rythme, deja });

describe("ce qui dort sur le compte courant", () => {
  test("le compte garde le réservé et un mois ; le reste est à placer", () => {
    expect(dormant(1_000_000, 200_000, 300_000)).toEqual({ solde: 1_000_000, reserve: 200_000, matelas: 300_000, aPlacer: 500_000 });
  });

  test("sous ce qu'il doit garder, rien n'est à placer — jamais un placement négatif", () => {
    expect(dormant(100_000, 200_000, 300_000).aPlacer).toBe(0);
  });
});

describe("la répartition, dans l'ordre des projets", () => {
  test("le stock va d'abord au premier, jusqu'à sa cible ; une somme mensuelle n'en prend pas", () => {
    const r = repartir(
      [
        projet("A", { sorte: "vite", cible: 500_000 }, 100_000),
        projet("B", { sorte: "date", cible: 1_200_000, pour: "2027-11" }),
        projet("C", { sorte: "mensuel", mensuel: 10_000 }),
      ],
      1_000_000,
      100_000,
      MOIS,
    );
    const [a, b, c] = r.lignes;
    expect([a!.uneFois, b!.uneFois, c!.uneFois]).toEqual([400_000, 600_000, 0]);
    expect(r.stockLibre).toBe(0);
    // A est plein ; B étale ses 600 000 restants sur 12 mois ; C prend sa somme.
    expect(a).toMatchObject({ etat: "atteint", ceMois: 0, atteint: MOIS });
    expect(b).toMatchObject({ etat: "tenu", ceMois: 50_000, besoin: 50_000, aLaDate: 1_200_000, atteint: "2027-10" });
    expect(c).toMatchObject({ etat: "tenu", ceMois: 10_000 });
    expect(r.fluxLibre).toBe(40_000);
  });

  test("ce qu'aucun projet ne veut reste à placer", () => {
    const r = repartir([projet("A", { sorte: "vite", cible: 300_000 })], 1_000_000, 0, MOIS);
    expect(r.stockLibre).toBe(700_000);
  });

  test("une réserve d'abord, puis le projet suivant rattrape sur les mois qui lui restent", () => {
    // La réserve prend tout pendant deux mois ; B ne reçoit rien ce mois-ci, et
    // pourtant il sera prêt : une répartition du seul premier mois l'aurait
    // déclaré perdu.
    const r = repartir(
      [projet("A", { sorte: "vite", cible: 300_000 }), projet("B", { sorte: "date", cible: 1_200_000, pour: "2027-11" })],
      0,
      150_000,
      MOIS,
    );
    const [a, b] = r.lignes;
    expect(a).toMatchObject({ etat: "tenu", ceMois: 150_000, atteint: "2026-12", besoin: null });
    expect(b).toMatchObject({ etat: "tenu", ceMois: 0, aLaDate: 1_200_000 });
    expect(r.fluxLibre).toBe(0);
  });

  test("une capacité trop courte le dit, avec ce qu'on aura à la date", () => {
    const r = repartir([projet("B", { sorte: "date", cible: 1_200_000, pour: "2027-11" })], 0, 50_000, MOIS);
    expect(r.lignes[0]).toMatchObject({ etat: "court", ceMois: 50_000, besoin: 100_000, aLaDate: 600_000 });
  });

  test("une date déjà là : le manque entier, et ce qu'on a", () => {
    const r = repartir([projet("B", { sorte: "date", cible: 500_000, pour: MOIS }, 200_000)], 0, 100_000, MOIS);
    expect(r.lignes[0]).toMatchObject({ etat: "court", ceMois: 0, besoin: 300_000, aLaDate: 200_000 });
    expect(r.fluxLibre).toBe(100_000);
  });

  test("une somme mensuelle qui passe après les autres peut ne pas être tenue", () => {
    const r = repartir(
      [projet("A", { sorte: "mensuel", mensuel: 80_000 }), projet("C", { sorte: "mensuel", mensuel: 50_000 })],
      0,
      100_000,
      MOIS,
    );
    expect(r.lignes.map((l) => [l.ceMois, l.etat])).toEqual([
      [80_000, "tenu"],
      [20_000, "court"],
    ]);
  });

  test("une capacité négative ne donne rien et ne doit rien", () => {
    const r = repartir([projet("A", { sorte: "vite", cible: 300_000 })], 0, -50_000, MOIS);
    expect(r.lignes[0]).toMatchObject({ etat: "court", ceMois: 0, atteint: null });
    expect(r.fluxLibre).toBe(0);
  });

  test("les mois se comptent par-dessus l'année", () => {
    expect(moisPlus("2026-11", 2)).toBe("2027-01");
    expect(moisPlus("2026-01", -1)).toBe("2025-12");
  });
});
