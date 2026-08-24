# intendance — l'app

**intendance** *n.f.* — la conduite d'une maison : ses stocks, ses plafonds, son
approvisionnement, son calendrier. C'est ce que cette app calcule.

Concrètement, le shell multi-facettes de
[Workspace#36](https://github.com/chapellu/Workspace/issues/36) : une seule app
installée, portant les facettes de vie (cuisine, jardin, …). La facette cuisine
prend la forme de la direction « Le comptoir » du canevas Claude Design.

Le mot ne dit ni le jardin ni la cuisine en particulier, et laisse la place aux
facettes qui viendront. Dans le code, le châssis reste « la coquille » : le nom
de l'app et le nom de sa structure n'ont pas à être le même mot.

**Ce n'est pas `apps/proto-shell`.** Le proto répondait à une question de design
avec du code jetable et sans persistance ; celui-ci est l'app, sur la stack
décidée par [Workspace#6](https://github.com/chapellu/Workspace/issues/6) :
Vite + React + TypeScript + Dexie.

## Faire tourner

```sh
npm install
npm run dev        # écoute sur 0.0.0.0 — l'app se juge sur un téléphone du réseau
npm run typecheck
npm test
npm run build
```

`npm run build` typecheck avant de construire : un `dist/` qui sort d'un code
qui ne compile pas n'a rien à faire dans une image.

## La PWA

L'app s'installe sur l'écran d'accueil et s'ouvre sans réseau. Trois pièces :

- `public/manifest.webmanifest` — le nom, les couleurs, les icônes,
  `display: standalone`. `start_url` et `scope` sont RELATIFS : l'app ne décide
  pas de l'endroit où elle sera servie, et un chemin absolu la casserait sous
  un sous-répertoire. Lancée depuis l'écran d'accueil, l'app ouvre donc le
  cockpit — la route par défaut, et la bonne question du matin.
- `public/icones/` — les SVG sont la source, les PNG en sont un rendu commité.
  `node scripts/icones.mjs` les refabrique quand un SVG change.
- `src/pwa/` — le worker (`sw.js`, un modèle), le greffon Vite qui y injecte la
  liste du build (`plugin.ts`), et l'inscription côté page (`maj.ts`).

Le worker précache le build ENTIER à l'installation — document, code, styles,
polices, catalogue, icônes — et le sert depuis le cache. C'est ce qui permet à
un lien profond de s'ouvrir hors ligne : avec le routeur en dièse, toute
navigation est la même page.

Il n'existe qu'en production : `npm run dev` n'en pose aucun, et désinscrit
celui qu'une prévisualisation aurait laissé sur le même port.

**Une nouvelle version ne se substitue jamais toute seule.** Elle s'installe à
côté, la page l'annonce (« une nouvelle version est prête »), et c'est un doigt
qui la fait passer. Conséquence pour le serveur : **`/sw.js` se sert sans cache
HTTP** — sous un `Cache-Control` long, il ne serait jamais revérifié et l'app
resterait sur sa version pour la durée de ce cache. C'est la règle que
`nginx.conf` applique.

## Déployer

`intendance.chapellu.fr`, **à côté** de `proto.chapellu.fr` et pas à sa place :
les deux tournent tant que le prototype sert encore de référence.

- `Dockerfile` — deux étages. Node construit `dist/` (en typecheckant d'abord),
  nginx-unprivileged le sert ; l'image finale ne contient ni Node, ni
  `node_modules`, ni les sources. Les fichiers compressibles sont gzippés une
  fois au build et servis tels quels (`gzip_static`) : le nœud est un ARM à un
  cœur.
- `nginx.conf` — une seule règle : ce dont l'URL porte l'empreinte
  (`/assets/…`) se garde un an, tout le reste se revalide.
- `k8s/intendance/` — namespace, deployment, service, HTTPRoute ;
  `k8s/flux/intendance.yaml` les fait réconcilier par Flux, après
  `infrastructure-config` (le Gateway et le ClusterIssuer d'abord).
- `.github/workflows/intendance-image.yml` — typecheck, tests et parité, PUIS
  l'image sur GHCR, puis le SHA épinglé dans le deployment. Flux fait le
  rollout : rien ne s'applique hors bande.
- le listener `https-intendance` du Gateway partagé (cert-manager émet
  `intendance-tls`) et le rrset `intendance_a` dans `infra/dns.tf`.

## L'état des travaux

`BACKLOG.md` porte les vingt tickets et leur avancement. Un ticket = un commit
qui laisse l'app fonctionnelle.
