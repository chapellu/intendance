// Ce qui se teste ici n'est pas « le service worker marche » — ça, seul un vrai
// navigateur mis hors ligne le dit, et c'est ce que fait la vérification du
// ticket. Ce qui se teste ici, ce sont les deux décisions que le greffon prend
// SANS QU'ON PUISSE LES VOIR : ce qui entre au cache, et ce qui distingue deux
// versions. Un fichier oublié dans la liste, ou une version qui ne bouge pas
// quand le contenu bouge, ne se manifeste que des semaines plus tard, sur un
// téléphone, sous la forme d'une app qui refuse de vieillir.

import { describe, expect, it } from "vitest";
import { aPrecacher, empreinte } from "./plugin";

describe("aPrecacher", () => {
  const build = [
    "index.html",
    "assets/index-a1b2c3.js",
    "assets/index-d4e5f6.css",
    "cuisine-data.json",
    "manifest.webmanifest",
    "fonts/figtree-latin.woff2",
    "icones/icone-192.png",
  ];

  it("prend tout le build, en chemins absolus", () => {
    const l = aPrecacher(build);
    expect(l).toHaveLength(build.length);
    expect(l.every((f) => f.startsWith("/"))).toBe(true);
    // Les quatre qui font la promesse « hors ligne » : le document, le code,
    // le catalogue, les polices.
    expect(l).toContain("/index.html");
    expect(l).toContain("/assets/index-a1b2c3.js");
    expect(l).toContain("/cuisine-data.json");
    expect(l).toContain("/fonts/figtree-latin.woff2");
  });

  it("ne se met pas lui-même au cache", () => {
    // Un service worker précaché est un service worker qu'on ne remplace plus :
    // le navigateur va chercher `/sw.js` par le réseau, et le trouverait servi
    // depuis l'ancien cache, par l'ancien worker, pour toujours.
    expect(aPrecacher([...build, "sw.js"])).not.toContain("/sw.js");
  });

  it("laisse les sourcemaps dehors", () => {
    expect(aPrecacher([...build, "assets/index-a1b2c3.js.map"])).not.toContain(
      "/assets/index-a1b2c3.js.map",
    );
  });

  it("rend le même ordre quel que soit celui du disque", () => {
    expect(aPrecacher(build)).toEqual(aPrecacher([...build].reverse()));
  });
});

describe("empreinte", () => {
  const build = [
    ["index.html", "aaa"],
    ["cuisine-data.json", "bbb"],
  ] as const;

  it("ne dépend pas de l'ordre de lecture", () => {
    expect(empreinte(build)).toBe(empreinte([...build].reverse()));
  });

  it("change quand un contenu change SANS que son nom change", () => {
    // Le cas qui compte : `cuisine-data.json` garde son nom d'un export à
    // l'autre. Si la version ne bougeait pas, l'app continuerait de calculer
    // sur le catalogue d'avant.
    expect(empreinte([["index.html", "aaa"], ["cuisine-data.json", "ccc"]])).not.toBe(
      empreinte(build),
    );
  });

  it("change quand un fichier s'ajoute", () => {
    expect(empreinte([...build, ["icones/icone-192.png", "ddd"]])).not.toBe(empreinte(build));
  });

  it("ne change pas quand rien ne change", () => {
    expect(empreinte(build)).toBe(empreinte([["index.html", "aaa"], ["cuisine-data.json", "bbb"]]));
  });
});
