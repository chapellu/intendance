// LE MINUTEUR POSE SES BIPS DANS LE GRAPHE AUDIO — T82.
//
// CE PARCOURS NE VÉRIFIE PAS QU'UN SON SORT. Aucun test de ce dépôt ne le peut,
// et ce n'est pas ce qui risque de casser : ce qui décide qu'un iPhone
// verrouillé sonne est WebKit et l'interrupteur de sonnerie de l'appareil. Ça
// se mesure à la main, sur le téléphone de la maison (Workspace#61).
//
// CE QU'IL VÉRIFIE EST LA THÈSE DU TICKET, et elle est vérifiable : les bips
// sont PROGRAMMÉS À L'INSTANT OÙ LE DOIGT LANCE LE MINUTEUR, pas déclenchés à
// l'échéance par une minuterie JavaScript. C'est toute la différence entre une
// alarme et un vœu — une PWA en arrière-plan voit son JavaScript gelé, et un
// `setTimeout` de trente minutes n'y survit pas. Si quelqu'un « simplifie » un
// jour ce fichier en un `setTimeout` qui joue un son, c'est ce parcours qui doit
// rougir, et il est écrit pour ça.
//
// ET IL VÉRIFIE QUE LE GRAPHE SE CONSTRUIT POUR DE BON, dans un vrai navigateur.
// Un en-tête WAV mal formé ou un `AudioParam` mal appelé ne se voit nulle part
// ailleurs : pas d'exception à l'écran, juste une alarme qui ne sonne jamais.

import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { minuteurUtile } from "../src/ecrans/cuisiner.vue";
import type { Etape } from "../src/model/types";
import { ouvrirLeGuide } from "./parcours";

interface PlatExport {
  id: string;
  steps: Etape[];
}

const plats: PlatExport[] = JSON.parse(readFileSync("public/cuisine-data.json", "utf8")).plats;

/** Un plat dont la PREMIÈRE étape porte un minuteur : la fiche s'ouvre dessus,
 *  et le parcours n'a pas à traverser la recette pour trouver le bouton.
 *  Dérivé du corpus et jamais énuméré à la main — une liste de titres recopiée
 *  ici vieillirait à côté du catalogue sans que personne ne le voie.
 *
 *  `minutes > 0` NE SUFFIT PLUS DEPUIS QUE LE MINUTEUR SE TAIT SUR LES GESTES :
 *  la moitié des premières étapes du corpus sont des tailles de légumes, et ce
 *  parcours serait allé chercher un bouton qui n'existe plus. On importe la
 *  règle de l'écran plutôt que de la recopier — une seconde copie de
 *  `minuteurUtile` ici dériverait au premier ajustement. */
const guide = plats.find((p) => (p.steps[0]?.minutes ?? 0) > 0 && minuteurUtile(p.steps[0]!))!;
const minutes = guide.steps[0]!.minutes;

/**
 * On instrumente `AudioContext` AVANT que l'app se charge.
 *
 * Deux relevés, et chacun tient une décision du ticket :
 *
 * - `poses` — le décalage, en secondes, entre le moment où un oscillateur est
 *   programmé et celui où il doit sonner. C'est la preuve que l'échéance vit
 *   dans le thread audio et pas dans une minuterie.
 * - `annules` — les `stop()` SANS ARGUMENT, ceux que `taire()` émet pour
 *   décrocher une alarme. Les `stop(t)` de la programmation en portent un ; les
 *   compter ensemble ne dirait rien.
 */
async function ecouterLeGraphe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { poses: number[]; annules: number };
    w.poses = [];
    w.annules = 0;
    const proto = AudioContext.prototype;
    const creer = proto.createOscillator;
    proto.createOscillator = function (this: AudioContext) {
      const o = creer.call(this);
      const start = o.start.bind(o);
      const stop = o.stop.bind(o);
      o.start = (t?: number) => {
        if (t !== undefined) w.poses.push(t - this.currentTime);
        start(t);
      };
      o.stop = (t?: number) => {
        if (t === undefined) w.annules += 1;
        stop(t);
      };
      return o;
    };
  });
}

test("lancer le minuteur pose toute la sonnerie d'avance, à l'échéance", async ({ page }) => {
  const pannes: string[] = [];
  page.on("pageerror", (e) => pannes.push(e.message));

  await ecouterLeGraphe(page);
  await ouvrirLeGuide(page, guide.id);

  // `dispatchEvent` et jamais `.click()` : Playwright réessaie quand l'élément
  // se détache sous lui, ce que chaque re-rendu React provoque, et la seconde
  // frappe tomberait sur le bouton que la première vient de faire apparaître —
  // ici, elle mettrait en pause le minuteur qu'elle vient de lancer.
  const bouton = page.locator(".co-minuteur");
  await bouton.dispatchEvent("click");
  await expect(bouton).toHaveClass(/actif/);

  const poses = await page.evaluate(() => (window as unknown as { poses: number[] }).poses);

  // UNE VRAIE SONNERIE, PAS UN BIP. Le motif fait plusieurs volées : ce qu'on
  // vérifie ici, c'est qu'elles sont TOUTES posées maintenant, d'un coup.
  expect(poses.length).toBeGreaterThan(8);

  // ET ELLES SONT POSÉES À L'ÉCHÉANCE. Le premier bip tombe à `minutes` de
  // maintenant, à la seconde d'ouverture de l'app près — c'est la thèse du
  // ticket, et la seule chose qui distingue ce code d'un `setTimeout`.
  expect(Math.min(...poses)).toBeGreaterThan(minutes * 60 - 5);
  expect(Math.min(...poses)).toBeLessThan(minutes * 60 + 5);

  // La sonnerie s'étale sur une vingtaine de secondes : le temps de revenir
  // d'une autre pièce, qui est la raison d'être du ticket.
  expect(Math.max(...poses) - Math.min(...poses)).toBeGreaterThan(20);

  // Le graphe s'est construit pour de bon — pas d'`AudioParam` mal appelé, pas
  // de WAV que le navigateur refuse. C'est invisible autrement.
  expect(pannes).toEqual([]);
});

test("AVANCER D'UNE ÉTAPE NE DÉCROCHE PAS L'ALARME QUI COURT", async ({ page }) => {
  await ecouterLeGraphe(page);
  await ouvrirLeGuide(page, guide.id);

  await page.locator(".co-minuteur").dispatchEvent("click");
  await expect(page.locator(".co-minuteur")).toHaveClass(/actif/);

  // Le cas NORMAL d'une recette, pas un cas limite : on lance le mijotage et on
  // passe à l'étape suivante pendant qu'il mijote — c'est même ce que « sans
  // surveiller » invite à faire. Une alarme désarmée par la navigation serait
  // retirée exactement quand elle sert.
  const geste = await page.locator(".co-etape .geste").innerText();
  await page.getByRole("button", { name: /C’est fait|Terminer/ }).dispatchEvent("click");
  await expect(page.locator(".co-etape .geste")).not.toHaveText(geste);

  expect(await page.evaluate(() => (window as unknown as { annules: number }).annules)).toBe(0);
});

test("mettre en pause décroche la sonnerie — sinon elle partirait sans minuteur", async ({
  page,
}) => {
  await ecouterLeGraphe(page);
  await ouvrirLeGuide(page, guide.id);

  const bouton = page.locator(".co-minuteur");
  await bouton.dispatchEvent("click");
  await expect(bouton).toHaveClass(/actif/);

  // C'EST LE BUG QUE CE TEST EXISTE POUR ATTRAPER. Les bips vivent dans le
  // thread audio : une pause qui ne les décroche pas laisse une alarme partir
  // à l'heure d'une cuisson qu'on a justement arrêtée, et rien à l'écran
  // n'expliquerait pourquoi la cuisine sonne.
  await bouton.dispatchEvent("click");
  await expect(bouton).not.toHaveClass(/actif/);

  // Comparé au nombre de bips RÉELLEMENT posés, et pas à un nombre écrit ici :
  // le motif peut changer, et un parcours qui recopierait sa taille cesserait
  // de vérifier ce qu'il croit vérifier le jour où elle bouge. Ce qui se tient,
  // c'est que tout ce qui a été posé a été décroché — pas un de moins.
  const { poses, annules } = await page.evaluate(() => {
    const w = window as unknown as { poses: number[]; annules: number };
    return { poses: w.poses, annules: w.annules };
  });
  expect(annules).toBe(poses.length);
  expect(poses.length).toBeGreaterThan(8);
});
