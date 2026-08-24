// L'inscription du service worker, et la seule question qu'elle pose à
// l'utilisateur : « je remplace maintenant, ou plus tard ? »
//
// UNE PWA NE SE RECHARGE JAMAIS TOUTE SEULE. Ouverte depuis l'écran d'accueil,
// elle peut rester la même page pendant des jours : sans rien, un déploiement
// n'arriverait qu'au prochain redémarrage du téléphone. Sans rien non plus, le
// premier réflexe — remplacer d'office dès qu'une version est prête — échange
// le code sous une page en train de servir. D'où les deux moitiés d'ici : on
// VÉRIFIE souvent (à chaque retour au premier plan), on ne REMPLACE que sur un
// doigt.

import { useEffect, useState } from "react";

let inscription: Promise<ServiceWorkerRegistration | null> | null = null;

/** Une seule inscription pour la vie de l'onglet, quel que soit le nombre de
 *  composants qui la demandent — `StrictMode` monte deux fois. */
export function enregistrer(): Promise<ServiceWorkerRegistration | null> {
  inscription ??= demarrer();
  return inscription;
}

async function demarrer(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  if (!import.meta.env.PROD) {
    // LE PIÈGE DU MÊME PORT. `vite preview` et `vite dev` partagent une origine
    // à un chiffre près, et un worker inscrit par une prévisualisation continue
    // de servir son cache au serveur de développement — on modifie alors du
    // code qui ne s'affiche jamais. On le désinscrit donc explicitement plutôt
    // que de se contenter de ne pas en poser un.
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    return null;
  }

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Uniquement après un « Recharger » : à la toute première visite, le worker
    // prend la main de lui-même (`clients.claim`) et recharger là serait un
    // clignotement gratuit sur l'écran d'ouverture.
    if (demande) location.reload();
  });

  return navigator.serviceWorker.register("/sw.js");
}

let demande = false;

/** `prete` : une version est installée et attend de prendre la place. */
export function useMiseAJour(): { prete: boolean; passer: () => void } {
  const [attente, setAttente] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    let vivant = true;
    let revoir: (() => void) | null = null;

    void enregistrer().then((r) => {
      if (!r || !vivant) return;

      const voir = () => {
        // `controller` absent = première installation : il n'y a rien à
        // remplacer, et annoncer une « nouvelle version » à quelqu'un qui vient
        // d'ouvrir l'app pour la première fois n'aurait aucun sens.
        if (r.waiting && navigator.serviceWorker.controller) setAttente(r.waiting);
      };
      voir();
      r.addEventListener("updatefound", () => {
        const neuf = r.installing;
        neuf?.addEventListener("statechange", () => {
          if (neuf.state === "installed") voir();
        });
      });

      revoir = () => {
        if (document.visibilityState === "visible") void r.update();
      };
      document.addEventListener("visibilitychange", revoir);
    });

    return () => {
      vivant = false;
      if (revoir) document.removeEventListener("visibilitychange", revoir);
    };
  }, []);

  return {
    prete: attente !== null,
    passer: () => {
      demande = true;
      attente?.postMessage("passe");
    },
  };
}
