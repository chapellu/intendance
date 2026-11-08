import { describe, expect, test } from "vitest";
import { echec } from "./Releves";

describe("un import qui lève dit où, et pourquoi", () => {
  test("l'étape et le message de l'exception, jamais un « n'a pas pu être lu » muet", () => {
    expect(echec("lecture du PDF", new TypeError("x.y is not a function"))).toBe(
      "Échec à l’étape « lecture du PDF » — TypeError : x.y is not a function",
    );
    expect(echec("enregistrement", new Error("quota"))).toBe("Échec à l’étape « enregistrement » — quota");
    expect(echec("enregistrement", "chaîne")).toBe("Échec à l’étape « enregistrement » — chaîne");
  });

  test("un PDF protégé par mot de passe se nomme comme tel", () => {
    const e = Object.assign(new Error("No password given"), { name: "PasswordException" });
    expect(echec("lecture du PDF", e)).toMatch(/mot de passe/);
  });
});
