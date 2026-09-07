// Les gestes que plusieurs parcours refont, et rien d'autre.
//
// AUCUNE ÉCRITURE EN BASE ICI. On pourrait semer une semaine dans IndexedDB en
// trois lignes et gagner dix secondes ; on poserait alors des plats que l'app
// n'a jamais acceptés, et le jour où « poser » cesserait de fonctionner, les
// parcours des courses resteraient verts. Ce qu'un doigt fait, le doigt le
// fait.

import { expect, type Page } from "@playwright/test";

/** La première case libre de la semaine, dépliée. Renvoie le nom du plat qu'on
 *  vient d'y poser. */
export async function poserUnPlat(page: Page): Promise<string> {
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

  const carte = page.locator(".co-jouable").first();
  await expect(carte).toBeVisible();
  const titre = (await carte.locator(".tete .nom").innerText()).trim();
  await carte.getByRole("button", { name: "Poser sur ce créneau" }).click();

  // `jouer` renvoie sur la semaine une fois l'écriture faite : c'est là qu'on
  // sait que le tour est complet, base comprise.
  await expect(page.locator(".co-slots").first()).toBeVisible();
  return titre;
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
