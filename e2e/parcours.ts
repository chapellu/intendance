// Les gestes que plusieurs parcours refont, et rien d'autre.
//
// AUCUNE ÉCRITURE EN BASE ICI. On pourrait semer une semaine dans IndexedDB en
// trois lignes et gagner dix secondes ; on poserait alors des plats que l'app
// n'a jamais acceptés, et le jour où « poser » cesserait de fonctionner, les
// parcours des courses resteraient verts. Ce qu'un doigt fait, le doigt le
// fait.

import { expect, type Page } from "@playwright/test";
import { libellePoser } from "../src/ui/phrases";

/**
 * La première case libre de la semaine, dépliée. Renvoie le nom du plat qu'on
 * vient d'y poser.
 *
 * `convient` FILTRE LA MAIN, ET IL EXISTE PARCE QU'UN PARCOURS A MENTI SUR CE
 * DONT IL AVAIT BESOIN. `stock-descend` affirmait tenir « quel que soit le plat
 * que Poser a tiré » ; en vérité sa seconde promesse — la confiance du placard
 * se dépense — n'a de sens que si le plat tiré TOUCHE le garde-manger, et 24 des
 * 86 plats du corpus n'y touchent pas. Il passait parce que l'ancien bonus
 * placard faisait remonter les plats à oignon en tête de la main ; le jour où
 * T60 a cessé de payer l'oignon, il a tiré une quiche aux poireaux et il est
 * tombé. Un parcours qui dépend d'une propriété doit la DEMANDER, sans quoi il
 * teste la chance qu'il a eue.
 *
 * ON REPIOCHE PLUTÔT QUE DE FOUILLER : « Repiocher » est le geste que l'app
 * offre pour changer de main, et s'en servir garde le parcours dans les clous du
 * doigt. Le plafond de tours n'est pas un garde-fou de politesse — s'il faut
 * huit mains pour trouver un plat qui touche le placard, c'est une information
 * sur la proposition, et le parcours doit s'arrêter en le disant.
 */
export async function poserUnPlat(
  page: Page,
  convient?: (titre: string) => boolean,
): Promise<string> {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);

  // `.libre` ET PAS LE TEXTE « à poser » : T51 a rendu la case vide muette,
  // et un localisateur écrit sur une phrase disparaît avec elle. L'état, lui,
  // existe toujours — c'est pour ça qu'il est porté jusqu'au DOM.
  await page.locator(".co-slot.libre").first().locator("button.resume").click();
  // On désigne la case par le fait qu'elle est OUVERTE, pas par son texte : son
  // texte est précisément ce qu'on va changer.
  await page.locator(".co-slot.ouvert").getByRole("link", { name: "poser un plat" }).click();

  await repondreAuxQuestions(page);

  const cartes = page.locator(".co-jouable");
  await expect(cartes.first()).toBeVisible();

  for (let tour = 0; tour < 8; tour++) {
    const titres = await cartes.locator(".tete .nom").allInnerTexts();
    const n = titres.findIndex((t) => !convient || convient(t.trim()));
    if (n >= 0) {
      const titre = titres[n]!.trim();
      await cartes.nth(n).getByRole("button", { name: libellePoser(false) }).click();
      // `jouer` renvoie sur ce qu'on vient de décider une fois l'écriture
      // faite : c'est là qu'on sait que le tour est complet, base comprise.
      // La destination suit `JOURS_VISIBLES` — la grille quand les jours sont
      // là, « Posés » sinon — donc on attend le plat qu'on vient de poser
      // plutôt qu'un conteneur d'écran, qui changerait avec l'interrupteur.
      await expect(page.locator(".co-lot, .co-slots").first()).toBeVisible();
      return titre;
    }
    await page.getByRole("button", { name: /Repiocher/ }).click();
    await expect(cartes.first()).toBeVisible();
  }

  throw new Error("huit mains sans un seul plat qui convienne — la proposition a changé de nature");
}

/**
 * Le mode guidé d'un plat, par lien profond — donc sur un créneau qui ne le
 * porte pas.
 *
 * IL PASSE PAR LE RÉSUMÉ DEPUIS T91, ET C'EST LE TICKET QUI LE VEUT : cette URL
 * ouvrait le pas-à-pas, elle ouvre maintenant la fiche en lecture, et le guide
 * est derrière un bouton.
 *
 * LE LIEN PROFOND RESTE LEUR PORTE D'ENTRÉE, faute de mieux et sans regret. Les
 * parcours qui testent le guide ont besoin d'un plat PRÉCIS — une étape sans
 * minuteur suivie d'une cuisson qui en porte un, une première étape commentée —
 * et aucun ne peut l'obtenir de la main, qui est tirée par le score. Poser par
 * la recherche de T90 coûterait une passe entière par test pour vérifier un
 * minuteur.
 */
export async function ouvrirLeGuide(page: Page, plat: string): Promise<void> {
  await page.goto(`/#/cuisine/cuisiner/${aujourdhuiISO()}/diner/${plat}`);
  // PAS `attendreLApp` : la fiche est le seul écran qui sorte de la coquille,
  // elle n'a pas de barre du bas. On attend sa tête, qu'elle monte en premier.
  await expect(page.locator(".co-fiche-tete")).toBeVisible({ timeout: 30_000 });
  // `dispatchEvent` plutôt que `.click()`, comme partout ici : le bouton
  // disparaît sous le doigt — c'est tout son effet — et un clic retenté
  // chercherait un élément que le rendu suivant n'a plus.
  await page
    .getByRole("button", { name: /Ouvrir le guide|Cuisiner ce plat/ })
    .dispatchEvent("click");
  await expect(page.locator(".co-etape")).toBeVisible({ timeout: 30_000 });
}

/**
 * Le créneau (jour, repas) sur lequel un plat a été posé.
 *
 * ON LE LIT SUR LE SLOT, ET PAS SUR UN LIEN « EN CUISINE ». Celui-ci vit sur
 * l'écran « Aujourd'hui », donc seulement pour les créneaux du jour, alors que
 * le plat qu'on vient de poser peut tomber n'importe quand dans la semaine. Le
 * href de « régler les parts » porte le couple (jour, repas) — la même clé que
 * la base — et c'est elle qui ouvre la fiche.
 *
 * LA GRILLE SE DEMANDE DEPUIS LE 21/09 : poser dépose sur « Posés », qui ne
 * porte pas le réglage des parts. C'est la semaine qui porte le couple, donc
 * c'est elle qu'on ouvre.
 */
export async function creneauPose(
  page: Page,
  titre: string,
): Promise<{ jour: string; repas: string }> {
  await page.goto("/#/cuisine/semaine");
  await attendreLApp(page);
  const slot = page.locator(".co-slot").filter({ hasText: titre }).first();
  await slot.locator("button.resume").click();
  const href = await page
    .locator(".co-slot.ouvert")
    .getByRole("link", { name: "régler les parts" })
    .getAttribute("href");
  const creneau = /#\/cuisine\/parts\/(\d{4}-\d{2}-\d{2})\/([^/]+)/.exec(href ?? "");
  expect(creneau, `href inattendu : ${href}`).not.toBeNull();
  const [, jour, repas] = creneau!;
  return { jour: jour!, repas: repas! };
}

/**
 * On répond « oui » à tout ce que l'app demande avant de montrer sa main — T33.
 *
 * SUR UNE APP NEUVE, C'EST LE CAS NORMAL ET NON UN CAS LIMITE : rien n'a jamais
 * été relevé, donc tout central est `inconnu`, donc la première proposition est
 * une file de questions. Le backlog l'avait annoncé — « la première passe EST le
 * relevé, par un autre chemin » — et ce sont ces parcours qui l'ont vérifié en
 * échouant le jour où T33 a été branché.
 *
 * On répond « oui » et jamais « non » : « non » retire des plats, et un parcours
 * qui rétrécit sa propre main testerait autre chose que ce qu'il croit tester.
 *
 * Le garde-fou de boucle vaut pour ce qu'il dit : si les questions ne
 * s'épuisaient pas, la promesse centrale de T33 serait fausse et ce parcours
 * doit s'arrêter en le disant plutôt que tourner trois minutes.
 */
export async function repondreAuxQuestions(page: Page, plafond = 30): Promise<number> {
  const question = page.locator(".co-question");
  const enonce = question.locator(".nom");
  let posees = 0;

  // D'ABORD, LAISSER L'ÉCRAN TRANCHER. `Poser` ne rend rien tant qu'il n'a pas
  // le journal — c'est délibéré, une main calculée sans lui serait une main
  // qu'on sait fausse. Demander « y a-t-il une question ? » à cet instant-là
  // s'entend donc répondre « non » et fait sauter toute la boucle : c'est
  // exactement comme ça que ce parcours a échoué la première fois.
  await expect(page.locator(".co-question, .co-jouable").first()).toBeVisible({ timeout: 30_000 });

  while (await question.isVisible()) {
    if (posees >= plafond)
      throw new Error(`plus de ${plafond} questions d'affilée : le volume ne décroît pas (T33)`);

    const pose = (await enonce.innerText()).trim();

    // AUCUN CLIC N'EST RETENTÉ — la leçon de `stock-descend.spec.ts`, et elle
    // vaut mot pour mot ici. Répondre remplace tout le bloc sous le doigt ;
    // Playwright réessaie quand l'élément se détache, et la seconde frappe
    // tombe sur le bouton que la première vient de faire apparaître, c'est-à-dire
    // sur la question suivante. `dispatchEvent` envoie l'événement une fois.
    await question.getByRole("button", { name: "Oui", exact: true }).dispatchEvent("click");

    // ET ON ATTEND UN PROGRÈS EXPLICITE, pas une assertion négative : `not
    // .toHaveText` passe aussi quand l'élément a DISPARU, donc elle validerait
    // « l'écran n'existe plus » aussi bien que « la question a changé ». Ici les
    // deux sorties sont légitimes — une autre question, ou les cartes — alors on
    // les nomme toutes les deux plutôt que d'en laisser une passer par accident.
    await page.waitForFunction(
      (avant) => {
        const q = document.querySelector(".co-question .nom");
        if (q) return q.textContent?.trim() !== avant;
        return !!document.querySelector(".co-jouable");
      },
      pose,
      { timeout: 30_000 },
    );
    posees += 1;
  }

  await expect(page.locator(".co-jouable").first()).toBeVisible({ timeout: 30_000 });
  return posees;
}

/** L'app a fini de charger : la barre des facettes est le dernier élément que
 *  la coquille monte, et elle n'apparaît qu'une fois le catalogue lu, l'amorce
 *  du stock passée et la semaine calculée. */
export async function attendreLApp(page: Page): Promise<void> {
  await expect(page.locator(".co-barre")).toBeVisible({ timeout: 30_000 });
}

/** Le service worker a pris la main. Tant qu'il n'y a pas de `controller`, la
 *  page est servie par le réseau et couper le réseau ne prouverait rien. */
export async function attendreLeWorker(page: Page): Promise<void> {
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  }, null, { timeout: 30_000 });
}

/**
 * Le jour d'aujourd'hui, comme l'app l'écrit dans ses URL.
 *
 * ÉCRIT EN DUR, UN PARCOURS POURRIT PENDANT LA NUIT. `fiche-provenance` est né
 * le 14/09 avec `/2026-09-14/` dans ses trois liens profonds ; il est passé au
 * vert ce soir-là, et le 15 au matin ses trois tests tombaient sur « Le diner
 * du 2026-09-14 est sorti de la semaine affichée ». Rien n'avait changé dans
 * l'app. C'est la même faute que celle que ce fichier raconte plus haut à
 * propos de `convient` — un parcours qui dépend d'une propriété doit la
 * DEMANDER —, appliquée au temps : la semaine affichée est calculée autour
 * d'aujourd'hui, donc c'est aujourd'hui qu'il faut viser.
 *
 * Même calcul que `jourISO` côté app (`db/schema.ts`), en local et pas en UTC :
 * le navigateur de Playwright tourne sur cette machine, avec ce fuseau.
 */
export function aujourdhuiISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const jj = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${jj}`;
}
