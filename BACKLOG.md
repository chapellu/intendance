# intendance — le vrai squelette

> **intendance** *n.f.* — la conduite d'une maison : ses stocks, ses plafonds,
> son approvisionnement, son calendrier. C'est ce que le modèle calcule ; le mot
> ne se réduit ni au jardin ni à la cuisine, et laisse la place aux facettes qui
> viendront. Dans le code, la coquille reste « la coquille » : le nom de l'app
> et le nom de son châssis n'ont pas à être le même mot.

> **Où ce backlog a été écrit.** Les vingt tickets ont été menés dans le
> monodépôt `chapellu/flagship`, où l'app vivait sous `apps/intendance`. Elle a
> depuis son propre dépôt, avec son historique. Les chemins en `apps/…` qu'on
> lit ci-dessous désignent donc `flagship` — ils n'ont pas été réécrits : ils
> disent où la décision a été prise.

**Ceci n'est pas un prototype.** `apps/proto-shell` répondait à une question de
design et sera supprimé ; ceci est l'app, sur la stack décidée par
[Workspace#6](https://github.com/chapellu/Workspace/issues/6) : **Vite + React +
TypeScript + Dexie**.

Le shell multi-facettes de [Workspace#36](https://github.com/chapellu/Workspace/issues/36) :
une seule app installée, portant les facettes de vie (cuisine, jardin, …). La
facette cuisine prend la forme de la **direction 1 « Le comptoir »** du canevas
Claude Design, déjà transcrite en vanilla dans `apps/proto-shell/comptoir.js` —
ce fichier est la **spécification exécutable** du port React : il a résolu, une
par une, toutes les questions de branchement au modèle.

## Ce qui change par rapport au proto

| Le proto | Le squelette |
|---|---|
| état en mémoire, perdu au rechargement | **Dexie**, l'état survit — c'est le point de bascule demandé |
| `semaine.js` en JS, sans types | modèle TypeScript, types dérivés de l'export |
| un `innerHTML` géant par écran | composants React, un écran par route |
| `offre()` recalculé à chaque rendu, cru très coûteux | mesuré : 1 ms, rien à mémoïser (T17) |
| pas de build, nginx sert des fichiers | build Vite, image, k8s, PWA installable |

## Ce que « persistance » veut dire ici

L'hypothèse, à corriger si elle est fausse : ce qui doit survivre au
rechargement, c'est **ce qu'un doigt a décidé**, pas ce qu'un calcul a déduit.

- **persisté** : la semaine posée (plat par créneau, repas sautés), les parts
  réglées, les courses cochées puis rentrées, le stock réel du foyer, les
  réglages du foyer ;
- **recalculé** : le panier, le chaînage, les manques, les offres, le bilan de
  rangement — tout ce que `calculer()` dérive. Persister un résultat de calcul,
  c'est se garantir qu'il divergera un jour de ses entrées.

## Les tickets

Un ticket = un commit qui laisse l'app fonctionnelle. `[ ]` à faire,
`[~]` en cours, `[x]` fait.

### Fondations

- [x] **T1 — Squelette Vite + React + TS.** `apps/intendance` : Vite 5, React 18, TS
      en `strict`, Vitest, scripts npm (`dev`, `build`, `test`, `typecheck`).
      Un `App.tsx` qui rend « Le comptoir » et rien d'autre. Critère : `npm run
      build` et `npm run typecheck` passent.
- [x] **T2 — Le système de design Organic.** `src/styles/organic.css` : les
      tokens et les primitives (`.btn`, `.card`, `.tag`, la coquille) portés
      depuis `apps/proto-shell/organic.css`, cette fois en `:root` — l'app n'a
      qu'un seul système de design, le scopage sur `.co` n'avait de raison
      d'être que la cohabitation. Polices **auto-hébergées** : le proto payait
      une requête Google à chaque chargement, une PWA hors ligne ne le peut pas.
- [x] **T3 — Les types du catalogue.** `src/model/types.ts` : `Plat`,
      `Ingredient`, `Emit`, `Accept`, `Foyer`, `Creneau`, `Stock`… dérivés de
      `cuisine-data.json`. Plus un chargeur qui valide à l'entrée : un export
      qui a dérivé doit échouer bruyamment, pas produire un écran faux.
- [x] **T4 — Le cœur du modèle.** Port TS de `Stock`, `prelever`, `provenance`,
      `facteur`, `calculer`, `bilanStockage`. Tests unitaires repris des
      contrôles du smoke : le bocal qui se vide au lieu de se dupliquer, la base
      absente qui ne part pas aux courses, les deux plafonds par espace.
      Plus `npm run parite`, qui joue les mêmes semaines dans les deux modèles
      et compare tout ce que `calculer` produit — un port se prouve par
      l'égalité, pas par ses propres tests.
- [x] **T5 — Le reste du modèle.** `offresSurproduction`, `gamelles`,
      `couverture`, `categorie`, `offre`, `main`, `articles`, `parRayon`,
      `minutesParJour`. Tests sur le scoring — c'est lui qui décide ce que
      l'écran propose. `npm run parite` couvre désormais les offres et leurs
      getters, les gamelles, la couverture, le score de chaque carte sur chaque
      créneau libre, la main tirée sur trois repioches, et l'enseigne des
      51 plats.
- [x] **T6 — Dexie.** `src/db/` : schéma versionné, couche d'accès, hooks
      `useLiveQuery`. Quatre tables : `creneaux` (le plat ET les parts, qui sont
      deux décisions sur le même créneau), `courses`, `stock`, `reglages`.
      **La clé d'un créneau est (jour, repas), jamais son index** — sinon une
      semaine qui roule déplace les plats de trois jours sans que rien
      n'échoue. Pas de migration vide en v1 : elle ne s'exécuterait sur aucune
      base et on la croirait testée. À la place, un test épingle la version et
      les tables, et rougira le jour où une table s'ajoute sans migration.
- [x] **T7 — La coquille et le routeur.** Barre du bas (cockpit · cuisine ·
      jardin), sous-nav cuisine, une route par écran. Routeur écrit sur place
      plutôt qu'importé : la navigation est un ensemble FINI et plat, et une
      union discriminée fait vérifier par le compilateur qu'aucun écran n'est
      oublié — ce qu'aucune chaîne `/cuisine/:vue` ne fera. Hash et non chemin :
      un lien profond marche sans que le serveur en sache rien, y compris hors
      ligne. **Un créneau se nomme (jour, repas) dans l'URL aussi**, pour la
      même raison qu'en base. Les dix écrans existent en carton daté de leur
      ticket : une route qui mène au blanc ne se distingue pas d'une route
      cassée.

### Les écrans (portés de `comptoir.js`, un par ticket)

- [x] **T8 — Aujourd'hui.** Ce soir, le geste du jour, l'offre en attente,
      demain. Sans défilement sur un 390 × 844 : mesuré à 666 px de contenu
      pour 666 px de vue. Le geste et le rappel sont des décisions et sont
      persistés, sous une clé qui porte le JOUR — « sortir la sauce du congélo »
      est fait pour aujourd'hui, pas pour toujours.
- [x] **T9 — La semaine.** Sept journées, midi/soir, le point sauge du
      chaînage, la plomberie au doigt. La case ouverte se désigne par
      (jour, repas) comme tout le reste — c'est un regard et pas une décision,
      donc rien en base, mais une fenêtre qui glisse à minuit déplierait la
      carte du voisin. Trois écarts assumés au proto, chacun parce que le proto
      avait tort : les trois chiffres sont NOMMÉS (« 22 articles », pas « 22 »),
      la routine se dit une fois pour la semaine au lieu de sept fois, et
      « Poser un plat » vise le premier créneau libre au lieu du dernier
      touché. Corrigé au passage : la coquille avait `min-height: 100dvh` —
      le premier écran plus long qu'un téléphone emportait la barre du bas
      hors de l'écran.
- [x] **T10 — À prévoir.** Déjà enchaîné / offres ouvertes, avec leurs
      réserves. Les deux gestes de l'écran sont le même geste : agrandir un lot
      comme prévoir une gamelle, c'est **régler les parts d'un créneau amont** —
      le modèle n'a pas d'autre levier, et c'est ce qui rend ces offres
      relisibles ailleurs. La gamelle écrit DEUX décisions (le dîner grossit, le
      midi part sur le reste) : une transaction, sinon un rechargement au mauvais
      moment laisse un dîner cuisiné pour six sans personne pour en manger la
      moitié. Le compte de la pastille vient désormais d'ici — une pastille qui
      annonce un autre nombre que la liste qu'elle ouvre est pire que pas de
      pastille. Deux bugs du proto corrigés, tous deux vus au navigateur :
      l'offre s'arrondissait au demi le PLUS PROCHE et laissait 33 g de sauce
      derrière elle (« en faire 1,36× » devenait « 1,02× » au lieu de
      disparaître) ; et le constat d'une gamelle réglée recomptait la gamelle
      une seconde fois — « 7,5 parts au lieu de 5 » sur un dîner cuisiné pour 5.
- [x] **T11 — Poser un plat.** Les trois chiffres épinglés, les cartes
      consomme/produit. L'écran central de la direction : tout le reste de
      l'app existe pour que ce choix-là soit informé. Le nombre de **repioches
      est persisté** — la main est déterministe en (créneau, repioches), donc
      sans ce compteur, quitter l'écran et revenir redonne la main qu'on venait
      de refuser ; ce n'est pas une décision sur la semaine, c'est la mémoire
      d'un refus. La route `cuisiner` gagne un plat optionnel :
      `#/cuisine/cuisiner/2026-08-22/diner/lentilles-mijotees` — « Fiche »
      s'ouvre sur le CANDIDAT, pas sur ce que le créneau porte encore.
      Mesuré au navigateur : une main sur une semaine pleine coûte 55 à 62 ms
      ici — dont 1 ms de modèle, le reste étant Dexie et le rendu (voir T17,
      qui a corrigé la prémisse de perf de ce backlog).
- [x] **T12 — En cuisine.** Mode guidé, une étape par écran, chauffe et
      minuteur, la liste d'ingrédients à un bouton. Seul écran hors coquille :
      ni barre du bas ni sous-navigation, on le lit à bout de bras. **Ce qui se
      persiste ici n'est pas une décision mais un AVANCEMENT** — où l'on en est
      dans la recette, et jusqu'à quand le minuteur court. C'est le seul état
      dont la perte fasse vraiment mal : un téléphone qui se verrouille à
      l'étape 5 sur 9 avec une casserole sur le feu. Le minuteur est une
      **échéance, pas un compteur** : le proto décrémentait une seconde par
      `setInterval`, ce qui est faux dès que l'onglet passe en arrière-plan —
      les navigateurs mobiles y ralentissent les timers à un battement par
      minute, c'est-à-dire exactement quand on repose le téléphone pour
      cuisiner. Vérifié en décalant l'horloge de la page de dix minutes sans
      laisser tourner un seul battement : le minuteur sonne.
      Quinze plats du catalogue n'ont pas d'étapes ; la fiche s'ouvre alors sur
      la liste d'ingrédients, ce qui est tout ce qu'on peut en dire.
- [x] **T13 — Courses.** Deux modes (magasin / maison), le hors-liste. Le
      premier écran de la direction qui vive sur la persistance : cocher,
      fermer, rouvrir. **La liste est calculée, les marques sont stockées** —
      aucun calcul ne peut retrouver ce qu'un doigt a mis dans un caddie. Le
      mode, lui, n'est PAS persisté : c'est un endroit où l'on se trouve, et
      rouvrir l'app trois jours plus tard sur « à la maison » parce qu'on y
      était samedi serait pire que le tap qu'on économise. Ajouté au proto :
      « Tout rentrer », le geste de vider le sac — on ne rentre pas douze
      articles un par un en tenant un cabas — et le compte des marques
      orphelines (voir ci-dessous). Corrigé au proto : son aide promettait
      qu'un article rentré « rejoint le stock et le plat qui l'attendait passe
      en trouvé », ce qu'il ne faisait pas. L'app non plus, et T15 a montré
      pourquoi ce n'est pas qu'un fil manquant — voir « Rentrer une course ne
      peut pas faire un lot » ci-dessous.
- [x] **T14 — Les parts.** Deux cibles de 64 px, pas de 0,5, l'aperçu de la
      semaine. Le levier le plus conséquent de l'app — les parts d'un créneau
      commandent le panier, les restes et le chaînage — et c'est le même que
      « À prévoir » actionne pour agrandir un lot ou prévoir une gamelle :
      rien de ce que l'app propose ne passe par un chemin qui ne se relise pas
      ici. **La taille du foyer s'écrit `null`**, jamais 2,5 : régler un
      créneau sur exactement le foyer n'est pas une décision sur ce créneau,
      c'est l'absence de décision, et y figer un chiffre priverait ce créneau
      du jour où un mangeur s'ajoute. **Le nombre bouge sous le pouce et la
      base suit** — deux cibles de 64 px sont faites pour être tapées vite, et
      sans ça deux taps rapprochés partent du même état, donc le second se
      perd ; vérifié au navigateur, cinq taps rapides font bien +2,5. Quatre
      écarts au proto : l'aperçu est CLIQUABLE (régler la semaine, c'est régler
      plusieurs créneaux d'affilée) et il contient le créneau courant, marqué,
      au lieu des six premiers de la semaine — on réglait un chiffre au-dessus
      d'une liste où il ne figurait pas ; la règle de crans suit toujours la
      valeur, alors que le proto la figeait sur foyer ± 2 et n'allumait plus
      rien à huit parts, c'est-à-dire exactement le soir où on la regarde ;
      « Cuisiné » dit POURQUOI il ne bouge pas quand on descend le nombre (un
      lot entier ne se coupe pas, un plat qui se garde se fait en entier) ; et
      le « – » se désactive au plancher au lieu de ne rien faire — un rond de
      64 px immobile se lit comme une panne. Corrigé au passage : la réserve
      annonçait « au-delà, ça ne tient pas » au moment précis où c'était déjà
      dépassé.
- [x] **T15 — L'inventaire.** Les catégories et leur fiabilité, les deux
      plafonds par espace, les lots. **La table `stock` est entrée dans le
      calcul** : `Jeu` porte désormais son propre stock, `calculer` et
      `bilanStockage` le lisent là, et `db/stock.ts` l'y repose depuis la base
      — `creerJeu` continue de l'amorcer avec `catalogue.stock` pour qu'un jeu
      sans base reste calculable, ce qui garde `npm run parite` au vert. Le fil
      est vérifié au navigateur de bout en bout : sur un dîner de pâtes qui
      chaîne sur le bocal du congélo, la liste de courses passe de **2 à 5
      articles** quand on retire le bocal, et le budget du congélo de 16 à 18
      places libres. Trois choses que le catalogue ne permettait pas et que la
      base demande : un lot peut être **constaté sans être pesé** (`qty` à
      `null` — le dépôt le sert en entier et le dit `approximatif`, au lieu de
      faire semblant de compter), une quantité sans unité ne chiffre rien, et
      une ligne du dépôt porte une `ref` opaque — la clé de base — pour que
      l'écran retrouve la ligne qu'un doigt touche **sans faire correspondre
      deux listes par leur index**, la même erreur que la clé d'un créneau.
      L'app attend l'amorce avant de dessiner : entre le premier rendu et la
      fin de l'écriture, la table est vide, et une cuisine vide n'est pas un
      état d'attente — c'est une réponse fausse, avec des manques qui
      apparaissent puis disparaissent. **Un seul geste, et il est réversible :
      « je n'en ai plus »**, parce que c'est le mensonge que la persistance
      rendait possible — un bocal mangé hors de l'app restait au congélo pour
      toujours et l'app continuait de chaîner dessus. Il ne s'offre que sur les
      lots CONSTATÉS : ce que la semaine produit est un résultat de calcul, et
      se retire en changeant la semaine. Le lot revient avec sa date de
      naissance, pas celle d'aujourd'hui — annuler une bévue ne doit pas
      rajeunir un bocal de trois semaines. Deux écarts au proto, tous deux
      parce que le proto se contredisait ou criait dans le vide : le compte
      d'un rangement disait « 3 lots » au-dessus d'une liste qui en montrait
      cinq (les mangés comptent, ils se disent), et « dégager une étagère »
      s'affichait sous les trois rangements en permanence — un impératif qui
      est toujours là ne se distingue plus, le jour où il compte. Il ne paraît
      maintenant que quand ça déborde ou qu'il reste moins d'une place.
      Corrigé au passage : un filtre de rangement dont on retire le dernier lot
      se relâche tout seul, au lieu de laisser l'écran sur une liste vide
      titrée d'un rangement qui n'est plus offert.
- [x] **T16 — Le cockpit.** La journée d'abord, les cartes de facette ensuite.
      L'écran d'ouverture de l'app : ce qu'on voit en la lançant n'est pas une
      facette, c'est la journée — sinon la cuisine devient la seule chose qui
      compte, et le jour où le jardin existe il faut rouvrir l'app ailleurs.
      **Le jardin ne produit aucune tâche, et c'est le principal écart au
      proto** : ses trois lignes (« semer la mâche », « observer le bac 2 »,
      « récolter le basilic ») viennent de `data.js`, écrites à la main pour le
      canevas. Aucun modèle ne les calcule, aucune base ne les porte, rien ne
      saurait dire qu'elles sont faites — et un cockpit qui réclame de semer la
      mâche tous les jours de l'année apprend à ne plus lire le cockpit. La
      facette garde sa carte et dit qu'elle n'a pas de modèle. **La pastille de
      la barre du bas est la liste elle-même**, comme celle de « À prévoir »
      depuis T10 : `App` monte la coquille dans un composant à part pour
      pouvoir lire la base au-dessus d'elle, plutôt que de deviner un compte
      que l'écran contredirait. Ajouté au proto : « Poser le dîner de ce soir »
      — le proto pré-remplissait sa semaine au démarrage et ne voyait donc
      jamais un créneau vide, alors que c'est le premier état d'une app qu'on
      installe ; et « on ne mange pas là » retire la ligne, parce que c'est une
      réponse et pas un trou. Le geste du jour a déménagé dans
      `aujourdhui.vue.ts` : deux écrans le disent maintenant, et deux écrans qui
      déduisent chacun de leur côté « sortir le bocal du congélo » finissent par
      le déduire différemment. Trois phrases du proto corrigées, toutes fausses
      pour la même raison — elles décrivaient un état sans le lire : « La
      semaine est posée jusqu'à dimanche » était écrit en dur (faux dès le
      premier créneau vide, et son « dimanche » l'était dès qu'on ouvrait l'app
      un mardi — la fenêtre part d'aujourd'hui) ; « 14 créneaux » comptait les
      créneaux CHOISISSABLES de la semaine, une constante déguisée en chiffre,
      là où ce qui bouge est le nombre de créneaux répondus ; et la ligne des
      courses annonçait « rien de rentré au stock » quel que soit le nombre
      d'articles rentrés — elle lisait les cochés et concluait sur les rentrés.
      Corrigé au navigateur : sur une semaine vide, la carte cuisine affichait
      « 0 article » et « 0 min de cuisine » en pastilles — trois choses à lire
      pour n'en dire aucune. Vérifié au navigateur sur une semaine de cinq
      plats : trois tâches, pastille à 3, et chaque ligne ouvre l'écran qui y
      répond.

### Trouvé en portant, à décider

- [ ] **Le modèle écrit du français.** `Offre.combien`, `deQuoi` et
      `reserves()` rendent des phrases toutes faites — « en faire 1.36× », « un
      lot ne se coupe pas : 0.5 portion(s) de plus à ranger ». Elles portent le
      point décimal anglais et un pluriel entre parenthèses ; l'écran les
      repasse par `virgules()` faute de mieux, parce que la parité avec le proto
      se joue sur ces chaînes exactes. À trancher : le modèle rend-il des
      NOMBRES et l'écran les phrases, ou garde-t-il la parole ? Le premier est
      plus propre et casse la parité ; le second demande d'y écrire un français
      correct. À faire quand `apps/proto-shell` disparaîtra, pas avant.

- [ ] **Le catalogue configure la main, le code l'ignore.** `equilibre.main`
      porte `taille: 5`, `cooldown_jours: 10` et `garantir: [express, souche,
      derive]` ; `main()` code en dur une taille de 4 et les mêmes trois
      enseignes, et ne lit jamais le cooldown. Le port garde ce comportement,
      sinon la parité ne voudrait rien dire. Reste à trancher : la
      configuration a-t-elle raison, ou faut-il la retirer du catalogue ?

- [ ] **Rentrer une course ne peut pas faire un lot.** T15 a branché la table
      `stock` sur le calcul, et la promesse du proto — « l'article rejoint le
      stock, et le plat qui l'attendait passe en trouvé » — reste pourtant
      intenable. Ce n'est pas un fil qui manque, c'est que les deux bouts ne
      parlent pas de la même chose : une ligne de courses est un INGRÉDIENT
      (`oignon`, `pâtes longues`, 140 identifiants), un lot du dépôt est une
      SORTIE de plat (`sauce-bolognaise`, `lentilles-vertes-cuites`, 40 types),
      et les `accepts` ne visent que les secondes. Sur les 140 identifiants
      d'ingrédient du catalogue, un seul coïncide avec un `accepts.type`
      (`parures-legumes`), et il ne s'achète pas. La règle du modèle le dit
      d'ailleurs autrement : une base manquante est `absent`, « à cuisiner
      d'avance », et `absent` ne produit pas de ligne de courses — on n'achète
      nulle part 250 g de lentilles *cuites*. Trancher : ou bien rentrer une
      course écrit un lot d'ingrédient BRUT que le dépôt ne sait pas encore
      servir (et il faudrait alors que `calculer` prélève aussi sur les
      ingrédients, ce qui est une autre modèle), ou bien la phrase du proto
      était fausse et il faut la retirer d'où elle traîne encore. Question pour
      le modèle Python.

- [ ] **Rien n'efface les marques de courses quand la semaine tourne.** Un
      article coché la semaine dernière garde sa marque, et la liste peut
      mentir par omission — la pire façon de mentir pour une liste de courses.
      T13 les compte et offre « Repartir de zéro » plutôt que d'effacer tout
      seul : effacer ce que quelqu'un a coché est un geste qui lui appartient.
      Reste à trancher s'il faut une règle automatique — et alors la table
      `courses` a besoin d'un marqueur de semaine, ce qu'elle n'a pas (elle
      porte `maj`, un horodatage, et la fenêtre de sept jours glisse chaque
      jour : « avant lundi » ne veut rien dire ici).

- [ ] **Le catalogue n'a pas de nom lisible pour ce qu'il produit.** Un `emit`
      porte un `type` (`lentilles-vertes-cuites`, `puree-lentilles-carottes`) et
      une catégorie d'équilibre porte un id (`legumineuse`) — jamais de libellé.
      Les écrans les affichent donc tels quels, identifiants compris : « apporte
      legumineuse, qui manque », « puree-lentilles-carottes » — alors que les
      INGRÉDIENTS, eux, portent un `nom` lisible, ce qui prouve que le format
      sait le faire. Les
      dé-tiretiser produirait du faux français (« puree » sans accent), ce qui
      est pire qu'un jeton qui s'assume. C'est une donnée qui manque au modèle
      Python : un `label` par type et par catégorie, et les huit écrans en
      profitent le même jour.

- [ ] **Un lot congelable posé cette semaine vieillit au frigo.** `calculer`
      range TOUTE sortie avec `location: "frigo"` — le lot n'est pas encore AU
      congélo, il refroidit — mais du coup il sort de la fenêtre de fraîcheur au
      bout de `fenetreFrigo` jours, alors que son `espace` dit congélo. Un plat
      très en aval ne le trouve donc plus. Épinglé par un test dans
      `calcul.test.ts` : le changer sera une décision, pas un effet de bord.
      C'est une question pour le modèle Python, pas pour l'app.

### Le reste

- [x] **T17 — Perf. LA PRÉMISSE ÉTAIT FAUSSE, il n'y a rien à optimiser.**

      Ce backlog a répété pendant onze tickets que poser quatorze créneaux
      coûtait 13,7 s au proto et que le squelette devrait mémoïser `offre()`.
      Remesuré, ce chiffre **ne se reproduit pas** : le préremplissage complet
      de la page du proto, re-rendus compris, prend **111 ms** au navigateur, et
      son modèle seul **57 ms**. Le calcul n'a jamais été cher. Le 13,7 s
      mesurait très probablement une attente réseau — c'est une hypothèse, pas
      un fait ; ce qui est établi, c'est que la mesure d'origine était fausse et
      qu'aucune décision ne doit s'appuyer dessus.

      **Le modèle, mesuré** (`npm run perf`, ajouté par ce ticket et
      indépendant du proto, donc il lui survivra) :

      | | |
      |---|---|
      | `calculer()` sur une semaine pleine | 0,06 ms |
      | `offre()` — un créneau, 29 candidats | 1,0 ms |
      | `main()` — l'offre plus le tirage | 1,0 ms |
      | poser les 14 créneaux d'affilée | 12 ms |

      Le modèle du proto fait le même travail dans le même temps (11 ms) : les
      deux implémentations sont à égalité, ici comme sur la parité.

      **L'app, mesurée** — build de production, ralentissement CPU appliqué par
      CDP (`Emulation.setCPUThrottlingRate`), ×6 valant à peu près un téléphone
      d'entrée de gamme :

      | | ×1 | ×4 | ×6 |
      |---|---|---|---|
      | ouvrir « Poser » (chargement complet compris) | 100 ms | 422 ms | 643 ms |
      | repiocher (Dexie, jeu reconstruit, main, rendu) | 61 ms | 86 ms | 90 ms |
      | changer d'écran | 36 ms | 106 ms | 174 ms |

      Tout tient sous le seuil de l'instantané. **Aucune mémoïsation n'est
      ajoutée** : elle coûterait une invalidation à tenir juste, pour un
      problème qui n'existe pas. Le seul point à surveiller est l'ouverture à
      froid, qui n'est pas du calcul mais du chargement — c'est donc **T18** qui
      la fera baisser, avec son service worker, et pas une optimisation du
      modèle.

      Le banc navigateur n'est pas commité : Playwright n'est pas encore une
      dépendance du projet. Il le devient en **T20**, qui reprendra ces trois
      mesures.

- [x] **T18 — PWA.** Manifeste, service worker, installable, utilisable hors
      ligne — l'app se juge sur l'écran d'accueil d'un iPhone, pas dans Safari.

      Le worker précache le BUILD ENTIER à l'installation (16 fichiers :
      document, code, styles, quatre polices, catalogue, icônes) et le sert
      depuis le cache. Pas de « je garde ce que j'ai servi » : ce qu'une visite
      n'a pas demandé est exactement ce qui manquera le jour sans réseau, et on
      ne l'apprendrait qu'à ce moment-là. Écrit à la main plutôt que par
      Workbox, pour la même raison que le routeur de T7 : l'ensemble est fini,
      plat et connu à la fin du build.

      Vérifié hors ligne dans un vrai Chromium, réseau coupé pour de bon : la
      semaine, « À prévoir », « Poser », les courses et le cockpit s'ouvrent,
      les polices comprises — et par LIEN PROFOND rechargé, ce que seul le
      routeur en dièse rend possible sans réécriture côté serveur.

      **Ce que ça fait gagner** (même build, même écran, CPU ×4, médiane de
      cinq ouvertures à froid) :

      | réseau | sans worker | avec worker |
      | --- | --- | --- |
      | local, aucun bridage | 616 ms | 666 ms |
      | 4G lente (1,6 Mb/s, 150 ms) | 2 211 ms | 613 ms |

      Sur `localhost`, le worker ne gagne RIEN — il coûte même un peu. C'est la
      suite exacte de T17 : sur une boucle locale, l'ouverture n'est pas du
      réseau. Sur un vrai réseau, elle l'était pour les trois quarts, et il ne
      reste que le plancher — 613 ms d'analyse, d'exécution et de premier rendu,
      identiques dans les deux cas. Le prochain gain, s'il en faut un, se prend
      là (326 ko de JS en un seul morceau), pas sur le transport.

      **Une nouvelle version ne prend jamais la place de l'ancienne toute
      seule** : elle s'installe à côté, la page l'annonce d'un bandeau, un doigt
      la fait passer. Remplacer d'office échangerait le code sous une page en
      train de servir. Le chemin complet est joué en vrai (installation,
      « déploiement » d'une seconde version, bandeau, bascule, ancien cache
      effacé) — c'est la partie du ticket qui pouvait le plus silencieusement
      être fausse.

      Le worker n'existe qu'en production, et `npm run dev` désinscrit celui
      qu'une prévisualisation aurait laissé sur le même port : un cache qui sert
      pendant qu'on code fait perdre une heure, toujours passée à chercher
      ailleurs.

- [x] **T19 — Déploiement.** Dockerfile, `k8s/intendance`, workflow d'image, rrset
      DNS, listener Gateway. À côté de `proto-shell`, pas à sa place :
      `intendance.chapellu.fr` en plus de `proto.chapellu.fr`, les deux vivants.

      L'image a deux étages — Node construit, nginx sert — et la finale ne
      contient ni Node, ni `node_modules`, ni les sources : 83 Mo, et rien à
      exécuter côté serveur. `npm run build` typecheckant avant de construire,
      un code qui ne compile pas ne produit pas d'image du tout.

      **Le cache, en une règle** : ce dont l'URL porte l'empreinte se garde un
      an, tout le reste se revalide. Vérifié sur l'image qui tourne :

      | | Cache-Control |
      | --- | --- |
      | `/assets/index-*.js`, `*.css` | `public, max-age=31536000, immutable` |
      | `/`, `/sw.js`, le manifeste, le catalogue, polices, icônes | `no-cache` |

      `/sw.js` est le cas qui commandait : c'est le seul fichier que le
      navigateur va rechercher tout seul pour savoir s'il existe une nouvelle
      version. Sous un cache long, il ne serait jamais revérifié et l'app
      resterait sur sa version pour la durée de ce cache — sans que rien
      n'échoue nulle part.

      **La compression se paie une fois, au build** (`gzip -9` + `gzip_static`)
      et pas à chaque première visite : le nœud est un ARM à un cœur. Mesuré sur
      l'image : le JS passe de 326 ko à 106 ko, le catalogue de 183 ko à 24 ko —
      et ce dernier est demandé à chaque ouverture à froid tant que le service
      worker n'est pas posé. Le manifeste, que nginx servait en
      `application/octet-stream`, a désormais son vrai type.

      **Vérifié pour de bon** : l'image construite ici, puis lancée, sert la PWA
      entière — installation du worker, la semaine, les écrans, hors ligne,
      polices comprises. Elle produit la même version de précache que le build
      local (`7c43e922…`) : le conteneur reconstruit exactement le même `dist/`.

      **Ce qui ne se vérifie pas d'ici** : le cluster. Flux, le listener du
      Gateway, le certificat et le rrset sont déclaratifs et ne se prouvent
      qu'à l'apply — ils reprennent trait pour trait ce qui fait tourner le
      blog et le prototype, et c'est tout ce qu'on peut en dire avant que ça
      tourne.

      **Le CI teste avant de publier**, ce que le workflow du prototype ne
      faisait pas : typecheck, tests et parité passent d'abord, l'image part
      ensuite. Une image sur GHCR avec des tests rouges n'a rien à y faire.
- [x] **T20 — E2E.** Playwright sur les parcours qui comptent : poser une
      semaine, la retrouver après rechargement, cocher des courses et les
      rentrer.

      **Contre le build de production, en 390 × 844.** C'est la seule façon de
      tester ce que T18 promet : le service worker n'existe qu'en production, et
      « l'app s'ouvre sans réseau » n'a aucun sens contre un serveur qui
      recompile à chaque requête. Six parcours, quatorze secondes :

      - poser un plat au doigt et le retrouver après rechargement ;
      - sauter un repas, le retrouver sauté, y remanger — et vérifier au passage
        que le PLI ne survit pas au rechargement quand le SAUT, lui, survit :
        c'est l'hypothèse de persistance du projet, jouée pour de bon ;
      - un lien profond vers un jour sorti de la semaine, qui doit le DIRE ;
      - cocher un article au magasin, le rentrer à la maison, le retrouver
        rentré — avec le contrôle qui compte : cocher ne range rien ;
      - hors ligne pour de bon (`setOffline`), trois liens profonds rechargés,
        la semaine posée toujours là, les polices comprises ;
      - une seconde version « déployée » sous le serveur : le bandeau paraît,
        l'ANCIENNE continue de servir tant qu'on n'a pas dit oui, puis la
        nouvelle prend la place et l'ancien cache disparaît.

      Le dernier est celui qui justifie la dépendance à lui seul : un chemin de
      mise à jour cassé ne fait RIEN — pas d'écran blanc, pas de bouton mort,
      juste une app qui reste sur sa version et personne pour s'en apercevoir.

      **Aucune écriture directe en base dans les parcours.** Semer une semaine
      dans IndexedDB gagnerait dix secondes et poserait des plats que l'app n'a
      jamais acceptés : le jour où « poser » casserait, les parcours des courses
      resteraient verts. Ce qu'un doigt fait, le doigt le fait.

      **Un piège rencontré, et gardé en commentaire** : désigner une case par
      son texte (« la première qui dit *à poser* ») alors que le test change ce
      texte — le localisateur se déplace alors sur la case suivante et le test
      vérifie tranquillement autre chose. On désigne la case OUVERTE, qui est
      unique.

      **Les mesures de T17 et T18 sont commitées** : `npm run banc`, à côté de
      `npm run perf`. Ce n'est PAS un test — un seuil de performance dans un CI
      partagé mesure le voisin, rougit un jour sur trois, s'élargit, et finit
      par ne plus rien dire. Le banc imprime ; c'est au lecteur de conclure.

      Le CI lance les parcours sur x86_64 et non sur ARM comme le reste : ici on
      teste un comportement de navigateur, pas l'image déployée, et Playwright y
      livre son Chromium sans discussion.

- [x] **T21 — Le garde-manger.** `catalogue/garde-manger.yaml` : les rangements
      physiques du foyer, et la matière première dedans. Relevé du 2026-08-26 —
      sept zones, 53 denrées, 205,7 L mesurés.

      **CE QUI MANQUAIT, ET POURQUOI AUCUN DES DEUX OBJETS EXISTANTS NE POUVAIT
      LE PORTER.** `stock.yaml` porte les SORTIES DE CUISINE, indexées sur les
      types que les recettes `emit` et `accept` : y mettre une conserve de maïs
      demandait de lui donner `kind: base`, ce qui la faisait entrer dans le
      graphe de chaînage — et le planificateur aurait proposé d'« enchaîner » une
      boîte de conserve. `rayons.placard` marque ce qu'on possède TOUJOURS, sans
      quantité ni endroit : il sait qu'on a du sel, jamais qu'on a quatre boîtes
      de maïs de 285 g. Le modèle savait donc ce que la cuisine d'hier avait
      laissé, et ce que le placard pouvait porter — pas ce qu'il y avait dedans.

      **UNE ZONE N'EST PAS UN `Espace`, ELLE S'Y RATTACHE.** `Espace` (frigo ·
      congelo · placard) dit COMMENT ça vieillit, ce dont la fenêtre de fraîcheur
      a besoin. Les sept rangements de ce foyer tombent tous sur `placard`, et
      avec eux les seules informations qui décident vraiment de ce qu'on peut y
      mettre : 17 cm de hauteur utile sur l'étagère ouverte, la lumière du jour
      qui y tombe, l'humidité sous l'évier.

      **DEUX GRANDEURS SE DÉRIVENT ET NE SE SAISISSENT JAMAIS** : `volumeL` des
      cotes et de la forme, `poidsG` des quantités. `forme: demi-lune` applique
      π/4 — compter les plateaux d'angle en boîte donnait 67 L pour un plateau
      qui en porte 53, et un budget de rangement faux d'un cinquième déborde sans
      prévenir.

      **LE VÉRIFICATEUR ATTRAPE DES ERREURS DE CUISINE, PAS DE SAISIE.**
      `sensible` sur une denrée, `exposition` / `hygrometrie` / `chaleur` sur une
      zone : c'est leur confrontation qui dit que les pignons de pin sont en
      pleine lumière à côté de la bouilloire. `incompatibles` dit que les pommes
      de terre ne doivent pas voisiner avec les alliacées — la seule perte ACTIVE
      du relevé. C'est la première sortie de `verifier.py` qui se corrige en
      déplaçant quelque chose plutôt qu'en éditant un fichier, et l'export ne
      publie que celles-là : « le tiroir à épices n'a pas de cotes » s'adresse à
      qui tient le corpus, pas à qui habite la cuisine.

      **LES ALERTES SE GROUPENT PAR GESTE.** Une ligne par (denrée × agression)
      donnait sept alertes pour trois problèmes — les pignons comptaient double,
      et le sous-évier répétait « humide » sous quatre légumes qu'on sort du même
      mouvement. Sept lignes ne se lisent pas ; trois, si.

      **LE GARDE-MANGER EST DESCRIPTIF, ET LE RESTE POUR L'INSTANT.** Rien ne le
      décrémente quand on cuisine, donc `provenance()` continue de lire
      `rayons.placard` — voir ci-dessous.

- [x] **T22 — L'anti-gaspi.** Le garde-manger entre dans le score : la
      proposition remonte les plats qui mangent ce qui se perd.

      **TROIS URGENCES, ET AUCUNE DATE.** Le relevé n'en porte pas — ni DLC, ni
      DLUO, ni date d'ouverture — et en inventer une pour pouvoir compter dessus
      donnerait un chiffre qui a l'air juste et ne l'est jamais. Ce que le relevé
      sait, c'est le CONDITIONNEMENT et l'ENDROIT : un sachet ouvert n'oppose
      plus de barrière, un légume frais ne se garde pas, une denrée rangée là où
      elle s'abîme se dégrade en ce moment. `haute` / `moyenne` / `basse` se
      dérivent de ces trois faits, et on peut aller les vérifier de l'œil. Sur le
      vrai stock : 5 hautes, 10 entamées, 38 scellées.

      **ON NE PAIE QUE CE QUI EST À RISQUE.** *Utiliser* le placard est déjà
      récompensé, et ailleurs : un ingrédient de placard ne crée pas de ligne de
      courses, donc `article_marginal` ne monte pas. *Sauver* le placard est ce
      qui manquait. Une conserve tient trois ans et ne mérite aucun coup de
      pouce ; la payer ferait gagner les plats à longue liste d'épicerie.

      **UN SEUL BONUS PAR PLAT, ET C'EST LA MESURE QUI L'A DÉCIDÉ.** La première
      version cumulait par ingrédient. Comptés sur le corpus : l'oignon paraît
      dans **42 %** des 86 plats, l'ail dans **19 %**. Le cumul donnait donc +10
      à presque tout ce qui contient les deux, et le haut de la proposition
      répétait « sauve ce qui se perd : oignon, ail » huit fois de suite — un
      terme qui se déclenche partout ne départage rien, et récompenser la
      longueur d'une liste d'ingrédients est exactement ce que
      `article_marginal` a été écrit pour empêcher.

      **CE QUE LE MODÈLE NE SAIT PAS FAIRE, ET QUI EST ÉCRIT DANS LE CODE.** Un
      aromate n'est pas sauvé parce qu'un plat le cite : l'oignon sera mangé de
      toute façon. Distinguer un oignon pris sur un filet de 800 g de pommes de
      terre prises sur deux kilos demanderait des quantités que le relevé ne
      porte pas pour le frais (`par_unite: null`). D'où le partage assumé : le
      score NUDGE, et `aSauver()` DÉSIGNE — la liste « À manger en premier »
      nomme les pommes de terre et l'épeautre sans se laisser noyer par les
      aromates.

      **DEUX LISTES, DEUX GESTES.** « À déplacer » dit de ranger autrement ; « À
      manger en premier » dit de cuisiner. Le même oignon peut être dans les
      deux — il est mal rangé ET il court — et ce n'est pas une redite.

      **LA PARITÉ EST PARTIE AVEC.** `scripts/parite.mjs` et
      `reference/proto-semaine.js` sont supprimés, et l'étape retirée du CI. Ils
      prouvaient que le port disait la même chose que `apps/proto-shell` ; à
      partir du moment où le scoring tient compte du garde-manger, que le proto
      ignore, la parité ne pouvait plus qu'échouer — et un contrôle qui DOIT
      échouer n'en est plus un. Voir « Sortie » : la moitié `flagship` du
      démontage reste à faire.

- [x] **T23 — La seconde issue : conserver.** Le garde-manger se branche sur
      `conservation.yaml`, et l'anti-gaspi cesse de n'avoir qu'une réponse.

      **LE MODÈLE LE SAVAIT DÉJÀ, PERSONNE NE L'ÉCOUTAIT.** T22 ne connaissait
      qu'une sortie pour une denrée qui court : la cuisiner ce soir.
      `conservation.yaml` porte l'autre depuis le prototype, et l'énonce mieux
      que ce ticket ne le ferait : « l'aliment a une horloge, et le transformer
      remet l'horloge à zéro — mais seulement si on a le séchoir, et seulement si
      on a appris à s'en servir. » On ne mange pas six kilos de pommes de terre
      parce qu'ils germent.

      **`applique_a` DORMAIT DEPUIS SON ÉCRITURE** — déclaré dans
      `conservation.yaml`, lu par personne. Ce ticket en est le premier
      consommateur, et il a fallu le compléter : sans lui le modèle proposait de
      mettre de la farine « en bocal sous pression ». Pas dangereux, seulement
      absurde — mais un conseil absurde apprend à ignorer les conseils, y compris
      celui qui compte.

      **LE FRIGO N'EST PAS UNE CONSERVATION DE MATIÈRE PREMIÈRE.** Sa fenêtre est
      `household.fridge_window_days`, l'horloge des RESTES : un sachet de farine
      ne périme pas en quatre jours parce qu'on l'a mis au frais. D'où
      `applique_a: [plat]` sur cette méthode. Ranger un ingrédient au froid est
      un choix de RANGEMENT, que les zones portent déjà, pas une transformation.

      **LA SÉCURITÉ EST UN FILTRE, PAS UNE NOTE DE BAS DE PAGE.** `acidite` vaut
      `basse` par défaut, comme `defaut_acidite` de `conservation.yaml` — et ce
      défaut est un choix de sécurité : le bain-marie sur un aliment peu acide en
      bocal à température ambiante produit exactement le milieu anaérobie où
      prolifère C. botulinum. Aucune denrée du relevé n'est déclarée acide, donc
      le bain-marie n'est proposé sur aucune. Un test le verrouille.

      **`conserve_mal`, L'ÉCHAPPATOIRE ASSUMÉE.** Une pomme de terre crue
      congelée devient farineuse et noircit ; le modèle général ne peut pas le
      deviner. Une règle générale avec une exception écrite vaut mieux qu'une
      règle spéciale par denrée. C'est la seule du relevé — et elle fait de la
      pomme de terre la seule denrée qui n'a vraiment qu'une sortie.

      **ON NE PROPOSE QU'UN VERROU, ET SEULEMENT S'IL EST SPÉCIFIQUE.** Le
      sous-vide marche sur à peu près tout, donc il était le premier verrou des
      treize denrées : la même phrase treize fois de suite n'est plus une phrase.
      Ne reste que ce qui dit quelque chose de CETTE denrée — lacto-fermenter un
      oignon, sécher de l'ail. Et jamais présenté comme un achat : c'est un nœud
      de compétence, la règle de #29.

      Résultat sur le vrai stock : le congélateur, que le foyer possède, répond
      pour douze des treize denrées à risque. Les alliacées gagnent en plus un
      nœud à débloquer — lacto-fermentation, bocaux à joint caoutchouc.

- [x] **T24 — Le garde-manger entre dans la liste de courses.** `provenance()`
      lit enfin le relevé : l'app ne fait plus acheter ce qu'on a déjà.

      **UNE ERREUR DE T22, TROUVÉE EN VÉRIFIANT.** Le commentaire de
      `gardeManger.ts` justifiait le fait de ne rien payer aux conserves en
      disant qu'utiliser le placard était « déjà récompensé, parce qu'un
      ingrédient de placard ne crée pas de ligne de courses ». Vrai du sel et de
      l'huile — les vrais `rayons.placard`. FAUX des 45 ingrédients du
      garde-manger, rangés dans `rayons.épicerie` : `provenance()` les disait
      `courses`, ils produisaient une ligne d'achat, et un plat qui puisait dans
      le stock était donc PÉNALISÉ de 0,4 par `article_marginal` au lieu d'être
      neutre. La conclusion tenait, la raison était fausse.

      **`aVerifier` ÉTAIT DÉJÀ LE BON ENDROIT, ET JE L'AVAIS SOUS LES YEUX.** Le
      ticket précédent disait qu'il fallait un modèle de consommation avant de
      brancher `provenance()` — sinon quatre boîtes de maïs suppriment la ligne
      pour toujours, y compris le jour où il n'en reste aucune. Mais la liste
      « à vérifier » ne promet aucune quantité : son contrat est « va voir avant
      d'acheter », pas « tu en as assez ». Aucune consommation n'a besoin d'être
      suivie pour dire ça, et c'est exactement vrai.

      **DEUX PROVENANCES, PAS UNE.** `placard` est une APPARTENANCE — on a
      toujours du sel, la quantité ne se pose pas. `garde-manger` est un STOCK
      RELEVÉ qui s'épuise. Les fondre ferait passer le second pour le premier, et
      c'est le genre de raccourci qui fait rentrer du magasin sans le maïs.
      L'écran des courses les affiche donc en deux blocs distincts.

      **UNE PROVENANCE OUBLIÉE DANS UN TOTAL.** `plan.py` énumère l'ordre
      d'affichage à la main ; `garde-manger` y manquait, donc onze lignes sur
      quarante-et-une ne se comptaient nulle part et le détail ne totalisait plus.

      Mesure sur le cas qui a motivé le ticket : `chili-sin-carne` passe de six à
      quatre lignes de courses — le maïs et l'oignon quittent le panier pour
      « vous en avez, vérifiez la quantité ».

### Trouvé en portant, à décider

- [ ] **Un aromate n'est pas sauvé parce qu'un plat le cite.** La limite connue
      de T22, à lever le jour où le frais sera quantifié. Il faudrait comparer ce
      qu'on A à ce qu'un plat PREND — un oignon sur un filet, contre 800 g de
      pommes de terre sur deux kilos. `garde-manger.yaml` porte déjà
      `par_unite`, mais il est `null` sur tout le frais : personne ne pèse un
      filet d'oignons en le rangeant. Peut-être la bonne réponse est-elle une
      bande plutôt qu'un poids — « un filet », « une main » —, comme `qty_band`
      compte des repas plutôt que des grammes.

## Sortie

**Moitié faite en T22** : `scripts/parite.mjs` et `reference/proto-semaine.js`
sont supprimés, l'étape est retirée du CI. Reste la moitié `flagship`, qui est de
l'infrastructure vivante et se démonte à part — d'autant que le README dit encore
que les deux tournent « tant que le prototype sert encore de référence », et que
l'intérieur du jardin n'est pas tranché.

Quand l'app porte les mêmes verdicts que le proto : supprimer, chez `flagship`,
`apps/proto-shell`, `k8s/proto-shell`, son listener, son rrset et son workflow —
et ici, `scripts/parite.mjs` avec `reference/proto-semaine.js`, qui n'existent
que pour prouver le port et n'ont plus rien à prouver une fois l'original
parti.
