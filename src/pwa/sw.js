// Le service worker — ce qui fait qu'une cuisine sans réseau ouvre quand même.
//
// CE FICHIER EST UN MODÈLE, PAS LE WORKER LIVRÉ. `plugin.ts` y injecte la liste
// des fichiers du build et une version, puis écrit `dist/sw.js`. Il ne passe
// donc ni par Rollup ni par TypeScript, et n'importe rien : un worker est un
// autre monde que la page — pas de `import.meta.env`, pas de JSX, pas de
// module de l'app. Ce qu'il sait, il le reçoit sous forme de constantes.
//
// LA STRATÉGIE TIENT EN UNE PHRASE. Le build est un ENSEMBLE FINI, connu au
// moment où on le construit : on le met en cache EN ENTIER à l'installation, on
// le sert depuis le cache, et on ne devine rien. Surtout pas de « je garde ce
// que j'ai servi » : ce qu'une visite n'a pas demandé est précisément ce qui
// manquera le jour sans réseau, et on ne l'apprendrait qu'à ce moment-là.
//
// LA NAVIGATION EST TOUJOURS LA MÊME PAGE, et c'est le routeur en dièse de T7
// qui le permet : `#/cuisine/semaine` ne quitte jamais `/index.html`. Un lien
// profond ouvert hors ligne n'a donc besoin d'aucune réécriture côté serveur —
// ce qui était déjà l'argument du dièse, et qui se paie ici en une ligne.
//
// LA VERSION EST DANS LE NOM DU CACHE. Un cache par build, l'ancien effacé à
// l'activation : rien ne se « met à jour » en place, donc rien ne peut se
// retrouver à moitié à jour — un JS neuf avec un JSON vieux d'un mois.

const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `intendance-${VERSION}`;

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      // `cache: "reload"` court-circuite le cache HTTP du navigateur. Sans lui,
      // on peut précacher l'index.html de la version PRÉCÉDENTE, encore frais
      // dans le cache du navigateur — et livrer un service worker neuf qui sert
      // l'ancienne app pour toujours.
      await c.addAll(PRECACHE.map((f) => new Request(f, { cache: "reload" })));
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      // Prendre la main tout de suite : sans ça, la toute première visite reste
      // non contrôlée, et l'app ne serait hors-ligne qu'au chargement suivant —
      // « installée mais pas encore utilisable » est le pire des deux états.
      await self.clients.claim();
    })(),
  );
});

// LE REMPLACEMENT EST UNE DÉCISION, ET ELLE APPARTIENT AU DOIGT. Un worker qui
// s'installe ne prend jamais la place du sien de lui-même : il attend que la
// page le lui demande (bandeau « une nouvelle version est prête »). Sauter
// l'attente d'office échangerait le code sous une page en train de servir, au
// milieu d'une saisie de parts ou d'une recette ouverte.
self.addEventListener("message", (e) => {
  if (e.data === "passe") void self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const requete = e.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  // Une autre origine ne fait pas partie du build : on ne s'en mêle pas. L'app
  // n'en appelle aucune (les polices sont auto-hébergées depuis T2), et le jour
  // où elle le ferait, la laisser passer est le bon comportement par défaut.
  if (url.origin !== self.location.origin) return;

  e.respondWith(servir(requete.mode === "navigate" ? "/index.html" : url.pathname, requete));
});

async function servir(cle, requete) {
  const c = await caches.open(CACHE);
  const connue = await c.match(cle);
  if (connue) return connue;
  // Hors de l'ensemble fini : on demande au réseau, et on n'invente pas de
  // réponse. Hors ligne, l'échec est le message juste — un 404 déguisé en page
  // d'accueil coûterait une heure à diagnostiquer.
  return fetch(requete);
}
