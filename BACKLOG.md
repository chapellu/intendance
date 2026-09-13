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

### Le stock qui descend ([Workspace#42](https://github.com/chapellu/Workspace/issues/42))

Le contrat de décrément et de réconciliation, grillé les 30 et 31 août 2026. Il
part de quatre constats faits dans ce dépôt, et chacun est un trou :

1. **Aucun événement « cuisiné » n'existe.** `Aujourdhui.tsx:182` — « Fait ✓ »
   est un booléen dans `reglages`. Ni date, ni plat, ni parts, ni historique.
2. **Le retrait au dépôt n'est jamais engagé.** `depot.prelever()` est appelé
   *dans* `calculer()` (`calcul.ts:218`) : une projection recalculée à chaque
   rendu. Le bocal n'est jamais retiré de la base.
3. **Rentrer une course ne crée aucun lot.** `courses.ts:35` bascule
   `rentre: true` et s'arrête, alors que le commentaire du fichier promet que
   « c'est seulement là que le stock change ». `ajouterLot()` n'est appelé de
   nulle part dans ce flux.
4. **`corrigerLot` est mort.** Appelé nulle part hors tests. `Stock.tsx` sait
   ajouter et retirer un lot, pas en corriger un ; le garde-manger n'a aucune
   édition dans l'app.

Et le chiffre qui donne sa forme à tout le reste : le garde-manger porte **45
ids distincts sur 53 lots, dont 31 non chiffrés** ; les recettes nomment **175
ids décrémentables** une fois retirées les 18 lignes `seasoning` et les lignes
`base` ; **l'intersection fait 17**, et ce sont exactement les féculents, les
légumineuses et les fonds de placard. Répartition des 175 par rayon : **61
épicerie, 57 primeur, 23 hors rayon**, 17 crèmerie, 9 boucherie, 5 frais, 3
poissonnerie. Un faible recouvrement n'est pas une panne du modèle : le primeur
ne s'estime jamais et le frais court ne se parie pas sans avoir vu, donc les
classes comptées **sont** l'épicerie.

- [x] **T25 — Le journal d'événements, et le niveau dérivé.** Trois sortes
      d'événements persistés — cuisiné, observation, entrée — et **plus aucun
      niveau stocké** : le garde-manger et le dépôt se rejouent depuis le
      journal.

      C'est la discipline que `db/schema.ts` s'est déjà écrite, appliquée là où
      elle ne l'était pas : cuisiner est une décision d'un doigt, le niveau est
      un calcul. Et c'est la réponse à l'objection de `garde-manger.yaml` — « un
      chiffre qu'on croirait tenu à jour alors que rien ne le tient » — non pas
      en rendant le chiffre plus juste, mais en le **datant**. Trois choses
      tombent gratuitement : contredire l'estimation devient un événement
      ordinaire, annuler un « fait » touché par erreur devient possible, et « je
      n'ai rien vu depuis » devient calculable.

- [x] **T26 — L'événement cuisiné : trois effets, deux dates, une couture.**
      Il ne se déclenche que **sur un créneau posé** et porte deux dates plus
      les parts figées.

      Le jour cuisiné vient gratuitement de `DecisionCreneau.jour` — aucune
      saisie. Le jour de saisie est le seul qui puisse dire « je n'ai rien vu
      depuis ». Les parts se figent parce que `parts: null` veut dire « les
      parts du foyer, quelles qu'elles soient au moment du calcul », et qu'un
      foyer qui grandit ne doit pas changer rétroactivement ce qui a été mangé.

      Il engage **les trois effets** : retrait au garde-manger, retrait au
      dépôt, et **création des lots que le plat `emit`**. Le troisième ferme la
      boucle que la carte cite mot pour mot — « si je déstocke la dernière
      bolognaise alors il faut encourager d'en refaire pour restocker » —
      impossible tant que cuisiner une bolognaise n'en produit pas.

      **LA CONSÉQUENCE À CONSTRUIRE : l'événement est la couture entre le fait
      et la projection.** Avant lui le dépôt est constaté, après lui il est
      projeté. `calculer()` doit donc **cesser de projeter les créneaux
      passés**, sinon la sauce est comptée deux fois — une fois parce qu'on l'a
      faite, une fois parce que la semaine prévoit de la faire.

      Cuisiner hors plan **ne se journalise pas** : c'est le plus souvent du
      hors-catalogue, donc sans id, sans rien à décrémenter ni à produire. Le
      trou que ça laisse — un plat du catalogue cuisiné sans créneau, dont les
      bocaux n'atteignent jamais le dépôt — se referme par le relevé de T32, pas
      en élargissant l'événement.

- [x] **T27 — Rentrer crée un lot, et ce lot porte son poids.**
      `courses.rentrer()` appelle enfin `ajouterLot()`.

      **Le poids appartient au lot, pas à l'ingrédient**, et le relevé le
      prouve : `thon-boite` existe en 140 g **et** 160 g, `petits-pois-carottes`
      en 465 g **et** 530 g. Donc : le lot porte le poids que son canal lui a
      donné (une liste de courses les porte déjà, ça ne coûte rien) ; le défaut
      par ingrédient est **dérivé** — le dernier poids vu pour cet id, jamais
      écrit à la main, donc **aucun des 61 ids d'épicerie à remplir** ; sans
      poids, pas de chiffre, et T28 s'applique.

      Apparier « Panzani Torsades 500 g » à l'id `pates` n'appartient pas à ce
      ticket : c'est le même problème *propose-puis-valide* que les `apports`, et
      il est traité par [Workspace#44](https://github.com/chapellu/Workspace/issues/44).

- [x] **T28 — Deux modes de décrément, choisis par le lot.** Un lot chiffré perd
      des grammes ; **un lot non chiffré avance son `etat`** (`sec` → `entame`).
      Aucun poids inventé.

      Ce n'est pas un pis-aller déguisé : `etat: entame` porte déjà l'information
      utile dans les mots du modèle — « la barrière est rompue, l'horloge
      tourne » — et `garde_manger.py:76` la lit **déjà** pour faire monter
      `urgence` à `moyenne`. Cuisiner des pâtes rend donc le paquet plus
      pressant, ce qui remonte au score par `placardDuPlat`, sans un gramme
      inventé.

      Ordre de service, tranché par le fichier lui-même (« LE BOCAL EST UN
      DISTRIBUTEUR, pas une réserve ») : **l'entamé avant le scellé**, donc le
      distributeur avant la réserve. `farine` et `concentre-tomate` portent déjà
      les deux.

      **Jamais sous zéro, jamais un lot qu'on n'a pas constaté.** Une ligne qui
      ne trouve rien est un **no-op DIT**, compté et montré : la carte du plat
      annonce « je suis 3 des 11 ingrédients ». C'est ce qui empêche de croire le
      placard au-delà des 17 ids qu'il couvre, et ce qui rend visible que le
      relever davantage sert à quelque chose.

      Le mode non chiffré est **permanent, pas transitoire** : trois des quatre
      canaux — marché, casier Côté Champs, panier vert — livrent du non choisi et
      non pesé, et le vrac (« le bocal EST le stock ») ne le sera jamais.

- [x] **T29 — L'unité scellée part en entier ; son reste devient un lot court.**
      Ouvrir une `conserve` ou un `bocal` scellé consomme **l'unité d'achat** —
      4 boîtes de maïs deviennent 3.

      C'est le comportement réel : on vide la boîte pour ne pas garder 85 g
      impossibles à passer. Mais **au-delà d'environ ⅓ de l'unité, le reste
      devient un lot neuf** en frais court, donc `urgence: haute`, donc le score
      va chercher un plat qui le mange. 85 g de maïs, non ; 600 g de crème sur
      800, oui.

      Le seuil est une **fraction, pas un plancher absolu** : 100 g de crème et
      100 g de concentré de tomate ne sont pas la même quantité de cuisine. Et il
      **se tranche tout seul** — #34 interdit toute confirmation par repas, « ce
      serait de la comptabilité déguisée ».

- [x] **T30 — La classe dérivée, et trois états de confiance.** Les cinq classes
      de #34 n'existent dans aucun fichier. Elles se **dérivent**, avec une
      surcharge — la discipline que `garde_manger.py` a déjà employée pour
      `urgence`, et pour la même raison : ce qu'un relevé sait vraiment, c'est le
      conditionnement et l'endroit, et les deux se vérifient de l'œil.

      | Classe | Dérivation |
      |---|---|
      | fond de placard | `rayons.placard`, déjà listé |
      | congélateur | `espace: congelo` |
      | fruits & légumes | `rayon: primeur` |
      | frais court | `etat: frais` hors primeur, + crèmerie / boucherie / poissonnerie, + les restes de T29 |
      | épicerie comptable | tout le reste en placard (`conserve` / `sec` / `bocal`) |
      | **non suivi** | **aucun rayon — 23 des 175 ids** |

      Les 23 sans rayon **ne décrémentent rien, et l'app le dit**. Leur inventer
      une classe serait se tromper là où ça coûte le plus, puisque la classe
      commande la précision ; ils remontent d'eux-mêmes dans le « je suis 3 des
      11 » de T28.

      **La confiance est trois états dérivés** — `sûr` / `probable` / `inconnu` —
      avec le chiffre et la date toujours lisibles dessous. Pas un score
      numérique : ce serait le chiffre qu'on croirait parce qu'il a été calculé.

      **L'asymétrie qui la commande : une observation pose l'estimation et
      restaure la confiance ; un décrément déplace l'estimation et la dépense.**
      Cuisiner n'est **pas** une observation — ça éloigne le chiffre de la
      dernière chose vue de ses yeux. La vitesse de dépense est celle des
      tolérances par classe de #34, inchangées.

- [x] **T31 — La dérive, apprise, qui élargit le doute sans bouger le chiffre.**
      Le « forfait hebdomadaire calibré sur l'historique de commande » de #34 ne
      survit pas tel quel : aucun historique de commande n'existe ici, et
      Workspace#41 a supprimé la semaine à quoi il s'accrochait.

      Il devient un **terme de dérive dérivé du journal** : entre deux
      observations d'une même denrée, ce que les décréments connus n'expliquent
      pas. **Démarrage à froid à zéro**, donc le premier jour se comporte comme
      s'il n'y avait pas de dérive ; le terme n'existe qu'à partir de la seconde
      observation. Rien n'est jamais saisi.

      Comme cuisiner hors plan ne se journalise pas (T26), la dérive absorbe
      **tout ce que le journal ne voit pas**, cuisine hors catalogue comprise.
      D'où le nom : un *forfait* laisse croire à une habitude stable, et ça n'en
      est pas une.

      **Et elle ne doit pas bouger le chiffre.** Un niveau qui descend sans que
      rien de constaté ait été mangé est de la consommation inventée. La dérive
      fait **tomber la confiance plus vite** : le taux de dégradation de T30
      cesse d'être une constante par classe et devient **appris par ingrédient**.
      Les denrées qui dérivent atteignent `inconnu` plus tôt, donc l'app demande
      plus tôt, donc T33 les fait remonter. La cuisine hors catalogue produit une
      **question au bon moment**, jamais un faux chiffre.

- [x] **T32 — Le relevé par zone — garde-manger ET dépôt.** Trois gestes, tous
      des observations au sens de T30 : la **réponse** à une question (un
      ingrédient), la **correction** spontanée (un ingrédient), le **relevé**
      (une zone entière).

      **Les corrections portent sur un ingrédient, jamais sur un lot.** C'est ce
      qu'un œil voit en ouvrant un placard : on compte des boîtes de maïs, pas
      *le lot n°17*. Par lot, il faudrait connaître une structure que l'app a
      inventée — et qui cache déjà, pour `farine` et `concentre-tomate`, une
      réserve pesée derrière un distributeur non pesé. La réconciliation suit
      l'ordre de service de T28 : l'entamé absorbe l'écart avant le scellé.

      **Un relevé est exhaustif sur sa zone** : ce qui n'y est pas n'y est plus —
      zéro, pas silence. C'est le seul geste capable de dire « il n'y en a plus »
      sans énumérer les absents ; l'alternative laisse pourrir les fantômes,
      c'est-à-dire exactement la façon dont le relevé du 26/08 vieillit. **La
      zone est la clôture** — le garde-manger en porte déjà six — donc aucun
      bouton « terminé ». Un relevé restaure la confiance sur **toute la zone**,
      pas seulement sur les lignes touchées : un quart d'heure achète des
      semaines de silence.

      **Le dépôt reçoit le même geste** — « clairement tout le stockage est
      vérifiable, frigo, congélateur, placard… ». C'est ce qui referme le trou de
      T26 : un plat du catalogue cuisiné hors plan met des bocaux au congélo dont
      l'app n'entend jamais parler, et aucun relevé de placard ne les rattraperait
      puisqu'ils vivent au dépôt. Un congélateur est **plus** facile à relever
      qu'un placard : petit, compté en repas, ouvert tous les jours. Ça donne
      aussi enfin un appelant à `corrigerLot`.

- [x] **T33 — Le déclencheur : à la proposition, toujours si l'ingrédient est
      central.** Évalué **au moment où l'app propose**, avant qu'un doigt pose
      quoi que ce soit.

      C'est la seule position où la réponse a encore un effet : découvrir en
      cuisinant qu'il n'y a plus de lentilles ne change aucune décision, ça
      constate un échec. Posée à la proposition, elle **retire ou substitue** le
      plat avant qu'il soit proposé. Corollaire : une question ne porte jamais sur
      ce qu'on vient de cuisiner.

      **La centralité vient du rayon**, avec une surcharge `central: true` par
      ligne. Boucherie / poissonnerie / crèmerie et les féculents d'épicerie sont
      centraux ; le primeur et le reste sont secondaires. On ne fait pas une
      bolognaise sans viande, on la fait très bien sans persil. La dériver des
      `apports` serait plus juste en principe mais réclame une table
      `viande-rouge → boeuf-hache` qui est du jugement, donc de la saisie
      déguisée. La surcharge ne coûte rien là où elle compte :
      [Workspace#47](https://github.com/chapellu/Workspace/issues/47) dicte déjà
      les 15 plats du répertoire, elle s'y pose au passage.

      **Central + confiance basse → on demande, toujours. Secondaire → on parie,
      en silence.**

      **CECI RÉVISE LE PLAFOND DE ~5 DE #34, DÉLIBÉRÉMENT.** Ce plafond défendait
      contre un *rituel qui balayait la semaine entière*. Workspace#41 a supprimé
      le rituel ; l'utilisateur supprime le plafond (31/08/2026) : « Si
      l'ingrédient est central pose la question. […] Les questions ne sont pas
      gênantes dans l'absolu car elles demandent juste de savoir s'il faut acheter
      ou si le stock est suffisant. »

      **Le gouvernail n'est plus un compteur, c'est la qualité des
      propositions.** Une question n'irrite que si elle porte sur ce qu'on
      n'aurait pas dû proposer. Et la boucle est auto-limitante, ce qui en fait
      une **promesse réfutable** : chaque réponse est une observation, qui
      restaure la confiance, qui supprime les questions suivantes — donc le volume
      doit décroître à l'usage, et s'il ne décroît pas, ce design est faux.

      **Forme de la question : trois états** — « des lentilles : oui / il en reste
      peu / non » —, le vocabulaire de signalement déjà retenu par #34, avec une
      quantité libre optionnelle pour qui veut être précis. Une quantité par
      défaut obligerait à peser pour répondre, donc on ne répondrait pas, donc
      l'app cesserait de demander. `il en reste peu` est l'état qui gagne sa
      place : il n'interdit pas le dahl, il interdit d'y **compter dessus deux
      fois dans la même passe**.

      **Ordre, quand plusieurs se disputent la place : celle qui débloque le plus
      de propositions** — l'ingrédient présent dans le plus de plats candidats.
      Pas « la plus incertaine d'abord », qui trie sur l'ignorance et non sur
      l'utilité : la denrée la plus incertaine peut n'être réclamée par aucun plat
      proposé.

      **Le démarrage à froid est protégé par le crescendo**, pas par un plafond :
      la semaine 1 pose trois dîners, donc trois plats de central à interroger. La
      première passe **est** le relevé, par un autre chemin.

      **Au-delà du budget, on parie en le disant.** Retirer des plats ferait
      rétrécir les propositions à mesure que la confiance vieillit — la pire façon
      d'échouer pour un outil dont le travail est que le dîner ait lieu.
      Substituer en silence produit un plat qu'on ne peut pas contredire. Parier
      à voix haute garde la règle de #34 tout en respectant celle de la carte :
      l'estimation doit être visible et contredisable. Un pari raté tombe sur le
      plan B, à parité d'effort avec des nouilles — #30 a déjà payé ce filet.

      **Fait.** `src/model/questions.ts`, `src/ecrans/questions.vue.ts`, la
      question devant la main dans `Poser.tsx`, et `rayons.centraux` au
      catalogue. Ce que le portage a appris, en trois points :

      **La centralité est de la DONNÉE, et elle a deux formes.** `centraux
      .rayons` porte la règle — boucherie, poissonnerie, crèmerie sont centraux
      en entier, et le dire par rayon reste vrai quand un id s'y ajoute.
      `centraux.ids` porte l'exception : l'épicerie mélange le riz et le
      vinaigre balsamique, donc ses 24 féculents se nomment un par un. La
      surcharge `central: true` par ligne existe, est exportée, et **aucune
      recette ne l'emploie encore** — elle attend le répertoire de
      [Workspace#47](https://github.com/chapellu/Workspace/issues/47), comme
      prévu. `verifier.py` refuse un rayon ou un id inconnu : une faute de
      frappe y serait silencieuse et l'app se mettrait simplement à parier.

      **`non` et `peu` sont UN SEUL mécanisme, pas deux.** Une réponse laisse un
      budget de tirage sur la passe — `oui` infini, `peu` un, `non` zéro — et un
      plat sort dès qu'un de ses centraux a épuisé le sien. Ça rend « il n'en
      reste pas » et « il n'en reste plus beaucoup » exactement aussi chers à
      écrire, et le retrait reste **de portée passe, jamais un bannissement** :
      la passe suivante repropose si le placard a bougé. Faute d'objet passe
      avant T49, « la même passe » est **le jour** — les réponses saisies
      aujourd'hui gouvernent les propositions d'aujourd'hui.

      **Le trou trouvé À LA MESURE, et il valait le ticket.** La promesse
      réfutable de T33 — « le volume de questions doit décroître à l'usage » — a
      été mesurée sur le corpus réel avant d'être crue, et elle était **fausse** :
      passe 1 seize questions, passe 2 les seize mêmes. `rejouer` ne projetait
      que les ingrédients PORTANT DES LOTS, donc toute observation sur un
      ingrédient qui n'en a pas — c'est-à-dire toute la viande et tout le
      poisson, qui ne sont dans aucun relevé de placard — tombait par la trappe.
      D'où `Rejeu.vus`, la seconde carte : `parIngredient` dit ce qui EST LÀ
      (promesse épinglée par les tests du relevé exhaustif), `vus` dit **de quoi
      on a des nouvelles**, absences constatées comprises. Et son corollaire :
      une cuisson dépense désormais la confiance même quand elle ne trouve aucun
      lot à retirer — il n'y a pas d'estimation à déplacer, mais il y a une
      croyance, et elle vient d'être mangée. Sans elle, une réponse valait pour
      toujours. Mesuré après correction : **16 → 0 → 6**, et c'est un test.

      Reste vrai et non résolu : **le démarrage à froid coûte seize questions
      pour trois dîners.** Le backlog l'annonçait (« la première passe EST le
      relevé, par un autre chemin ») et l'usage tranchera si c'est tenable ;
      c'est le seul chiffre de ce ticket qu'aucune mesure ne peut valider à la
      place de l'utilisateur.

### Trouvé en grillant #42, à faire

- [ ] **Le pari ne mène qu'à L'INVENTAIRE, pas à sa propre question.** La ligne
      « je compte sur : carottes — à vérifier » est visible et datée, donc
      contredisable au sens de #34 ; mais la contredire demande d'ouvrir
      L'inventaire et d'y retrouver la ligne. Le geste juste serait d'ouvrir la
      question à trois états sur place, ce qui est le même composant que celui
      que T33 vient d'écrire. Petit, et laissé de côté pour ne pas mélanger deux
      surfaces dans un ticket qui en installait déjà une.

- [ ] **Compléter `rayons.yaml` pour les 23 ids sans rayon.** Le vocabulaire des
      recettes a poussé plus vite que la table des rayons. Tant qu'ils n'en ont
      pas, T30 les classe `non suivi` et ils ne décrémentent rien — ce qui est le
      bon défaut, mais pas une fin. C'est de la saisie, pas une décision.

### Ce que T25–T32 laissent derrière eux

Ils sont cochés, et ces trois manques sont réels — les écrire ici vaut mieux que
de les laisser croire faits.

- [ ] **La carte d'un plat ne dit pas encore « je suis 3 des 11 ingrédients ».**
      Le modèle le SAIT — `retirer()` rend `effet: "aucun"` sur chaque ligne
      qu'il ne suit pas, et `Rejeu.retraits` les porte toutes — mais rien ne
      l'affiche. C'est le no-op DIT de T28, et c'est précisément ce qui doit
      rendre visible que relever davantage sert à quelque chose. Sans l'écran,
      le placard reste cru au-delà de ce qu'il couvre.
- [ ] **Le relevé du dépôt n'a pas d'écran.** `releverDepot()` existe et est
      testé ; l'inventaire n'expose que le relevé des zones du garde-manger.
      C'est pourtant le geste qui referme le trou de T26 — un plat du catalogue
      cuisiné hors plan met des bocaux au congélo dont l'app n'entend jamais
      parler.
- [ ] **`corrigerLot` est toujours sans appelant.** T32 devait lui en donner un ;
      le relevé du dépôt supprime des lots (`bulkDelete`) au lieu d'en corriger
      la quantité. Corriger « il reste 300 g et non 700 » demande un écran qui
      n'existe pas encore, et c'est le même que celui du point précédent.
- [ ] **La dérive ne se voit nulle part.** Elle est apprise, testée, et elle fait
      tomber la confiance plus vite — mais aucun écran ne dit « cette denrée
      part plus vite que ce que je vois ». **T33 lui a donné sa première
      sortie** : elle fait arriver les questions plus tôt, et la question dit
      « pas vu depuis le 26/08 ». Elle reste néanmoins invisible EN TANT QUE
      dérive — l'écran montre la conséquence, jamais la cause.

## Les niveaux de réserve — [Workspace#43](https://github.com/chapellu/Workspace/issues/43)

Le contrat du plancher, grillé en français les 31/08 et 01/09/2026, seize
décisions. T25–T32 ont construit le stock qui descend, ce qui est le socle dont
tout ce qui suit dépend.

**Les deux moitiés sont posées.** T34–T38 ont fait le congélateur — des portions,
rechargées en cuisinant, qui poussent un plat. T39–T41 et T46 ont fait le
garde-manger — des unités d'achat, rechargées en achetant, qui poussent une ligne
de courses. C'est T41 qui les tient séparées, et il ne reste du bloc que ce qui
module un plancher déjà posé : la saison (T42), le mois de fermeture (T43), le
retrait d'un plancher démenti (T44) et le niveau de réappro (T45).

**LE MOT EST `plancher`, ET CE N'EST PAS UN DÉTAIL.** « Réserve » est déjà pris
dans ce foyer : `docs/cuisine/stock.md` appelle ainsi le PAQUET derrière le
bocal distributeur — un objet physique, pas une cible. La cible s'appelle donc
`plancher`, mot que `equilibre.yaml` emploie déjà dans exactement ce sens.

- [x] **T34 — Le plancher se pose sur ce qu'un plat PRODUIT.** Jamais sur la
      recette : `pain-rassis` est émis par 5 recettes, `reste-roti` par 2, et une
      recette en émet souvent deux ou trois. Un plancher sur la recette voudrait
      dire qu'un poulet rôti au citron ne recharge pas le même `poulet-cuit`
      qu'un poulet rôti nature. Le plat producteur est dérivé, et quand plusieurs
      rechargent un type, ils partagent le bonus.

- [x] **T35 — Deux populations, deux plafonds.** Un pot-au-feu met trois choses
      en stock d'un coup : `bouillon-pot-au-feu` (`base` — un ingrédient, il ne
      fait pas un dîner, il en accélère un), `viande-pot-au-feu` (`reste-plat` —
      un dîner), `legumes-pot-au-feu` (`congelo: false`, il reste au frigo). Donc
      « un pot-au-feu d'avance » n'est pas une phrase que le modèle peut tenir.
      Le corpus porte **13 `kind: base`** — exactement les 13 types que quoi que
      ce soit `accepts` — contre **58 `reste-plat`**. Plafonds séparés, parce que
      le congélateur fait 18 places et que si les bocaux de bouillon mangent les
      tiroirs, il n'y a plus de soir qu'on sauve.

- [x] **T36 — Plancher par type, ET plancher de secours mutualisé.**
      L'utilisateur : « si je déstocke la dernière bolognaise il faut encourager
      d'en refaire ». Mais le pur par-type ne tient pas l'arithmétique — 68 types
      × 1 = 68 portions pour 18 places. Donc les deux, à deux métiers : un
      plancher par type qui dit *reconstitue celui-là*, et un plancher de secours
      qui garde `congelateur.plancher: 4` **en lui ajoutant la diversité** :
      ≥ 4 portions réparties sur **≥ 3 types distincts**. L'objection tuait le
      compteur SANS diversité, pas le compteur. Le plancher de secours n'est pas
      saisonnier — un soir s'effondre aussi en juillet.

- [x] **T37 — Propose-puis-valide, à la deuxième cuisson.** Sur 68 types, un
      réglage à la main ne sera jamais fait, et `equilibre.yaml` dit de son
      propre 4 : « valeur posée à vue, à régler à l'usage ». Aucun type n'a de
      plancher tant qu'il n'a pas été cuisiné **deux fois** — le journal de T25
      le sait — et à la seconde l'app propose `plancher: 1`, le dit, et attend.
      **Démarrage à froid : zéro plancher**, donc aucun bonus inventé en
      semaine 1.

- [x] **T38 — Le plafond éteint le bonus ; être au-dessus ne coûte rien.**
      Congélateur plein → le bonus de reconstitution ne paie plus rien quels que
      soient les déficits par type, et l'app nomme le type sur-représenté
      (« 7 portions de ratatouille sur 18 »). Au-dessus de son plancher, **aucun
      malus** : un plancher est un seuil, pas une bande.

- [x] **T39 — Le plancher du garde-manger porte sur l'ingrédient.** Cohérent avec
      T32 (les corrections sont par ingrédient, jamais par lot) et avec ce qu'un
      œil compte en ouvrant un placard. `model/plancherGardeManger.ts`, à côté de
      `plancher.ts` et **pas dedans** : même mot, autre objet — celui-ci compte
      des **unités d'achat** et se recharge en achetant, l'autre compte des
      portions et se recharge en cuisinant. L'unité est celle du relevé
      (`EtatIngredient.unites`) : `pates` porte quatre lots au placard et **un**
      plancher. Se pose à la main sur « L'inventaire ».

- [x] **T40 — `usage: apero`, et c'est la preuve du mécanisme.** L'apéro n'existe
      nulle part aujourd'hui : ni dans `rayons.ordre` (`primeur, boucherie,
      poissonnerie, crèmerie, frais, épicerie`), ni comme nature. Ce n'est pas un
      rayon — les fruits secs s'achètent en épicerie, le rayon dit *où on
      l'achète* — ni un plat : `creneaux.yaml` fait 21 créneaux et rien d'autre.
      C'est un **usage posé sur des denrées** — `fruits-secs-melange`,
      `graines-courge`, `tomates-sechees`, `terrine-campagne`, `guacamole`,
      `pignons-pin` sont déjà là. Jamais distribué comme carte, ne marque aucun
      score, **ne produit que des lignes de courses**. S'il marche, c'est que le
      plancher est bien indépendant du scoring.
      **La preuve est plus forte que prévu, et elle est mesurée :** ces six
      denrées sont citées par **zéro** des 86 recettes. Aucune ne peut donc
      gagner un point par accident — si elles paraissent à l'écran, c'est que le
      plancher a marché seul. Et elles ne sont pas un cas isolé : **28 des 45
      ingrédients du garde-manger** ne sont cités par aucune recette. Plus de la
      moitié du placard est invisible au scoring, et l'apéro n'est que le cas
      nommé de ce trou-là.

- [x] **T41 — Aucun arbitrage cuisiner/acheter : l'objet dicte le canal.** Un
      type du dépôt ne se recharge que par la cuisine (→ bonus de score) ; une
      denrée du garde-manger que par l'achat (→ ligne de courses). La bolognaise
      n'a l'air ambiguë que parce que les deux existent, et le catalogue les
      distingue **déjà** : `sauce-bolognaise` (base cuisinée, congélo) et
      `sauce-bolognaise-bocal` (bocal acheté, 300 g, garde-manger) sont deux ids.
      **« Ce qui est sous son plancher » EST la liste Carrefour.**
      Fondu **dans les rayons**, pas en section à part : un rayon se traverse une
      fois. Deux détails que le ticket ne pouvait pas prévoir — un ingrédient que
      la semaine réclame **déjà** n'ouvre pas une seconde ligne (il annote la
      sienne, sinon on achèterait deux fois), et l'unité `unité` a dû naître pour
      la clé de course : aucune des **744** lignes d'ingrédients du corpus ne
      l'emploie, donc aucun état coché/rentré ne peut se marcher dessus.
      `sousLeurPlancher` ne reçoit ni plats ni poids : l'absence de score s'y lit
      **dans la signature**, et un test épingle les clés de la ligne pour que ça
      le reste.

- [ ] **T42 — La saison se pose sur le plancher, pas sur le plat.** « L'hiver de
      la soupe, l'été de la glace ». Or `saison` est un champ de PROVENANCE : il
      est niché sous `source:` à côté de `page:` et `encoding:` — c'est le
      chapitre du livre de Chioca —, il est **absent de `_repertoire.yaml`**
      (aucun des 15 plats du foyer n'en porte), présent sur 64 des 72 fichiers,
      et **lu nulle part**. Le promouvoir coûterait une saisie sur 86 recettes ;
      poser une **fenêtre de validité sur le plancher** en coûte une dizaine.
      Hors fenêtre, un plancher ne vaut rien : ni bonus, ni ligne de courses.
      ⚠ Le plancher soupe est le plus fragile : 8 soupes et veloutés au corpus,
      mais 9 plats hiver et 10 automne contre 26 été.
      [Workspace#48](https://github.com/chapellu/Workspace/issues/48) en est donc
      un vrai préalable.

- [ ] **T43 — Le mois de fermeture inverse le plancher.** Fin septembre le
      plancher glace s'éteint et il reste des portions qui ne valent plus rien et
      occupent des tiroirs dont le plancher soupe a besoin. Dans le **dernier
      mois** de sa fenêtre, un plancher cesse de payer la reconstitution et paie
      l'écoulement, majoré, en disant pourquoi — « la saison des glaces se
      termine, il en reste 3 ». Pas de suppression, pas d'alerte : un plat qui
      remonte dans la main au bon moment.

- [ ] **T44 — Un plancher que les faits contredisent se retire.** Symétrique de
      T37 : sous son seuil depuis longtemps, rien ne le recharge, le plat a été
      proposé et écarté plusieurs fois → l'app propose de le supprimer, même
      geste que sa création en sens inverse. **Un plancher est une hypothèse sur
      des habitudes.**

- [ ] **T45 — Deux nombres : le plancher, et le niveau de réappro.** Un plancher
      dit *que* tu es en dessous, pas *combien* mettre dans le caddie — et
      Carrefour est rare et gros : « on ne fonctionne pas en flux tendu à faire
      les courses tous les jours ». Plancher maïs à 2, il en reste 1 : racheter 1
      te remet en dessous à la première boîte ouverte. Il faut donc un **niveau
      de réappro** au-dessus du plancher. Il se **propose tout seul** — ce qui se
      consomme entre deux grosses courses, que le journal de T25 sait mesurer —
      donc toujours un seul chiffre à valider. **Pas de symétrique au dépôt** :
      une soirée de cuisine produit ce qu'elle produit (`portions_eq`).

- [x] **T46 — Un plancher n'existe que sur ce que l'app sait compter.** Épicerie
      comptable, fond de placard, congélateur. **Interdit** sur primeur, frais
      court et les 23 ids sans rayon : T30 dit que les fruits & légumes ne
      s'estiment pas du tout et que le frais court ne se parie jamais sans
      l'avoir vu, donc « toujours 3 oignons » serait une cible que l'app est
      structurellement incapable d'évaluer — et le premier endroit où elle
      réclamerait des courses à tort. **Position de départ, pas frontière
      acquise** : l'utilisateur a dit « ok pour le moment on verra à l'usage ».
      *Pris en avance de T42–T45, parce que T39 ne peut pas exister sans lui :
      sans barrière, le premier plancher posable est l'oignon.* La barrière est
      la **classe** de T30, jamais une liste d'ids — elle suit donc le corpus au
      lieu de vieillir à côté. **Ce que la mesure a corrigé :** sur le relevé du
      26/08 elle ne mord **que sur le primeur**. 45 ingrédients distincts, dont
      40 `epicerie`, 1 `fond-de-placard` (`farine`) et 4 `fruits-legumes` — ail,
      échalote, oignon, pomme de terre. **Zéro `frais-court`, zéro `non-suivi`** :
      les 23 ids sans rayon sont des ids de *recettes*, et aucun n'est dans un
      placard. Elle attrape donc précisément, et seulement, les quatre denrées que
      la prose du ticket nommait. Ce qui est écarté est **nommé à l'écran avec sa
      raison** : un bouton absent sans un mot ressemble à une panne.

- [x] **T47 — UNE SEULE ÉCHELLE : la vie qui reste.** C'est la correction de
      l'utilisateur, et elle unifie trois mécaniques en une. `ecoule_frigo: 5` et
      `ecoule_congelo: 3` classent par **endroit**, et l'endroit n'est qu'un
      proxy grossier de l'urgence : « si j'ai une bolognaise un peu vieille au
      congélateur c'est plus urgent qu'un truc frais au frigo ». Les deux
      constantes sont **supprimées comme paire** et remplacées par un seul poids
      `ecoule`, modulé par la **fraction de vie consommée** du lot. Reconstituer
      devient une valeur **constante**, écouler une valeur **qui monte avec le
      temps** : tôt dans la vie d'un lot reconstituer gagne, tard écouler gagne,
      et l'arbitrage cesse d'être une règle. `article_marginal: -0.4` fait déjà
      payer un plat de reconstitution pour chaque article qu'il ajoute au panier,
      donc reconstituer un bouillon (qui n'exige rien) bat naturellement
      reconstituer une bolognaise (qui exige de la viande).

      **Fait le 09/09/2026.** `src/model/ecoulement.ts` (le barème unique),
      `LigneChaine.fraction` dans `calcul.ts`, `bonusPlacard` réduit à
      `placardDuPlat` (la collecte, sans notation), et `scoring.ts` qui verse les
      deux stocks dans **une seule somme plafonnée**. Plus `npm run ecoulement`,
      étendu au dépôt et à la rampe.

      **L'EXEMPLE DU TICKET EST FAUX, ET DE DEUX FAÇONS.** Le grief — « ça classe
      par endroit » — est juste ; l'illustration ne l'est pas.

      - **La paire ne faisait pas ce que le catalogue annonçait.** Lue dans
        `equilibre.yaml` elle se lit « 5 au frigo, 3 au congélo », donc le frigo
        gagne. Lue dans `semaine_model._score`, les deux tests sont
        **indépendants** : `ecoule_frigo` tombe sur n'importe quel lot
        préexistant et `ecoule_congelo` **s'ajoute** quand ce lot est au
        congélateur. Le congélo valait donc **8 contre 5** — l'inverse de ce que
        le fichier annonçait depuis le prototype. Le foyer avait déjà ce qu'il
        demandait, et personne ne pouvait le savoir en lisant le catalogue.
      - **Ce que la paire ne savait vraiment pas faire est dans l'adjectif, pas
        dans le lieu :** « une bolognaise un peu **vieille** ». Un bocal congelé
        hier touchait les mêmes 8 points qu'un bocal de quatre mois, et un reste
        du frigo à son dernier jour les mêmes 5 qu'un reste de la veille. Le
        défaut n'est pas que l'endroit soit mal classé, c'est que **l'âge
        n'entrait nulle part** — et c'est exactement ce que la fraction répare.

      **LE PLAFOND EST PARTAGÉ, ET C'EST LA VRAIE DIFFICULTÉ DU TICKET.** Laisser
      le placard plafonner de son côté et le dépôt du sien aurait fait **six**
      articles là où T59 en promet trois, sans qu'aucune ligne ne change de sens
      ni qu'aucun écran ne rougisse. D'où `bonusPlacard` → `placardDuPlat`, qui a
      perdu sa notation en route : un seul endroit trie, coupe et note.

      **LES LOTS DE LA SEMAINE COMPTENT COMME CEUX DE L'AMORCE**, et ce n'est pas
      un débordement de périmètre : leur appliquer deux barèmes ferait revenir par
      l'**origine** exactement ce que le ticket chasse par l'**endroit**. C'est
      d'ailleurs le cas le plus visible — **la paire abandonnée ne le notait pas
      du tout**, elle ne payait que le stock antérieur à la semaine. Mesuré sur
      des lentilles mijotées posées lundi soir : la carte qui les mange vaut
      **+1,3 puis +2,5 puis +3,8 puis +5,0** du mardi au vendredi, dit « sauve ce
      qui se perd » au dernier jour, et disparaît le samedi — le frigo est DUR
      (T58). C'est la rampe entière, sur le corpus réel.

      **LE POINT DE BASCULE TOMBE SUR `SEUIL_URGENT`, ET C'EST UN CONSTAT.** Avec
      `ecoule: 5`, écouler passe devant `plancher_type` (3) à 0,60 de vie
      consommée, et devant `plancher_congelo` (4) comme `chaine_couverte` (4) à
      **0,80** — le seuil « urgent » de T57. Les quatre nombres ont été posés à
      vue, à des mois d'écart, sans que personne vise cet alignement : c'est à
      relire plutôt qu'à recopier si l'un d'eux bouge, et un test le tient sur les
      poids pour qu'on le relise.

      **CE QUE ÇA CHANGE, MESURÉ.** Au premier dîner, 8 cartes sur 64 écoulent
      quelque chose. Le maximum d'articles par plat passe de **1 à 2**
      (`pates-bolognaise` : un paquet de pâtes ouvert + le bocal de l'amorce),
      donc **le plafond de trois ne mord toujours pas** — il mordra quand une
      semaine posée laissera deux restes derrière elle en plus d'un paquet
      ouvert. Et un seul article ne peut jamais passer devant
      `proteine_manquante` : il faudrait une fraction de 1,20 quand elle plafonne
      à 1.

      **LE PROTOTYPE PYTHON GARDE LE FORFAIT**, et c'est écrit dans son code : il
      n'a pas d'horloge par lot — une fenêtre de foyer et un `_stock_has` binaire
      — donc moduler par un âge qu'il lit mal donnerait un chiffre plus faux que
      le forfait. Il lit désormais `ecoule` au lieu de la paire disparue. **L'app
      est en avance sur le modèle de référence sur ce terme**, ce qui n'était
      jamais arrivé ; `catalogue/README.md` dit depuis longtemps que les deux
      doivent fusionner.

- [ ] **T48 — Le trou de portage est plus large qu'annoncé.** `scoring.ts` ne lit
      que neuf poids : `proteine_manquante`, `proteine_saturee`,
      `famille_legume_neuve`, `repetition_feculent`, `repetition_profil`,
      `chaine_couverte`, `chaine_manquante`, `mal_transporte`,
      `article_marginal`, plus `ecoule` via `ecoulement()` (les `ecoule_placard_*`
      y ont fusionné en T57/T59, la paire `ecoule_frigo`/`ecoule_congelo` en T47).
      Sont parsés et **jamais lus** : `plancher_congelo`, `ecoule_frigo`,
      `ecoule_congelo`, `congelateur.plancher`, `main.taille` (le code code 4 en
      dur), `main.cooldown_jours`. Ce n'est pas une série d'oublis épars — c'est
      toute la moitié « stock et congélateur » du score qui n'a jamais été
      portée. T36 et T47 en reprennent trois ; les trois autres restent.
      ⚠ **Cette liste est incomplète — voir l'audit de T47 plus bas.**

      **T52 en a rendu trois au catalogue** — `main.taille` (5 au lieu du 4 en
      dur), `main.cooldown_jours` (branché sur le journal des cuissons, faute de
      source exportée), et `main.garantir`, qui n'était pas dans cette liste
      parce que le code le recopiait à l'identique. Un réglage mort qui donne
      par hasard la bonne réponse reste un réglage mort : il aurait divergé au
      premier changement du catalogue, et en silence. **Restent
      `plancher_congelo`, `ecoule_frigo`, `ecoule_congelo` et
      `congelateur.plancher`** — c'est-à-dire exactement la moitié congélateur,
      celle que T36 et T47 reprennent.

      **T36 en a rendu deux de plus** : `plancher_congelo` et
      `congelateur.plancher` sont lus, et le premier paie enfin quelque chose.
      **Restent `ecoule_frigo` et `ecoule_congelo`**, que T47 supprimera comme
      paire — ils attendent l'horloge de Workspace#50, pas un branchement.

      **T47 les a supprimés, ET CE TICKET N'EST PAS CLOS POUR AUTANT : SA LISTE
      ÉTAIT INCOMPLÈTE.** Audit refait le 09/09/2026 en balayant `src/**` clé par
      clé, plutôt qu'en relisant la prose ci-dessus. Restent **quatre réglages
      parsés et jamais lus**, dont ce ticket n'en nommait **aucun** :

      - `hors_budget: -4` — le modèle Python pénalise un plat qui déborde le
        budget de temps du créneau ; l'app n'a pas de budget de temps du tout.
        C'est une fonctionnalité manquante, pas un branchement oublié.
      - `anticipation_ratee: -5` — « le trempage était pour hier soir ». Demande
        les échéances et l'agenda, et
        [Workspace#48](https://github.com/chapellu/Workspace/issues/48) n'a pas
        tranché ; l'agenda est d'ailleurs un mécanisme du **shell**, pas de la
        cuisine.
      - `congelateur.portions_par_tiroir: 6` — les plafonds d'espace se lisent en
        fait sur `foyer.espaces`, qui les porte déjà. Doublon, pas oubli.
      - `congelateur.reste_ne_compte_pas_dans_les_plafonds: true` — **le cas T52 à
        l'identique** : `couverture()` implémente le comportement **en dur**
        (`surReste`) sans lire le drapeau. Un réglage mort qui donne par hasard la
        bonne réponse reste un réglage mort, et celui-ci a survécu à deux audits
        pour cette raison exacte.

      **La leçon vaut plus que la liste :** ce ticket a été écrit en relisant le
      code et il s'est trompé trois fois de suite sur son propre inventaire (les
      trois de T52, puis ceux-ci). Le prochain qui le reprend commence par
      **balayer les clés**, pas par relire ce paragraphe.

### Ce que les planchers ont coûté et appris

**Fait le 07/09/2026** : `src/model/plancher.ts`, `src/db/planchers.ts`, la
section « Ce qu'on veut toujours avoir » de « L'inventaire », et le branchement
dans `offre()`. Plus `npm run planchers`, un script qui IMPRIME les chiffres du
corpus au lieu de les figer en assertions — même partage que `npm run perf` :
les promesses vont dans les tests, les tailles dans un script qu'on relance.

**TROIS DES FAITS DE CORPUS SUR LESQUELS #43 S'APPUYAIT SONT FAUX**, et c'est la
mesure qui l'a dit, pas la relecture.

- **« `pain-rassis` est émis par 5 recettes » : il est émis par ZÉRO.** Trois
  types sont `accepts` sans que rien ne les produise — `pain-rassis`,
  `kasha-cuit`, `pois-chiches-cuits`. Le modèle n'a pas eu à prévoir le cas :
  dériver le producteur (T34) suffit à les écarter, puisqu'un type sans
  producteur n'a aucun plat à encourager. L'exemple canonique du ticket était
  faux ; l'argument qu'il servait tient quand même, sur `reste-roti` et
  `carcasse-volaille`, produits chacun par deux recettes. **Seuls 4 types sur 74
  sortent de plusieurs recettes**, et c'est peu — mais c'est exactement le cas
  où un plancher sur la recette aurait fabriqué deux réserves pour un seul
  bocal.
- **« Les 13 `kind: base` sont exactement les 13 types acceptés » : non.** 12
  types `base`, 14 types acceptés, 9 en commun. Cinq types acceptés ne sont pas
  des bases, trois bases ne sont acceptées nulle part.
- **Les tailles ont bougé** : 78 emits (et non 69), 74 types distincts (68), 50
  congelables (46), sur 46 des 86 plats. **48 types peuvent porter un
  plancher** — ce sont les congelables — ce qui rend l'arithmétique de T36 moins
  brutale qu'annoncé, mais pas moins vraie : 48 planchers à une portion
  réclameraient 48 places pour les 18 qui existent.

**CE QUE LE BRANCHEMENT DÉPLACE VRAIMENT**, mesuré sur un dîner du lundi, 64
cartes jouables :

- à l'amorce le congélateur porte **2 portions d'un seul type** — donc sous le
  plancher de secours par les deux conditions à la fois ;
- un plancher `sauce-bolognaise` à 3 fait passer son producteur de la
  **32ᵉ à la 16ᵉ place** ; le même plancher à 2, que le bocal existant satisfait,
  ne le bouge pas d'un rang ;
- un plancher `reste-roti` à 1 fait monter **ses deux producteurs ensemble** —
  36ᵉ → 22ᵉ et 33ᵉ → 16ᵉ. Ils ne se partagent pas le bonus, ils l'ont tous les
  deux, et c'est la promesse de T34 rendue visible.

**LE PLANCHER DE SECOURS PAIE 40 CARTES SUR 64, ET C'EST BEAUCOUP.** Sur un
congélateur vide, tout plat qui congèle quelque chose touche le bonus — 46 des
86 plats du corpus. Le terme ne départage donc presque rien en semaine 1 : il
dit « cuisine quelque chose qui se garde », ce qui est utile une fois et
constant ensuite. C'est la mécanique telle que #43 la décrit, et la condition de
diversité est ce qui la rattrape dès que le tiroir se remplit — mais **si le
volume de questions de T33 devait décroître, celui-ci doit s'ÉTEINDRE**, et
c'est à l'usage qu'on le verra. S'il ne s'éteint pas, c'est `plancher_congelo`
qu'il faut rouvrir.

**Une divergence assumée avec l'argument de #43, écrite ici pour qu'elle se
voie.** Le plancher de secours compte **toutes** les portions du congélateur,
bases comprises — c'est la lettre de §C (« ≥ 4 portions sur ≥ 3 types ») et le
sens que `congelateur.plancher` avait déjà. Mais §B dit dans la même page qu'un
bouillon « ne fait pas un dîner, il en accélère un » : à le suivre, le secours
ne devrait compter que les dîners. Les deux lectures sont défendables, la
seconde n'a pas été retenue — les deux plafonds de T35 empêchent déjà les bases
de manger les tiroirs. **À trancher à l'usage.**

**Ce que ça a coûté ailleurs.** `Savoir` gagne un champ obligatoire
(`planchers`), donc trois fichiers de test ont été touchés pour y écrire
`planchers: []` — c'est-à-dire « démarrage à froid », ce qui est une affirmation
et pas du bruit. Et `equilibre.yaml` gagne quatre nombres (`diversite_min`,
`plafond_apports`, `plafond_diners`, `plancher_type`), tous **posés à vue**,
dans le registre que le fichier emploie déjà pour son propre 4.

### Trouvé en marge de T47, et noté au passage

**LE LOT DE LENTILLES DE L'AMORCE EST HORS JEU DEPUIS T54, ET RIEN NE LE DIT.**
`stock.yaml` porte 400 g de `lentilles-vertes-cuites` nées le 06/08 ; le type
tient **4 jours** au frigo, et le frigo est DUR depuis T58. Sur la semaine de
référence des tests (17/08) le lot a **douze jours** : il sort du jeu, sans un
mot, et le seul stock vivant de l'amorce est le bocal de bolognaise. Ce n'est pas
un bug — c'est exactement ce que T54 et T58 demandent — mais **c'est une amorce
qui vieillit toute seule** : elle a été écrite quand le frigo n'avait pas
d'horloge. `npm run ecoulement` l'affiche maintenant en clair (⛔ HORS JEU). À
trancher : rafraîchir les dates de `stock.yaml`, ou assumer que l'amorce montre
aussi ce qui est périmé.

**LA RESTRICTION DES PLANCHERS AU CONGÉLATEUR N'EST PLUS DÉFENDUE PAR CE QUI LA
DÉFENDAIT.** Voir juste en dessous : sa condition de réouverture est remplie.

### Laissé ouvert par T34–T38

- **Un plancher ne compte que ce qui est AU CONGÉLATEUR.** Les 400 g de
  lentilles cuites de l'amorce sont au frigo et ne comptent pour aucun plancher.
  C'était volontaire — un reste qui tient trois jours n'est pas une réserve, et le
  poser en cible ferait réclamer de cuisiner tous les trois jours — et c'était une
  restriction, pas une vérité : « elle se rouvre avec l'horloge de T54 ».
  ⚠ **T54 est fait, et personne n'a rouvert.** Chaque type porte sa fenêtre
  depuis Workspace#50 ; le frigo est devenu comptable. La restriction tient
  toujours dans le code et n'est plus adossée qu'à un choix que rien n'a
  réexaminé. `planchables()` le dit maintenant dans son en-tête.
- **On ne peut pas défaire un plancher accepté.** Le refus s'écrit et tient ;
  l'acceptation, elle, n'a pas de bouton pour revenir en arrière. C'est T44 —
  « un plancher que les faits contredisent se retire » — et tant qu'il n'existe
  pas, un plancher posé un jour d'enthousiasme réclame pour toujours.
- **Le geste d'acceptation n'a pas de parcours e2e.** Il en faudrait deux
  cuissons à travers l'écran, ce qui double le plus long parcours de la suite.
  Seule la moitié négative est épinglée bout en bout — *une seule cuisson ne
  propose rien* —, et c'est la moitié qui protège du bruit.
- **`article_marginal` fait bien payer un plat de reconstitution** pour ce qu'il
  ajoute au panier, comme §K l'annonçait, mais **ça n'a pas été mesuré
  séparément** : reconstituer un bouillon devrait battre reconstituer une
  bolognaise, et personne n'a vérifié de combien.
- **La proposition ne dit pas ce qu'un plancher COÛTERAIT en places.** Accepter
  cinq planchers à 1 sur 18 places est possible et personne n'en avertit ; les
  plafonds de T35 éteignent le bonus mais ne refusent pas la décision.

## Le rail de planification — [Workspace#45](https://github.com/chapellu/Workspace/issues/45)

Tranché sur prototype le 03/09/2026 : trois variantes du rail montées côte à
côte dans la coquille réelle (branche `proto/rail-45`, à jeter), et **A, « Le
fil »**, l'emporte. Le prototype est la source primaire ; ce qui suit est ce
qu'il faut en garder.

**CE QUI A ÉTÉ ÉCARTÉ COMPTE AUTANT.** B distribuait sans horizon jusqu'à
« j'arrête », C faisait de l'horizon une sélection sur la grille des vingt-et-un
créneaux. Les deux montraient la main PENDANT qu'elles posaient une question —
un bandeau, un tiroir — et c'est ce qui les a perdues : répondre change la main
qui suit, donc les cartes affichées à ce moment-là sont des cartes qu'on sait
fausses.

- [x] **T49 — L'écran du fil.** Un écran d'ouverture qui demande **combien de
      repas**, en crans (1 / 3 / 5 / 7 / 14) et non en champ libre : ça se répond
      du pouce. Puis le rail avance **linéairement, plein écran, un pas à la
      fois**, en réutilisant `main()` créneau par créneau — c'est un rail, pas un
      solveur de semaine (Workspace#41 range le solveur hors périmètre). Les
      points de progression en haut sont des **boutons** : on retourne à *jeudi
      déjeuner*, on ne recule pas « d'un », donc pas de bouton « précédent ».
      L'itinéraire est les N premiers créneaux `choisi` encore indécis, dans
      l'ordre chronologique.

- [x] **T50 — Une question est un PAS du fil.** Une seule file, pas deux : la
      question prend l'écran, porte son propre point de progression, et la main
      attend derrière elle. Elle naît au moment de la proposition, sur un
      ingrédient **central** du plat proposé — ni assaisonnement, ni `base`, une
      base ne s'achète pas — et seulement si `journal.confiance()` n'est pas
      `sur`. Pas de plafond : Workspace#42 a supprimé les ~5 de #34, et le
      gouverneur est ici mesurable — le doute s'épuise en étant répondu. Mesuré
      sur un journal de démo (six dîners sur douze jours, aucune observation
      depuis le relevé du 26/08) : **une passe de trois créneaux lève une à deux
      questions.**

- [x] **T51 — Le vide silencieux, et PAS un troisième état.** « Je ne planifie
      pas ce repas » n'entre pas dans le modèle. Deux raisons : choisir N met
      déjà hors du plan tout ce que l'horizon ne couvre pas, sans qu'un doigt
      clique ni que rien s'écrive ; et le trou n'était pas dans le modèle mais
      dans l'écran — un créneau vide ne râle que parce que « La semaine »
      l'affiche « à poser ». C'est donc `semaine.vue.ts` qui change : ne montrer
      que ce qui est posé ou sauté, le reste ne dit rien. `SAUTE` garde son sens
      exact — *on ne mange pas là*, une décision —, le vide redevient une
      décision pas encore prise. Revoir dans la foulée `prochainVide` (le bouton
      du bas a encore besoin d'une cible) et ce que `calc.manques` réclame. Le
      bouton « Je ne planifie pas celui-là » du fil **n'écrit rien** : il
      raccourcit la passe, c'est de la navigation.

- [x] **T52 — `equilibre.main` enfin lu.** Tranché ici plutôt que renvoyé au
      backlog : `main()` prend `taille` du catalogue (**5**) au lieu du `4` en
      dur, et honore `cooldown_jours: 10`. Le cooldown n'a **aucune source
      exportée** — `catalogue/historique.yaml` existe mais `export_json.py` ne le
      met pas dans `cuisine-data.json`. La source honnête est le journal des
      cuissons (`sorte: "cuisine"`), déjà en base et déjà l'entrée du rejeu du
      placard : un plat cuisiné dans les 10 jours sort du paquet. Reprend deux
      des trois réglages morts que T48 recense.

- [~] **T53 — La fin de la passe : deux canaux, pas une liste.** **TOMBÉ**, voir « Ce que #44 corrige dans les tickets déjà posés » : une seule
      liste dans `rayons.ordre`, la seule section qui survit étant la réserve
      (T61). Ce que T49 a construit à la place est une fin de passe qui ne
      récapitule rien et renvoie à la liste existante — *la cérémonie pose des
      créneaux, les créneaux font la liste*. Le ticket reste ici barré plutôt
      que supprimé : ce qu'il proposait a été jugé, pas oublié. Le
      récapitulatif ferme le fil sur **le frais** (marché du vendredi, casier
      Côté Champs, panier vert — non choisi, à manger dans les jours) et **la
      réserve** (Carrefour — sec, boîte, congelé, ça se planifie). C'est le
      partage de Workspace#41 : une seule liste fusionnée est la raison pour
      laquelle la liste se lit mal. Le prototype le fabrique en découpant
      `parRayon` sur `{primeur, boucherie, poissonnerie, crèmerie, frais}` contre
      le reste ; c'est le partage qui est validé, pas cette implémentation.

### Ce que le fil a coûté et appris

**Fait le 07/09/2026**, en une passe : `src/model/fil.ts`, `src/ecrans/fil.vue.ts`,
`src/ecrans/Fil.tsx`, la route `#/cuisine/fil` à deux formes, et
`src/ui/Cartes.tsx` — la question et la carte extraites de `Poser.tsx` plutôt que
recopiées, parce que deux écrans qui proposent le même plat doivent en dire
exactement la même chose.

**L'ITINÉRAIRE SE PERSISTE, ET C'EST UNE EXCEPTION ASSUMÉE À LA RÈGLE DE TÊTE.**
« Persisté : ce qu'un doigt a décidé ; recalculé : tout ce que `calculer`
dérive. » L'itinéraire a l'air d'un calcul — « les N premiers créneaux indécis »
— mais il n'est pas dérivable après coup : cette phrase change de sens à chaque
plat posé, donc le recalculer ferait glisser le rail sous le doigt. Poser le
premier ferait du deuxième le premier, et les points de progression se
renuméroteraient à chaque geste. Ce qu'on garde est donc bien une **décision** :
la liste que choisir l'horizon a arrêtée, à l'instant où on l'a choisi. Un test
l'épingle en montrant qu'un itinéraire recalculé, lui, aurait bougé.

**Un bug de routeur dormait depuis T7, et le fil lui a donné son premier
appelant.** `aller(route, remplacer)` passait par `history.replaceState`, qui
change l'URL **sans émettre `hashchange`** — l'événement auquel `useRoute`
s'abonne. Le chemin `remplacer` n'avait jamais servi : la reprise d'une passe est
la première redirection de l'app, et elle affichait un écran blanc pendant que la
barre d'adresse annonçait la bonne route. Corrigé en `location.replace`. Le
symptôme visible était trois parcours e2e à trente secondes de timeout chacun ;
la suite est passée de 44 s à 14 s une fois la cause retirée.

**T51 a rendu la case vide muette, donc introuvable.** Les parcours désignaient
un créneau libre par son texte — `hasText: "à poser"` — c'est-à-dire exactement
la phrase que ce ticket supprime. D'où `.co-slot.libre` : l'état existe toujours,
il est simplement devenu silencieux, et un sélecteur doit pouvoir le nommer
autrement que par ce qu'il raconte.

**Le bouton du bas de « La semaine » lance désormais une passe** au lieu de viser
la première case libre. `prochainVide` survit — il décide s'il y a une passe à
lancer — mais il n'est plus une cible : c'est l'horizon qui choisit où l'on
atterrit. Poser un plat isolément reste possible en dépliant la case.

Vérifié aussi, et sans changement nécessaire : **`calc.manques` ne réclamait déjà
rien sur un créneau vide** (`if (!joue(rid)) return`). La réclamation venait
entièrement de l'écran, ce que #45 soupçonnait sans l'avoir mesuré.

### Laissé ouvert par #45

- **`nature: optionnel` perd une partie de sa raison d'être.**
  `catalogue/creneaux.yaml` l'a inventée parce que « `choisi` fait d'un créneau
  vide un TROU ». T51 supprime cet argument ; il ne reste que « où le rail a le
  droit d'atterrir ». À revoir, pas tranché.
- **Les crans de l'horizon** (1/3/5/7/14) sont posés à vue, comme le `4` de
  `congelateur.plancher` avant eux. Seul l'usage les réglera.
- **La fin de passe ne récapitule rien.** T53 est tombé et T61 n'existe pas
  encore : l'écran de fin compte les repas posés et renvoie à la liste, sans
  savoir dire ce qui vient d'y entrer. C'est honnête et c'est maigre.
- **« Pas celui-là » ne survit pas au rechargement**, par construction : il
  n'écrit rien, donc il n'y a rien à retrouver. À l'usage, un créneau écarté
  trois fois de suite dira peut-être quelque chose que le modèle devrait
  entendre — mais l'entendre demanderait de l'écrire, et c'est précisément ce
  que T51 refuse.
- **Une seule passe à la fois** (`CLE_FIL` est une clé unique). Deux fils
  concurrents seraient deux rails sur la même semaine et rien ne dirait lequel
  gagne ; ça n'a pas été jugé, juste tranché au plus simple.

## Une horloge pour chaque stock — [Workspace#50](https://github.com/chapellu/Workspace/issues/50)

Grillé en français les 04–05/09/2026. Le modèle tient en une phrase : **tout
stock a une horloge, toutes les horloges se lisent sur le même axe 0–1, et cet
axe n'a que deux mots.** C'est le dénominateur que l'écoulement de
Workspace#43 §K attendait pour exister.

**CE QUE LES CHIFFRES ONT CHANGÉ EN COURS DE ROUTE**, parce que rien de ce qui
suit ne s'est décidé sur la seule lecture du code :

- **Le dénominateur existait déjà, deux fois et dans la mauvaise forme.**
  `conservation.yaml` porte `congeler.fenetre: {unite: mois, valeur: 3}`, plus
  12 mois pour le bocal, 6 pour la lacto et le séchage, ×2,5 pour le sous-vide.
  `export_json.py` **jette `fenetre`** côté dépôt — le type `Conservation` ne
  l'a pas — et le **stringifie** côté garde-manger (`ConservationDenree.fenetre:
  string`, « 3 mois »). Affichable, jamais calculable. Même mode d'échec que
  `historique.yaml` et que les cinq réglages morts de T48.
- **L'app promet une durée qu'elle n'applique pas.** `gardeFrigo` va jusqu'à la
  ligne de dépôt et n'est lu que par `Semaine.tsx:191` et `Aujourdhui.tsx:110`,
  qui écrivent « 3 j au frigo ». L'expiration, elle, lit `foyer.fenetreFrigo` :
  **4 jours pour tout le monde**. L'app dit 3 et périme à 4.
- **L'horloge manquante du congélateur est un court-circuit d'une ligne** —
  `depot.ts:225`, `ligne.location === "congelo" || age <= this.fenetre`.
- **`bonusPlacard` est en pratique un bonus de +5 pour « contient un oignon ».**
  5 denrées `haute` sur 53 ; la cinquième (pignons) n'est dans **aucun** plat ;
  et **40 plats sur 86** contiennent oignon ou ail. ⚠ **La raison écrite ici —
  « 4 le sont parce qu'elles sont sous l'évier » — est fausse, et T60 s'est
  cassé les dents dessus** : ces quatre légumes sont `etat: frais`, et
  `urgence()` tranche sur le frais avant de regarder la zone. Le constat tenait,
  son explication non, et le remède qu'elle a dicté était un no-op.

- [x] **T54 — Le frigo compte par plat, plus par foyer.** `gardeFrigo` (78
      valeurs saisies à la main, de 0 à 7 jours) devient l'horloge réelle ;
      `foyer.fenetreFrigo` retombe au rang de **défaut**. Supprime au passage
      l'incohérence entre ce que l'écran promet et ce que le modèle applique —
      deux écrans écrivaient « 3 j au frigo » pendant qu'il périmait à 4.

      **CE QUE LE TICKET N'AVAIT PAS PRÉVU : UN LOT CONSTATÉ NE DÉCLARE RIEN.**
      La table `stock` porte un type, une quantité et une date de naissance,
      jamais un `frigo_days` — donc « lire la valeur de la ligne » aurait laissé
      la moitié du dépôt sur le défaut du foyer, et le ticket n'aurait été fait
      qu'à moitié, en silence. La fenêtre d'un lot constaté est donc **dérivée de
      son type**, comme `producteurs()` dérive qui recharge quoi. Mesuré : 74
      types émis, **un seul** dont les producteurs divergent (`reste-roti`, 3 ou
      4 jours) — on retient le plus court, entre deux avis sur la vie d'un reste
      le prudent est celui qui ne rend malade personne.

      **`frigo_days: 0` NE VEUT PAS DIRE « À ÉLIMINER », ET C'EST LA MESURE QUI
      L'A DIT.** Les trois emits à zéro jour du corpus sont trois **desserts
      glacés** — glace au chocolat, muffins, crème glacée — tous `congelo: true`.
      Zéro jour de frigo veut dire « ça n'a aucune vie au frigo » : personne ne
      fait refroidir une glace. Leur appliquer une fenêtre nulle les aurait fait
      **disparaître le lendemain de leur cuisson**, alors qu'ils sont exactement
      ce qu'on garde au congélateur. Leur horloge est donc celle du congélateur.
      ⚠ Ça ne referme PAS « un lot congelable posé cette semaine vieillit au
      frigo » : un congelable à 3 jours vieillit toujours au frigo, parce que
      `ajouter()` l'y range. Seul le cas où la fenêtre est **nulle** est traité,
      c'est-à-dire celui où le corpus dit explicitement non.

      **Ce que ça resserre, remesuré** (`npm run horloges`) : sur les 78 emits,
      69 resserrés, 4 inchangés, 5 allongés. Mais le chiffre qui compte est celui
      des **28 non-congelables**, les seuls dont la vie se joue entièrement là :
      **25 resserrés, 1 inchangé, 2 allongés** (les deux yaourts, qui passent de
      4 à 7 jours).

- [x] **T55 — Le congélateur a une horloge, forfait 3 mois.** Le court-circuit
      `location === "congelo"` est retiré : un bocal de 2019 n'est plus
      proposable pour l'éternité. La fenêtre est celle que `conservation.yaml`
      portait déjà — **90 jours**, et il a d'abord fallu que l'export cesse de la
      jeter. Forfait et non par type : congeler *aplatit* les différences, son
      mode d'échec est la qualité et non la sécurité, et cinquante nombres posés
      à vue seraient cinquante faux nombres.

      **LA DONNÉE ÉTAIT LÀ, SOUS DEUX FORMES, ET AUCUNE NE SE CALCULAIT.**
      `export_json.py` **jetait** `fenetre` côté dépôt (le type `Conservation` ne
      la portait pas) et la **stringifiait** côté garde-manger (« 3 mois »).
      Affichable, jamais comparable — le mode d'échec exact de `historique.yaml`
      et des cinq réglages morts de T48. D'où `fenetre_jours()`, le pendant
      calculable de `_fenetre()` : les deux coexistent parce que l'une s'affiche
      et l'autre se compare, et la conversion (`JOURS_PAR_MOIS = 30`) vit **une
      seule fois**, côté Python. Un mois de trente jours n'est ni exact ni grave :
      `conservation.yaml` revendique des « CHIFFRES NON SOURCÉS » en tête, et ils
      ne servent qu'à réordonner des dîners.

      **`null` SUR UN MULTIPLICATEUR.** Le sous-vide porte `×2,5` : il rallonge
      le froid d'un facteur, il ne donne pas de fenêtre à lui. Écrire « 2,5 j »
      inventerait une durée que personne n'a saisie, et l'horloge s'en servirait
      sans le dire. Les sept méthodes sortent donc à 4, 90, —, 360, 360, 180, 180.

      **L'ABSENCE DE FENÊTRE ÉCHOUE BRUYAMMENT**, comme le chargeur du catalogue
      échoue sur un export qui a dérivé. Se rabattre sur un nombre écrit dans le
      code rendrait au congélateur le silence dont ce ticket vient de le sortir :
      il aurait l'air d'avoir une horloge, elle ne viendrait plus du corpus, et
      rien ne le dirait.

- [x] **T56 — Une date par lot, et aucun écran pour la saisir.** `dluo`
      optionnel sur la ligne de dépôt, qui **gagne sur la fenêtre du type**
      quand il est là — c'est le seul nombre vrai de toute l'horloge, les autres
      sont des ordres de grandeur posés à vue. L'ordre est la règle : la mesure
      bat le forfait, le forfait bat le défaut.

      **AUCUN ÉCRAN NE LA DEMANDE, ET C'EST LE TICKET.** Elle n'arrive que
      gratuitement — scan, événement `entree` du journal. Une date se saisit une
      fois par curiosité puis plus jamais, et le modèle se retrouve avec un champ
      que trois lots portent. La fenêtre du type reste donc le cas **normal**,
      pas le repli.

      **NI INDEX NI MIGRATION.** Dexie n'indexe que ce que `SCHEMAS` déclare et
      stocke l'objet tel quel : un champ optionnel non indexé s'ajoute sans
      version, et les lots déjà écrits restent lisibles — ils n'en ont pas, ce
      qui est exactement leur état. Elle se compte **depuis la naissance du lot**
      et non depuis aujourd'hui, sinon la fraction de vie consommée repartirait
      de zéro chaque matin.

- [x] **T57 — Un axe, deux mots.** Les urgences du garde-manger se **projettent**
      sur le même axe 0–1 que la fraction du dépôt : `haute` = 1,0,
      `moyenne` = 0,4, `basse` **hors échelle**. Ces valeurs ne sont pas
      inventées — avec `ecoule: 5` elles reproduisent exactement
      `ecoule_placard_urgent: 5` et `ecoule_placard_entame: 2`, donc **le placard
      ne bouge pas**, il gagne une échelle. `garde_manger.py` **garde ses trois
      urgences et ses zéro date** : son objection (« inventer une échéance pour
      pouvoir compter dessus serait le genre de chiffre qui a l'air juste et ne
      l'est jamais ») tient, et le relevé ne porte ni DLC, ni DLUO, ni date
      d'ouverture. L'affichage prend les seuils de **Don't Starve** — 50 % et
      20 % de vie restante, soit 0,5 et 0,8 de vie consommée — et **jette sa
      jauge** : le dénominateur de Don't Starve est une constante de jeu, le
      nôtre est deviné. Trois points, deux mots : rien / **à manger** /
      **urgent**. **L'absence de marque EST l'état frais**, comme *Fresh* n'a
      pas de préfixe dans le jeu.

      **`basse` EST HORS ÉCHELLE, PAS À ZÉRO**, et le typage l'impose (`null`).
      Zéro l'aurait fait entrer dans les sommes de T59 comme un terme nul — vrai
      par accident, faux dès qu'on aurait voulu compter les articles sauvés.

      **CE QUE LA MARQUE AJOUTE À LA PHRASE DE T58, SANS LA REMPLACER.** Elles ne
      parlent pas du même lot : `horloge` est une phrase réservée au congelé
      dépassé, qui dit *pourquoi il est encore là* ; la marque est un état, porté
      par tout lot **encore en jeu**, qui dit *où il en est*. D'où une règle que
      le ticket n'avait pas prévue : **un reste de frigo périmé ne porte AUCUNE
      marque**. « urgent » veut dire « mange-le maintenant » ; l'écrire sur ce
      que le modèle vient de refuser de proposer pour raison de sécurité serait
      exactement le contraire du service. Frigo dur, congélateur mou, jusque dans
      les mots.

      **Mesuré** (`npm run ecoulement`) : sur 3 mois ça prévient à J+45 puis
      J+72 ; sur le défaut du foyer à J+2 et J+3,2 ; sur la carcasse de volaille
      à **J+1 et J+1,6** — elle franchit les deux seuils dans sa première
      journée. C'est cette dernière ligne qui justifie de n'afficher aucun
      pourcentage : il serait faux à la décimale près. Seul le franchissement se
      dit.

- [x] **T58 — Frigo dur, congélateur mou.** Passé sa fenêtre un reste de frigo
      **sort du jeu**, comme avant : c'est une question de sécurité. Passé trois
      mois un bocal congelé **reste jouable**, sa fraction plafonne à 1, et l'app
      le **dit**. Refuser de proposer une bolognaise de quatre mois, c'est
      fabriquer de l'archéologie de congélateur.

      **LE PLAFOND N'EST PAS UNE COMMODITÉ D'AFFICHAGE.** Sans lui la fraction
      d'un lot mou monterait à 1,7 puis 4,2, et le score grimperait sans fin sur
      un bocal que personne ne mange — l'inverse exact du service rendu.

      **L'HORLOGE NE PARLE QUE QUAND ELLE A QUELQUE CHOSE À DIRE.** Un seul cas
      produit une phrase, le congelé dépassé : « au congélateur depuis 245 j,
      au-delà des 90 prévus — encore bon à jouer ». Elle informe, elle ne barre
      pas la ligne et n'offre aucun geste. Un reste de frigo périmé, lui, n'a
      **pas** de phrase, parce qu'il n'est plus là : il n'y a rien à dire d'un
      lot qu'on ne propose plus. C'est la leçon de « dégager une étagère » en
      T15 — un impératif qui est toujours affiché ne se distingue plus le jour
      où il compte.

      **En jours, pas en mois** : la conversion vit une seule fois, côté Python.
      La refaire à l'écran donnerait deux constantes libres de diverger, pour
      gagner un « 4 mois » à la place d'un « 128 j ».

- [x] **T59 — Le score cumule, plafonné à trois articles.** `ecoule: 5`, somme
      des fractions sur **au plus trois** articles, **pas de dégressivité**.
      **La règle « un seul bonus par plat » de `gardeManger.ts:122` est
      abandonnée** : un plat qui sauve trois choses vaut mieux qu'un plat qui en
      sauve une. L'objection d'équilibrage — plafond +15 quand
      `proteine_manquante` vaut 6 — a été soulevée et **écartée** pour trois
      raisons qui valent d'être relues avant de la ressortir : le levier de
      correction est le nombre `ecoule` lui-même et non un mécanisme de plus
      (`equilibre.yaml` : « valeur posée à vue, à régler à l'usage ») ; le mode
      d'échec redouté est déjà défendu trois fois (`repetition_profil: -4`,
      `repetition_feculent: -3`, `cooldown_jours: 10` depuis T52) ; et surtout
      **la domination est le cahier des charges** — Workspace#41 demande
      d'encourager « au maximum » l'utilisation des stocks, donc l'écoulement
      passant devant la protéine manquante n'est pas un déséquilibre, c'est
      l'app qui fait son travail. **Débloque T47.**

      **L'ARGUMENT QUE LA RÈGLE ABANDONNÉE PORTAIT ÉTAIT JUSTE ; SON REMÈDE
      VISAIT À CÔTÉ.** Le commentaire de `bonusPlacard` défendait le forfait par
      le bruit du cumul : l'oignon dans 42 % des plats, l'ail dans 19 %, donc
      +10 sur presque tout. Vrai — mais ce qui bruitait n'était pas le cumul,
      c'était que le frais ubiquitaire soit payé **du tout**. T60 le retire à la
      source, et le remède n'a plus rien à soigner.

      **LE PLAFOND NE MORD PAS ENCORE, et c'est un fait sur le placard, pas sur
      la règle.** Mesuré : **aucun des 86 plats n'écoule plus d'UN article** —
      le placard n'offre plus que des paquets entamés, à 0,4, et aucune recette
      n'en cite deux. Le terme plafonne donc en pratique à **2 points**, sous
      `proteine_manquante: 6`. Conséquence pour le garde-fou « le placard
      départage, il ne commande pas » : il ne se lit **plus sur les poids** — la
      lecture « 5 < 6 donc il départage » est morte le jour où le terme s'est mis
      à cumuler — il se **mesure sur le corpus**, et son test tombera le jour où
      T47 versera le dépôt dans la même somme. C'est exactement ce qu'on lui
      demande.

      **Les plus pressés d'abord** quand il y en a plus de trois, à égalité par
      nom : le plafond doit couper la queue de la liste, pas retenir ce que
      l'ordre des lignes de la recette met en tête — ce serait un fait sur la
      rédaction du fichier, pas sur ce que le plat sauve. Et **tous les sauvés
      restent nommés**, même au-delà du plafond : la phrase dit ce que le plat
      sauve, le score dit ce que ça vaut ; n'en nommer que trois ferait mentir
      la première pour justifier le second.

- [x] **T60 — Assainir la source du bonus placard.** L'intention est tenue et le
      résultat annoncé est atteint — **plus aucune denrée `haute` ne paie**, et
      le score pousse **9 plats sur 86 (10 %) au lieu de 50 (58 %)**. Mais
      **AUCUN DES DEUX GESTES DEMANDÉS N'AURAIT RIEN FAIT**, et c'est la mesure
      qui l'a dit, pas la relecture.

      **(a) « Une denrée qu'aucun plat ne consomme sort du score » ÉTAIT DÉJÀ
      VRAI**, par la forme de la boucle et non par un filtre : `bonusPlacard`
      part des lignes du **plat** et cherche dedans, jamais l'inverse. Les quatre
      `moyenne` hors recette — cracotte, krisprolls, blé-lentilles, farine
      d'épeautre — ne pouvaient rien bruiter. Le ticket décrivait un filtre à
      écrire ; il n'y en avait pas à écrire. Une propriété vraie par accident se
      perd au premier refactor, donc **un test l'épingle** désormais, et elles
      restent dans la liste « à sauver », qui est faite pour être lue.

      **(b) « L'artefact du sous-évier est déplacé, pas neutralisé » VISAIT LA
      MAUVAISE CAUSE.** Le ticket affirmait que 4 des 5 `haute` le sont « parce
      qu'elles sont sous l'évier ». Mesuré, les quatre légumes sont
      `etat: frais`, et `urgence()` tranche sur le frais **avant même de regarder
      la zone** : ils seraient tout aussi `haute` dans une cave sèche. Retirer
      « la cause zone » aurait donc laissé le +5 sur l'oignon **intact**, et le
      ticket clos à tort. Le seul `haute` purement dû à sa zone est le sachet de
      pignons — qui n'est dans aucun plat, donc n'avait jamais rien payé.

      **CE QUI A ÉTÉ FAIT À LA PLACE, EN UNE RÈGLE : le score ne paie que la
      barrière rompue** (`etat: entame`). C'est la seule horloge du placard que
      cuisiner arrête, et `garde_manger.py` le disait déjà mot pour mot. Les deux
      exclusions du ticket y tombent ensemble, plus la vraie. L'argument de fond
      est celui que `gardeManger.ts` écrivait en tête depuis T22 : un terme qui
      tire sur 42 % du corpus ne départage rien, quel qu'en soit le motif.

      **L'APP N'ARRÊTE PAS DE LE DIRE, ELLE ARRÊTE DE LE PAYER.** Le frais reste
      dans « À manger en premier » ; le mauvais rangement reste le geste « pomme
      de terre, oignon… — dans un endroit humide (sous-évier) », qui existe
      depuis T31 et que ce ticket n'a donc pas eu à créer. La note de l'écran,
      elle, devenait fausse — « Poser un plat remonte les recettes qui les
      mangent » ne vaut plus que pour les paquets entamés — et a été réécrite.

      **Conséquence, confirmée** : en régime normal le signal ne vient plus du
      placard mais du **dépôt**, c'est-à-dire de l'horloge de T54–T55.

      ⚠ **CE QUE ÇA NE FERME PAS.** Le vrai axe n'est pas l'état, c'est
      l'ubiquité. Le mesurer demanderait de comparer *ce qu'on a* à *ce qu'un
      plat prend*, et le relevé ne porte pas les quantités du frais
      (`par_unite: null`). L'état est le meilleur proxy disponible ; il coûte une
      courgette fraîche qui, elle, mériterait d'être payée — et on la perdra sans
      le voir jusqu'à ce que les quantités existent.

### Trouvé en marge de #50, et corrigé au passage

**UN PLAT SANS ÉTAPES NE POUVAIT JAMAIS ÊTRE TERMINÉ.** « Terminer » est le seul
endroit de l'app où le stock descend, et il ne vivait que dans le mode guidé de
`Cuisiner.tsx` : les **15 plats du corpus sans `steps`** — la bolognaise, le
poulet rôti, la quiche aux poireaux, les lasagnes — s'ouvraient sur leur liste
d'ingrédients et **rien ne les journalisait jamais**. Un trou dans la promesse
centrale de T25–T32, resté invisible parce que le parcours e2e tirait toujours
une carte qui, elle, avait des étapes. Bouché : la fiche sans étapes porte le
même bouton « Terminer » et le même événement.

**ET LE PARCOURS `stock-descend` MENTAIT SUR CE DONT IL AVAIT BESOIN.** Il
affirmait tenir « quel que soit le plat que Poser a tiré » ; sa seconde promesse
— la confiance du placard se dépense — n'a de sens que si le plat **touche** le
garde-manger, ce que **24 des 86 plats** ne font pas. Il passait par un effet de
bord du classement : l'ancien bonus placard remontait les plats à oignon en tête
de la main. T60 ayant cessé de payer l'oignon, il a tiré une quiche aux poireaux
et il est tombé. `poserUnPlat` prend désormais un filtre, dérivé du corpus et non
recopié à la main, et repioche jusqu'à trouver — un parcours qui dépend d'une
propriété doit la demander, sans quoi il teste la chance qu'il a eue.

**Les deux se sont vus le même jour, et pour la même raison** : changer un
classement change ce qu'un parcours traverse. C'est un argument pour garder ces
huit parcours, pas contre.

### Laissé ouvert par #50

- **Les barèmes de stérilisation.** Toutes les fenêtres ci-dessus sont posées à
  vue, comme `equilibre.yaml` avant elles — elles ne font que réordonner des
  dîners. Une exception délibérément non ouverte : `conservation.yaml` documente
  le risque *C. botulinum*, et là un mauvais nombre blesse quelqu'un plutôt
  qu'un classement. NCHFP est la référence nommée. Mais `bocal-sous-pression`
  est `acquis: false` — ça se lèvera avec l'autocuiseur, pas avant.

## Deux surfaces d'approvisionnement — [Workspace#44](https://github.com/chapellu/Workspace/issues/44)

**Le partage n'est pas entre canaux, il est entre la demande planifiée et
l'approvisionnement tout court.** Le ticket demandait « deux surfaces de
courses », la réserve et le frais ; la proposition a été **refusée** :

> *« I think we need to differentiate the ceremony that choose menu and the
> ingredients list that is generated from the rest. The fact that I go to casier
> or a grocery not planned just fill the stock. You are not the only input of it
> et c'est pour ça que j'ai insisté pour consommer le stock d'abord. »*

La cérémonie pose des créneaux, les créneaux font la liste. **Tout le reste est
de l'approvisionnement** — le casier, une épicerie non prévue, le panier vert,
le marché quand rien n'était planifié : *« ça remplit juste le stock »*. Un
canal est un endroit où l'on va, jamais un écran de l'app.

**Et le test permanent que ce ticket ajoute au principe directeur** :
*« encourager une meilleure alimentation, pas augmenter drastiquement ma
consommation ni exploser mon budget »*. **Un mécanisme qui fait monter ce qu'on
achète ou ce qu'on mange a échoué, même s'il est par ailleurs juste.**

### Ce que #44 corrige dans les tickets déjà posés

- **T53 tombe.** Le récapitulatif à deux canaux — *le frais* contre *la
  réserve* — était hérité : #45 ne l'avait pas tranché sur ses propres preuves,
  il le tenait des notes de Workspace#41, qui le tenaient de Workspace#35.
  L'utilisateur : *« as we have not yet integrated channels keep stuff
  simple »*. **Une seule liste, dans `rayons.ordre`, comme aujourd'hui.** La
  seule section qui survit est la **réserve** (T61) et c'est une section par
  *raison*, pas par canal ; qu'elle soit surtout de l'épicerie est une
  coïncidence.
- **T27 se défait, et c'est du code en production.** Rentrer une course crée
  aujourd'hui un lot (`courses.rentrer()` → `entrerAuStock()` → événement
  `entree`) : c'est T25–T32, mergé. La liste redevient un **aide-mémoire** qui
  ne touche plus au stock. **Ordre imposé : T63 avant T62**, sinon l'app se
  retrouve sans aucun moyen de faire entrer de la nourriture.
- **T56 est exaucé.** Il disait « une date par lot, et aucun écran pour la
  saisir — elle n'arrivera que gratuitement ». L'entrée EST cet écran, et la
  date y est effectivement gratuite : les pastilles donnent aujourd'hui, un
  ticket porte sa propre date d'achat.

- [ ] **T61 — La liste n'existe que s'il y a un plan.** Pas de vue permanente
      « ce qui aiderait » à consulter avant de sortir : c'est un écran de
      suggestions d'achat sans repas derrière, exactement la forme qui fait
      grossir un budget. Dans un rayon, la seule aide honnête est *« voilà ce que
      tu as déjà »* — l'inventaire, déjà construit.

      **Les planchers achètent, mais dans cette liste-là**, en une section
      **réserve**. #43 avait tranché que « ces planchers sont sous leur niveau »
      *est* la liste Carrefour ; ce qu'ils n'obtiennent pas, c'est un écran à
      eux. Ce qui leur fait passer le test du budget est un nombre, pas une
      préférence : le `niveau de réappro` de T45 est dérivé de **ce qui a
      réellement été consommé entre deux grosses courses**. Une ligne de plancher
      ne peut donc que restituer ce qui a été mangé — elle est structurellement
      incapable de faire grossir le placard. Un plan qui ne manque de rien mais
      laisse quatre denrées sous leur plancher donne une liste réduite à cette
      seule section : c'est normal, un plan a eu lieu.

- [ ] **T62 — La liste ne touche plus le stock.** *« The list is an help for
      grocery, what actually restock is the scanning of the tickets or
      articles. »* `courses.rentrer()` et `rentrerLesCoches()` cessent d'appeler
      `entrerAuStock()` ; **seule une entrée crée un lot**. Le contrat de T27
      survit intact — le lot porte le poids que son canal lui a donné, le défaut
      par ingrédient reste dérivé du dernier poids vu — et il est même **mieux
      servi**, parce qu'un code-barres ou une ligne de ticket porte un vrai poids
      d'emballage là où la liste portait une estimation tirée d'une recette.

      Conséquence : `coché` redevient de l'ergonomie de magasin sans aucun sens
      pour le stock, et comme la liste n'existe que tant qu'un plan existe, **il
      meurt avec elle**. La question des marques orphelines de T13 disparaît
      plutôt qu'elle n'est résolue. **Ne pas faire avant T63.**

- [ ] **T63 — L'entrée : un geste sur « L'inventaire », des pastilles.** Pas un
      quatrième onglet : l'inventaire est déjà *« le seul écran qui parle du
      dépôt lui-même »*, et une arrivée y voisine naturellement avec le relevé de
      T32 — même écran, même famille de verbes, tous deux disant « voilà ce
      qu'il y a ». Un onglet de plus annoncerait l'approvisionnement comme un
      mode de l'app, ce que T61 refuse.

      **Des pastilles** : une liste courte d'ids `primeur`, ordonnée par ce qui
      est plausible ce mois-ci et par ce qu'on a déjà reçu, **une pastille = un
      lot**, plus une **recherche**. Poids et prix en **champs optionnels** —
      *« simple to get started »*. C'est le chemin **principal du marché**, pas
      un repli : tout est dématérialisé sauf lui, et le seul ticket qu'il donne
      est le pire à lire (court, parfois manuscrit) alors qu'un retour de marché
      fait huit articles de primeur. Sert aussi au panier vert, au jardin et aux
      cadeaux.

- [ ] **T64 — La table apprise : un EAN et un libellé mènent au même id.** Un
      EAN est un nombre, une ligne de ticket est une chaîne, les deux doivent
      atteindre `pates` ou `tomates`. **Une seule table, deux clés.** Open Food
      Facts (ODbL) ne fait que pré-remplir marque, libellé et poids net pour que
      la question soit répondable : il ne connaît rien au vocabulaire du
      catalogue et n'en connaîtra jamais rien.

      **La première rencontre demande une fois** — « Panzani Torsades 500 g →
      c'est quoi ? » avec une liste courte — **et retient pour toujours**. L'EAN
      s'apparie exact ; le libellé s'apparie **flou**, parce que « TOMATES
      GRAPPE » devient « TOM GRAPPE VRAC » le mois suivant : un inconnu propose
      l'id confirmé le plus proche et demande un tap. **La table converge au lieu
      de grossir** — c'est la seule raison pour laquelle un ticket finit par
      battre la saisie. Sans réseau ou sans réponse d'OFF, on retombe sur les
      pastilles de T63.

- [ ] **T65 — L'import du ticket dématérialisé.** Tout est dématérialisé sauf le
      marché. La facture Drive de Carrefour est **lignée en EAN13** (Workspace#29)
      : c'est un **fichier**, donc ni OCR, ni caméra, ni serveur — la plus grosse
      course du mois rentre sans un seul scan. Le ticket de caisse dématérialisé
      en magasin relève du même chemin, à confirmer par Workspace#49.

- [ ] **T66 — Toute arrivée est datée, et le frais gagne enfin une horloge.**
      L'entrée pose la date d'arrivée et le lot atterrit **au garde-manger** ;
      pas de troisième magasin. C'est la date gratuite que T56 attendait : les
      pastilles donnent aujourd'hui, un ticket porte sa date d'achat — donc
      photographier un ticket et le traiter huit jours plus tard **ne fausse
      rien**.

      Ça ne rouvre pas #50, ça atteint la moitié qu'il ne pouvait pas atteindre :
      l'épicerie garde ses trois urgences projetées (T57), mais une arrivée
      périssable cesse d'être figée à une `urgence` dérivée de la zone, **qui ne
      peut pas décroître** — sans quoi l'app crie en mars à propos d'un poireau
      arrivé en septembre. Coût : une fenêtre de vie sur les ~57 ids `primeur`,
      par la méthode propose-puis-valide des `apports`. **Et l'en-tête de
      `garde-manger.yaml` se corrige** : il ne porte plus seulement du « non
      périssable à l'échelle de la semaine » — c'était déjà faux avec les pommes
      de terre sous l'évier.

- [ ] **T67 — Le mode de décrément suit la classe, pas le nombre.** T28 choisit
      le mode selon qu'un chiffre existe. Donnez-lui « TOMATES 1,240 kg » et il
      se met à retrancher des grammes de recette à vos tomates : de la
      comptabilité au gramme, que Workspace#41 exclut, obtenue par la porte de
      derrière.

      **La précision suit le canal, pas le rayon** : quand un canal pèse, on le
      croit (ce qui assouplit « les fruits & légumes ne sont jamais estimés » de
      T30) ; quand il ne pèse pas, `par_unite: null` comme avant. Mais
      *« I will always use full tomatoes not exact weight »*, donc **deux
      nombres, deux métiers** : le **poids** sert à l'historique de prix (T68) et
      au registre de ce qui est entré, **il ne pilote jamais un décrément** ; la
      **quantité de stock** du primeur est ce que l'œil compte — des unités
      entières, ou l'`etat` quand personne ne compte.

- [ ] **T68 — L'historique de prix au kilo, enregistré tout de suite, exploité
      par rien.** Un ticket est le seul objet de tout ce modèle qui sache ce que
      les choses coûtent. **On enregistre le prix sur le lot ; on ne score jamais
      dessus** — scorer le prix ferait choisir la nourriture bon marché contre la
      bonne, ce qui rate l'autre moitié du brief.

      L'objet demandé est un **historique par ingrédient et par unité** — une
      série en €/kg — et **pas** un coût par plat : *« more as an help for future
      grocery to follow prices like how much cost a kilo of tomatoes and when it
      is a good deal »*. C'est un sous-produit d'un chemin qu'on construit de
      toute façon, et il ne se reconstitue pas après coup : on le capture dès le
      premier jour. T67 est ce qui le rend possible — sans poids, pas de €/kg.

- [ ] **T69 — Une entrée n'ajoute que ; elle ne dit jamais « c'est tout ».**
      *« You are not the only input of it. »* Seul le relevé par zone (T32) peut
      affirmer une absence. Six articles scannés sur vingt, c'est une course
      à moitié connue : le reste ressort en confiance qui baisse et en questions
      à la proposition, **jamais en zéro faux**. C'est ce qui garde l'app fausse
      du bon côté — elle demande au lieu d'acheter. Une ligne analysée qui ne
      s'apparie à rien et qu'on n'enseigne pas est un **no-op déclaré** : compté,
      montré, sans lot inventé (T28).

- [ ] **T70 — Après une entrée, l'app se tait.** Aucune re-proposition, aucune
      notification, aucune cérémonie poussée — Workspace#41 l'exclut et une
      relance trois jours plus tard est exactement ça. L'écran de revue se termine
      sur **une ligne qu'on peut ignorer**, et il n'y a **jamais de seconde
      sollicitation**. La vraie réaction est invisible et c'est la bonne : les
      nouveaux lots portent une horloge (T66), donc la passe suivante du rail
      propose autour d'eux toute seule.

- [ ] **T71 — Le lecteur de ticket photographié. Serveur, et pas urgent.** Le
      filet de sécurité quand un magasin ne dématérialise pas. L'app n'a pas de
      back-end, mais vm-main fait tourner un cluster k8s avec Flux et des secrets
      SOPS-age : c'est un coût, pas une impossibilité — *« it can be the first
      server side component but nothing urgent »*. Ce qui le porte est la
      justesse : un écran de revue plein de « TOMAT » déplace le travail au lieu
      de l'économiser.

      **Rien n'est urgent dans le temps** : *« I can take the picture of my
      receipt whenever and wherever I want and always process it when I have
      internet »*. La photo se prend hors ligne en un tap, l'analyse attend le
      réseau — et T66 fait que la date reste juste. **Quoi qu'il lise le ticket,
      sa sortie atterrit dans un écran de revue : elle est proposée, jamais
      crue.**

### Laissé ouvert par #44

- **Le signal « bonne affaire ».** T68 enregistre sans exploiter, et c'est
  délibéré : juger un bon prix demande une référence que seuls quelques mois de
  tickets du foyer peuvent fournir, plus une courbe saisonnière par-dessus. En
  inventer une maintenant donnerait un nombre sûr de lui avec rien derrière.
  *« Start recording data now and the exploitation will come later. »*
- **Le panier vert.** Mis sur le chemin des pastilles **parce qu'**il est prépayé
  et peut ne rien remettre de lisible — mais *« I hope to have a paper with the
  details of what is inside but I'm not sure »*. Parti en recherche sur
  Workspace#49 ; si un papier existe, ce canal change de chemin.
- **Les fenêtres de vie du primeur elles-mêmes.** T66 en a besoin sur ~57 ids :
  même problème que les `apports`, et même goulot — c'est du jugement, pas de
  l'extraction.

## Le chargeur cesse de jeter — [Workspace#41](https://github.com/chapellu/Workspace/issues/41), écart de port n° 2

**L'export est plus riche que l'app, et l'app jette la différence en un seul
endroit.** Le premier écart de port était celui des cinq réglages parsés et
jamais lus (#43, #45, #50) ; celui-ci est de la même espèce mais il se voit à
l'usage, et c'est l'utilisateur qui l'a trouvé en cuisinant, pas un test :

> *« J'ai fait les lentilles et si j'avais suivi bêtement les étapes j'aurais
> attendu 30 minutes que les lentilles soient cuites avant de faire cuire les
> carottes et la quantité à préparer n'est pas affiché dans l'écran. »*

`lentilles-mijotees` porte pourtant `parallel_with: lancer-mijotage` sur l'étape
des carottes, et le texte de l'étape commence par *« Pendant le mijotage : »*.
Le champ est écrit à la main, **validé** par `verifier.py:74`, lu par
`compile.py:304`, exclu de la somme des gestes par `anticipation.py:188`,
exporté sous `enParallele` par `export_json.py:149` — et `Etape` dans
`src/model/types.ts` ne le déclare pas. Le guide a donc fait attendre un temps
que sa propre donnée disait de ne pas attendre.

La mesure, sur les **419 étapes** de `public/cuisine-data.json` :

| Champ exporté | Étapes | Ce que c'est | Lu par l'app |
|---|---|---|---|
| `uses` | **126** | les ids d'ingrédients qu'une étape consomme — donc la quantité de l'étape, une fois mise à l'échelle | non |
| `enParallele` | **42** | l'étape avec laquelle celle-ci tourne | non |
| `attente` / `attenteRaison` | **30** | du temps mort qui a une raison — trempage 720 min, prise au frais 240, repos 10 | non |
| `rattrapage` | **6** | le repli quand l'anticipation a été manquée, avec son `cout_min` et son `effet` honnête | non |

**CE BLOC NE DESSINE RIEN.** Il n'ajoute pas une ligne à l'écran de cuisine, et
c'est sa seule raison de pouvoir être pris maintenant : *comment* montrer deux
étapes simultanées, où mettre la quantité d'une étape et quoi faire d'un
trempage de douze heures sont trois questions ouvertes sur
[Workspace#57](https://github.com/chapellu/Workspace/issues/57) et
[#58](https://github.com/chapellu/Workspace/issues/58). Aucune d'elles ne peut
être répondue par un écran qui n'a pas la donnée. On rend donc la donnée
disponible et testée, et les écrans suivent quand la carte a tranché — le même
ordre que T46 avant T42–T45.

- [ ] **T72 — Le modèle d'étape retrouve ses quatre champs.** `Etape` déclare
      `uses`, `enParallele`, `attente`, `attenteRaison`, `attenteSouple` et
      `rattrapage` ; `chargerEtape` les lit. Rien d'autre ne change.

      **Pas d'union, et c'est la règle du fichier qui le dit** : *« UNE UNION EST
      UNE PROMESSE QUE L'EXPORT NE CHANGERA PAS »*, donc on n'en fait que là où
      le code BRANCHE sur la valeur. `attenteRaison` (`trempage`,
      `refroidissement`, `prise-au-frais`, `repos`) reste `string` — le jour où
      le corpus en gagne une cinquième, l'app doit l'afficher, pas planter.
      `rattrapage` est un objet, pas une chaîne : `{action, coutMin, effet}`.

      **`uses` garde son nom anglais.** Tout le reste du modèle miroite la clé
      JSON (`porteAssaisonnement`, `enfantDes`) et renommer ici en `consomme`
      ferait de cette ligne la seule à mentir sur sa source. Le coût est une
      incohérence de langue déjà présente dans l'export ; le corriger est un
      geste de corpus, pas de chargeur.

      **Une promesse à tenir par un test, et une seule qui vaille :**
      `enParallele` **désigne une étape du même plat, et une étape antérieure**.
      `verifier.py` le garantit à l'écriture, mais rien ne le garantit à la
      lecture, et une référence pendante casserait silencieusement le premier
      écran qui s'en sert — c'est-à-dire pas celui-ci, donc personne ne le
      verrait. Le test balaie les 86 plats et résout les 42 références. Deuxième
      promesse, du même genre bon marché : chaque id de `uses` existe dans les
      `ingredients` du plat.

      Mesurer AVANT d'écrire le compte dans le test : les 126 / 42 / 30 / 6
      ci-dessus viennent de `public/cuisine-data.json` au 2026-09-12 et
      bougeront dès que #47 dictera les 15 plats du répertoire. Un test qui
      **imprime** les tailles à côté de ses promesses vieillit mieux qu'un test
      qui les code en dur.

- [ ] **T73 — La provenance traverse l'export, et se lit sur la fiche.**
      *« L'origine je parlait de la provenance (auteur, ouvrage, url) »*
      (2026-09-12,
      [Workspace#56](https://github.com/chapellu/Workspace/issues/56)). Le
      `source:` des recettes n'est **pas exporté du tout** : c'est le seul champ
      de ce bloc qui manque des deux côtés.

      Mesuré : **65 plats sur 86 portent un `source:`**, et les 21 autres sont
      exactement les plats du foyer — les 15 de `_repertoire.yaml` plus
      `gratin-de-pates-tomates`, `lentilles-mijotees`, `omelette-courgettes`,
      `ratatouille-minute`, `reste-de-la-veille`, `veloute-de-courgettes`.
      Sur les 65 : `author` 65, `work` 65, `encoding` 65, `source_id` 64,
      `saison` 64, `page` 60, `url` **5**.

      **`work` est déjà une phrase affichable, page comprise** — *« La cuisine
      bio du quotidien, Terre vivante, p. 116 »*. Donc pas de gabarit à
      composer : `author` + `work`, et l'`url` quand elle existe. `page` reste
      structuré et non affiché — il double `work`.

      **Les 21 plats du foyer disent « recette du foyer »**, ils ne se taisent
      pas. Le silence se lirait comme une donnée manquante alors que c'est une
      réponse : ces plats n'ont pas de source parce qu'ils sont à nous. (Retenu
      contre l'autre option — ne rien afficher — parce qu'un champ vide sur un
      quart du catalogue ressemble à un bug.)

      **CRÉDITER N'EST PAS REPUBLIER, et c'est ce qui autorise ce ticket.** Le
      cadre de Workspace#26 interdit de recopier la prose et les photos, jamais
      de nommer l'auteur ; les 65 recettes portent d'ailleurs chacune la trace
      de leur conformité dans `encoding: re-worded structured steps; no original
      prose or photos`. Les 5 `url` pointent là où #26 a délibérément laissé la
      prose — *« les étapes restent donc à leur place — sur le blog, derrière le
      champ `url` »* : y renvoyer est le comportement voulu.

      **`saison` arrive gratuitement avec le bloc, et ne doit rien piloter.**
      64 valeurs entrent dans le modèle ; Workspace#41 a tranché que la
      saisonnalité roule sur le plancher (#43) et pas sur la planification. Donc
      un no-op **déclaré** : parsé, jamais lu par le score. L'écrire en
      commentaire, sinon le prochain lecteur le branchera en croyant bien faire.

      **La porte qui mord ici : `catalogue:verifie`.** Toucher
      `export_json.py` oblige à régénérer `public/cuisine-data.json` **et à le
      committer** — la porte compare au JSON commité, et elle rougit jusque-là.
      Ce n'est pas une panne.

- [ ] **T74 — La vaisselle du plat, en tête de fiche.** *« J'aimerai bien aussi
      que tu m'indique quel outil utiliser et de quelle taille. »* La moitié de
      la réponse est déjà calculée et jamais montrée : `plat.vaisselle` est
      résolu sur **44 plats sur 86**, avec la taille dans le libellé —
      `sauteuse 28 cm` (30), `cocotte 7,5 L` (12),
      `casseroles 2,6 L / 1,6 L` (2).

      Aujourd'hui l'écran montre `chauffeDe()` à la place, qui écrase `needs` en
      un niveau de feu et **jette l'ustensile** : `simmer-large` devient « Feu
      vif » et la cocotte de 7,5 L que ça désigne disparaît.

      Une ligne « à sortir avant de commencer », sur la fiche et non sur
      l'étape. **Ça ne préjuge pas de
      [Workspace#57](https://github.com/chapellu/Workspace/issues/57) ni de
      [#59](https://github.com/chapellu/Workspace/issues/59)** : l'outil *par
      étape* demande une règle de résolution (quel ustensile quand trois
      portent la même capacité, et lequel selon la taille du lot) et cette
      règle n'est pas tranchée. Le `vaisselle` du plat, lui, est déjà résolu par
      le compilateur — on l'affiche, on ne le calcule pas.

      **À MESURER AVANT D'ÉCRIRE UNE PHRASE SUR `facteurMax`** : la fiche dit
      déjà *« on en cuisine M »*, et `vaisselle.facteurMax` dit à partir de quel
      facteur le lot ne tient plus dans le récipient. Avant d'ajouter un
      avertissement, chercher **qui lit déjà `facteurMax`** — si `calcul.ts`
      plafonne l'échelle en amont, le cas ne peut pas se produire et la phrase
      serait un ornement. Le dépôt s'est déjà trompé quatre fois en croyant un
      commentaire plutôt que le code.

      Les 42 plats sans `vaisselle` ne montrent rien. Silence délibéré, pas
      oubli : le compilateur n'a pas trouvé d'ustensile à nommer, et en inventer
      un serait pire que se taire.

### Laissé ouvert par ce bloc

- **Tout l'affichage du modèle d'étape.** T72 rend `uses`, `enParallele`,
  `attente` et `rattrapage` lisibles par l'app et n'en montre aucun. Le guide
  reste un curseur linéaire qui additionne des minutes superposées : sur
  `lentilles-mijotees`, trois étapes de 30 + 15 + 2 face à un plat déclaré à
  40 min dont 10 actives, donc un « reste 47 min » faux. C'est Workspace#57.
- **La quantité par étape**, qui est `uses` × le facteur que l'écran tient déjà.
  Workspace#58 doit d'abord dire si elle s'affiche toujours ou à la demande —
  la thèse de l'écran est que *« tout ce qui n'est pas l'étape en cours est du
  bruit »*, et la quantité, elle, **est** l'étape en cours.
- **L'outil par étape**, gaté sur la règle de résolution de Workspace#59.
- **L'alarme du minuteur.** Zéro occurrence de son, de vibration ou de
  notification dans tout `src/` : elle n'a jamais été câblée. Le modèle du
  minuteur est sain — une échéance, pas un compteur, précisément pour survivre
  à un téléphone verrouillé — seul l'avertissement manque, et ce qu'un PWA peut
  faire écran verrouillé se mesure sur le téléphone avant de se promettre :
  Workspace#61.
- **La validation d'une cuisson sans créneau**, qui est la cause du stock qui ne
  descend pas et qui touche au modèle, pas au chargeur : Workspace#60.

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
