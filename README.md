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

**Ce n'est pas le prototype.** `apps/proto-shell`, dans
[chapellu/flagship](https://github.com/chapellu/flagship), répondait à une
question de design avec du code jetable et sans persistance ; celui-ci est
l'app, sur la stack décidée par
[Workspace#6](https://github.com/chapellu/Workspace/issues/6) : Vite + React +
TypeScript + Dexie.

**Ce dépôt porte l'app et son déploiement.** Elle a vécu ses vingt premiers
tickets dans le monodépôt `flagship`, sous `apps/intendance` ; l'historique est
celui-là, commit pour commit. Restent chez `flagship` les deux choses qui sont
de l'infrastructure et pas de l'app : le **listener `https-intendance`** du
Gateway partagé (`k8s/infrastructure-config/gateway.yaml`) et le **rrset DNS**
(`infra/dns.tf`) — plus la `GitRepository` et la `Kustomization` Flux
(`k8s/flux/intendance.yaml`) qui font lire `k8s/` d'ici.

Tout chemin en `apps/…` dans ce dépôt (backlog compris) désigne `flagship`.

## Faire tourner

```sh
npm install
npm run dev        # écoute sur 0.0.0.0 — l'app se juge sur un téléphone du réseau
npm run typecheck
npm test           # unitaires (Vitest)
npm run e2e        # parcours de bout en bout (Playwright, contre le build)
npm run build
```

Deux scripts de mesure, qui n'échouent jamais : ils impriment, et c'est au
lecteur de conclure. `npm run perf` mesure le modèle (aucun navigateur) ;
`npm run banc` mesure l'app dans Chromium — ouverture à froid, repioche,
changement d'écran, et ce que le service worker fait gagner selon le réseau. Il
veut un serveur en face : `npm run build && npm run preview` dans un autre
terminal.

`npm run e2e` construit et sert l'app lui-même. Les parcours vont contre le
**build de production**, parce que c'est le seul endroit où le service worker
existe — et hors ligne, la mise à jour et l'installation sont justement ce
qu'un test unitaire ne peut pas voir.

`npm run build` typecheck avant de construire : un `dist/` qui sort d'un code
qui ne compile pas n'a rien à faire dans une image.

## Le catalogue

`public/cuisine-data.json` est un **artefact**, jamais une source. Il se
fabrique depuis `catalogue/`, qui porte le corpus de recettes et le modèle
Python qui le valide :

```sh
npm run catalogue          # refabrique public/cuisine-data.json
npm run catalogue:verifie  # vérifie le corpus PUIS que le fichier commité est à jour
```

Le second tourne en CI. Il demande `python3` et `pyyaml`.

**Pourquoi le corpus vit ici.** Il a passé ses premiers mois dans
`chapellu/Workspace`, sous `prototypes/recipe-compiler`, et l'app y lisait un
vidage exporté à la main. Ça a dérivé exactement comme ce genre de couplage
dérive toujours : le JSON commité est resté à **51 plats** pendant que le corpus
en portait **86**, et la nature de créneau `optionnel` — donc les quinze
desserts — n'a jamais atteint l'écran. Le `CLAUDE.md` de Workspace dit par
ailleurs de lui-même « scratch workspace », ce qui n'est pas un domicile pour
soixante recettes saisies à la main depuis un livre papier : chacune a coûté une
photo, une lecture et des arbitrages, et c'est l'actif le moins reproductible du
projet.

L'historique a suivi, commit pour commit, comme lors du départ de `flagship` —
`git log` remonte jusqu'au premier prototype de compilation.

**Ce que `catalogue/` contient.** Les recettes (`recipes/`), la table du foyer
(`household.yaml` : mangeurs, équipement, contenants, exclusions), les rayons,
les créneaux, l'équilibre, les règles de repli d'ustensile, et l'index
bibliographique des livres du foyer (`sources/`). Plus le modèle Python qui
compile une recette contre ce foyer, le vérificateur qui refuse un corpus
incohérent, et `README.md` — le carnet de bord de ce que la saisie a révélé du
modèle, recette par recette.

**Ce que le garde-manger sert à décider.** Chaque denrée porte une *urgence* —
`haute`, `moyenne`, `basse` — dérivée de son conditionnement et de sa zone, sans
aucune date : le relevé n'en porte pas. Le score s'en sert pour remonter les
plats qui mangent ce qui se perd, et l'écran en tire la liste « À manger en
premier ». Les deux se lisent ensemble : le score départage, la liste désigne.

**Et une denrée qui court a DEUX sorties, pas une.** La cuisiner ce soir, ou
arrêter son horloge — `conservation.yaml` porte la seconde depuis le prototype :
« l'aliment a une horloge, et le transformer remet l'horloge à zéro, mais
seulement si on a le séchoir et qu'on a appris à s'en servir. » Chaque denrée à
risque porte donc ses méthodes applicables, acquises ou verrouillées. Trois
filtres les taillent, et le premier est une règle de sécurité : le bain-marie ne
sort jamais sur un aliment peu acide (botulisme — voir l'avertissement en tête de
`conservation.yaml`), `applique_a` écarte ce qui n'a pas de sens pour la matière,
et `conserve_mal` couvre ce que le modèle général rate, comme la pomme de terre
crue au congélateur.

**La saison se lit sur l'ingrédient, pas sur la recette.** `saisons.yaml` porte
le calendrier de récolte du CIVAM / DRAAF Auvergne-Rhône-Alpes — la région du
foyer, information publique réutilisable. Le modèle **pénalise le hors-saison
avéré et ne récompense jamais l'en-saison** : la source couvre 27 ingrédients sur
57, sans aucun fruit, et un bonus refléterait ses trous plutôt que les saisons.
Ce qui *se garde* (oignon, ail, pomme de terre, racines) n'est jamais pénalisé —
récolte n'est pas disponibilité.

**Un créneau porte un plat ET ce qu'on met à côté.** Le corpus vient d'un livre
de cuisine, où personne n'écrit « faire cuire des pâtes » : 21 des 65 plats
jouables au repas principal sont donc des BRIQUES — il leur manque un pilier
(protéine, féculent, légumes). `recipes/_accompagnements.yaml` porte les neuf
recettes qui comblent ce décompte-là, marquées `accompagnement: true` : elles ne
se piochent jamais comme un plat, elles se posent à côté d'un plat déjà choisi.
La complétude se juge donc sur l'ASSIETTE et non sur la recette — un rôti manque
d'un féculent, le même rôti avec du riz n'en manque plus. Un accompagnement entre
au panier, compte dans les minutes du jour et dans la couverture de la semaine
(du riz quatre soirs de suite est une répétition) ; la seule chose qu'il ne fait
pas, c'est décider du format du repas, d'où l'absence de `profil`.

**Deux fichiers portent des stocks, et ce ne sont pas les mêmes.**
`stock.yaml` porte les SORTIES DE CUISINE — des bases cuisinées, indexées sur ce
que les recettes émettent, mangées par le graphe de chaînage.
`garde-manger.yaml` porte la MATIÈRE PREMIÈRE — indexée sur le vocabulaire
d'ingrédients de `rayons.yaml`, rangée dans des zones physiques qui ont des
cotes, une exposition et une hygrométrie. Une conserve de maïs va dans le second :
la mettre dans le premier la ferait entrer dans le chaînage, et le planificateur
proposerait de l'« enchaîner ».

**Le garde-manger reste descriptif — rien ne décrémente une denrée quand on
cuisine — et il agit quand même sur la liste de courses.** Un ingrédient dont le
relevé dit qu'il en reste ne part pas au panier : il passe « à vérifier », dont le
contrat n'a jamais été « tu en as assez » mais « va voir avant d'acheter ». C'est
ce qui permet de le brancher sans suivre la consommation. Deux provenances
distinctes le portent : `placard` (on en a toujours — le sel) et `garde-manger`
(il en reste, quantité inconnue — quatre boîtes de maïs).

**Le modèle Python ne tourne pas dans l'app.** L'app a le sien, en TypeScript,
sous `src/model/`. Le Python sert à valider le corpus et à produire le JSON.

`npm run parite` rejouait les mêmes semaines dans le modèle du prototype et dans
celui de l'app, et prouvait que le port disait la même chose. **Il a été retiré
en T22** : depuis que le scoring tient compte du garde-manger — que le proto
ignore — la parité ne pouvait plus qu'échouer, et un contrôle qui doit échouer
n'en est plus un.

## Partager la liste

L'app est locale — Dexie sur IndexedDB, aucun serveur. « Partager la liste »
encode donc les DÉCISIONS de la semaine dans l'URL (`#/partage/…`, ~400
caractères) ; l'app d'arrivée recalcule la liste depuis le même catalogue et
**n'écrit rien**, si bien qu'ouvrir le lien de quelqu'un n'écrase pas sa propre
semaine.

C'est un **instantané**, et l'écran le dit : rien ne remonte, et il n'y a pas de
cases à cocher. Ce qu'on ne peut pas tenir sans serveur, on ne l'offre pas.

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
- `k8s/` — namespace, deployment, service, HTTPRoute. Flux les lit ICI :
  `flagship` déclare la source et la `Kustomization` qui pointent sur ce dépôt,
  et les fait réconcilier après `infrastructure-config` (le Gateway et le
  ClusterIssuer d'abord).
- `.github/workflows/image.yml` — typecheck, tests, parité et parcours, PUIS
  l'image sur GHCR, puis le SHA épinglé dans `k8s/deployment.yaml`. Le CI
  n'écrit que dans ce dépôt : c'est ce qui évite un jeton croisé, et c'est la
  raison pour laquelle les manifestes sont ici plutôt que chez `flagship`.
- chez `flagship` : le listener `https-intendance` du Gateway partagé
  (cert-manager émet `intendance-tls`) et le rrset `intendance_a`
  (`infra/dns.tf`).

## L'état des travaux

`BACKLOG.md` porte les vingt tickets et leur avancement. Un ticket = un commit
qui laisse l'app fonctionnelle.
