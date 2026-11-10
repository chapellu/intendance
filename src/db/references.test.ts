// Les références du magasin sur le téléphone : la clé part en en-tête, et la
// copie n'est remplacée que par un fichier lu en entier.

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { CLE_REFERENCES, ENTETE, lireCopie, poserCle, rafraichirReferences, URL_REFERENCES } from "./references";
import { Base } from "./schema";

let base: Base;
let n = 0;
beforeEach(async () => {
  base = new Base(`references-${++n}`);
  await base.open();
});
afterEach(async () => {
  await base.delete();
});

const fichier = {
  releve: "2026-11-09",
  magasin: "drive",
  articles: { riz: { statut: "ok", produit: "Riz basmati", conditionnement: "1 kg", prix: 3 } },
};
const repondre = (status: number, corps: unknown = fichier): typeof fetch =>
  (async () => new Response(JSON.stringify(corps), { status })) as unknown as typeof fetch;

describe("rafraichirReferences", () => {
  test("sans clé, on ne demande rien au réseau", async () => {
    let appels = 0;
    const f = (async () => {
      appels++;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect((await rafraichirReferences(base, f)).sorte).toBe("sans-cle");
    expect(appels).toBe(0);
  });

  test("la clé part dans l'en-tête, et le fichier devient la copie", async () => {
    await poserCle("  secret  ", base);
    let vu: RequestInit | undefined;
    let url = "";
    const f = (async (u: string, init?: RequestInit) => {
      url = u;
      vu = init;
      return new Response(JSON.stringify(fichier), { status: 200 });
    }) as unknown as typeof fetch;
    const i = await rafraichirReferences(base, f);
    expect(i.sorte).toBe("recu");
    expect(url).toBe(URL_REFERENCES);
    expect((vu?.headers as Record<string, string>)[ENTETE]).toBe("secret");
    const { copie, aUneCle } = await lireCopie(base);
    expect(aUneCle).toBe(true);
    expect(copie?.refs.articles["riz"]?.prix).toBe(3);
  });

  test.each([
    [401, "refusee"],
    [403, "refusee"],
    [404, "absent"],
    [502, "hors-ligne"],
  ])("un %i laisse la copie d'avant en place", async (status, sorte) => {
    await poserCle("k", base);
    await rafraichirReferences(base, repondre(200));
    expect((await rafraichirReferences(base, repondre(status))).sorte).toBe(sorte);
    expect((await lireCopie(base)).copie?.refs.articles["riz"]).toBeDefined();
  });

  test("un fichier mal formé est refusé, et la copie reste", async () => {
    await poserCle("k", base);
    await rafraichirReferences(base, repondre(200));
    const i = await rafraichirReferences(base, repondre(200, { ...fichier, releve: "hier" }));
    expect(i.sorte).toBe("illisible");
    expect((await lireCopie(base)).copie?.refs.releve).toBe("2026-11-09");
  });

  test("le réseau absent n'efface rien", async () => {
    await poserCle("k", base);
    const f = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect((await rafraichirReferences(base, f)).sorte).toBe("hors-ligne");
  });

  test("une copie d'une autre forme ne se lit pas", async () => {
    await base.reglages.put({ cle: CLE_REFERENCES, valeur: { refs: { nope: 1 }, recu: 1 }, maj: 1 });
    expect((await lireCopie(base)).copie).toBeNull();
  });

  test("effacer la clé", async () => {
    await poserCle("k", base);
    await poserCle("", base);
    expect((await lireCopie(base)).aUneCle).toBe(false);
  });
});
