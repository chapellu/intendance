import { describe, expect, test } from "vitest";
import { retenir } from "./remplacants";

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
});
