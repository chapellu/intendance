import { describe, expect, test } from "vitest";
import { repartir, retenir } from "./remplacants";

const farine = {
  id: "farine-complete",
  remplacants: [{ id: "farine-epeautre", nom: "farine de grand épeautre", ratio: 1 }],
};

describe("retenir — quelle farine, au juste", () => {
  test("l'original quand il est là", () => {
    expect(retenir(farine, () => true).id).toBe("farine-complete");
  });
  test("le remplaçant quand seul lui est là", () => {
    const r = retenir(farine, (id) => id === "farine-epeautre");
    expect(r.id).toBe("farine-epeautre");
    expect(r.remplacant?.nom).toBe("farine de grand épeautre");
  });
  test("l'original quand rien n'est là : c'est lui qui s'achète", () => {
    expect(retenir(farine, () => false).id).toBe("farine-complete");
  });
  test("ce qu'un doigt a choisi l'emporte, même l'original absent", () => {
    expect(retenir(farine, () => true, undefined, "farine-epeautre").id).toBe("farine-epeautre");
    expect(retenir(farine, (id) => id === "farine-epeautre", undefined, "farine-complete").id).toBe("farine-complete");
  });
  test("un choix qui n'est pas une option est ignoré", () => {
    expect(retenir(farine, () => true, undefined, "farine").id).toBe("farine-complete");
  });
  test("une ligne sans remplaçant ne demande rien", () => {
    expect(retenir({ id: "sel" }, () => false).id).toBe("sel");
  });
  // T178 — ce qui se cultive ou se cueille.
  const cebette = { id: "cebette", potager: true, remplacants: [{ id: "oignon", nom: "oignon", ratio: 0.5 }] };
  test("potager, rien n'est là : c'est le remplaçant qui s'achète", () => {
    const r = retenir(cebette, () => false);
    expect([r.id, r.ratio]).toEqual(["oignon", 0.5]);
  });
  test("potager, l'original est là : on le prend", () => {
    expect(retenir(cebette, (id) => id === "cebette").id).toBe("cebette");
  });
  test("potager sans remplaçant : l'original, faute de mieux", () => {
    expect(retenir({ id: "orties", potager: true }, () => false).id).toBe("orties");
  });
});

describe("repartir — un fond qui ne suffit pas se complète", () => {
  const ligne = { ...farine, unit: "g" };
  test("200 g d'épeautre, pas de T110 en poids connu : 200 + 175 de T110", () => {
    const stock = (id: string) => (id === "farine-epeautre" ? 200 : id === "farine-complete" ? null : 0);
    const p = repartir(ligne, 375, stock, undefined, "farine-epeautre");
    expect(p.map((x) => [x.id, Math.round(x.qty)])).toEqual([["farine-epeautre", 200], ["farine-complete", 175]]);
  });
  test("assez sur la première : une seule part", () => {
    const p = repartir(ligne, 375, () => 1000);
    expect(p.map((x) => x.id)).toEqual(["farine-complete"]);
  });
  test("rien d'autre de présent : la ligne reste entière", () => {
    const stock = (id: string) => (id === "farine-epeautre" ? 200 : 0);
    const p = repartir(ligne, 375, stock);
    expect(p.map((x) => [x.id, x.qty])).toEqual([["farine-epeautre", 375]]);
  });
  test("un sac sans poids n'est pas un manque mesuré", () => {
    const p = repartir(ligne, 375, () => null, undefined, "farine-epeautre");
    expect(p.map((x) => x.id)).toEqual(["farine-epeautre"]);
  });
  test("pas en grammes : jamais réparti", () => {
    const p = repartir({ ...farine, unit: "tasse" }, 1, (id) => (id === "farine-complete" ? 0.2 : null));
    expect(p).toHaveLength(1);
  });
  test("le ratio se respecte des deux côtés", () => {
    const miel = { id: "sirop", unit: "g", remplacants: [{ id: "miel", nom: "miel", ratio: 1.5 }] };
    const p = repartir(miel, 30, (id) => (id === "sirop" ? 10 : null));
    expect(p.map((x) => [x.id, x.qty])).toEqual([["sirop", 10], ["miel", 30]]);
  });
});
