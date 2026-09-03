# PROTOTYPE — le rail de planification (Workspace#45)

**À jeter.** Cette branche (`proto/rail-45`) est la source primaire du ticket
[Workspace#45](https://github.com/chapellu/Workspace/issues/45) —
« Planning on demand: the rail, its horizon, its questions ». Rien ici n'a
vocation à entrer dans `main` tel quel : la variante retenue sera réécrite.

## Lancer

```sh
npm install
npm run dev
```

puis `http://localhost:5173/?variant=A#/cuisine/proto-rail`.

`←` / `→` changent de variante ; la barre noire en bas porte deux interrupteurs
et l'état complet du rail.

## Ce qui est vrai, ce qui est simulé

**Vrai** : le catalogue et ses 86 plats, la main de `scoring.main()` avec son
tirage pondéré et ses trois enseignes garanties, le panier de `calculer()`, le
placard rejoué par `journal.rejouer()` avec sa confiance à trois états, la
coquille et le design Organic.

**Simulé** : toutes les écritures. L'état du rail vit en mémoire et meurt au
rechargement — on doit pouvoir rejouer la cérémonie vingt fois pour la juger,
sans salir la semaine réelle.

**Fabriqué, et il faut savoir pourquoi** : le *journal de démo* (interrupteur
vert). Sur une base neuve le journal est vide, donc `depuisVu = 0` partout,
donc `confiance()` répond « sûr » sur tout le placard, donc le rail n'a
**aucune** question à poser — et l'axe le plus disputé du ticket devient
invisible. On fabrique donc six dîners sur les douze derniers jours, sans une
seule observation depuis le relevé du 26/08. C'est exactement ce que #42 a
décidé — le doute naît des cuissons non observées — et non une invention de
questions sans source. L'interrupteur permet de voir les deux mondes.

## Le second interrupteur

`taille 4 en dur` ↔ `taille 5 + cooldown 10 j` : la quatrième question du
ticket. Il agit sur les trois variantes à la fois, parce que c'est une question
orthogonale au dessin du rail. Le cooldown se lit sur le journal (le vrai plus
la démo) ; `historique.yaml` n'est pas exporté vers `cuisine-data.json`.

## Les trois variantes, et ce sur quoi elles ne sont pas d'accord

| | **A — Le fil** | **B — La pioche** | **C — Le plateau** |
|---|---|---|---|
| **L'horizon** | un nombre choisi d'avance (1/3/5/7/14) | aucun — émergent, on s'arrête quand on veut | une sélection de créneaux sur la grille |
| **Le mouvement** | linéaire, un pas à la fois, plein écran | pile : on distribue le suivant, le reçu s'empile au-dessus | libre : la grille reste, l'app *conseille* le plus contraint |
| **Le retour** | toucher un point de progression déjà franchi | toucher une ligne du reçu | inexistant — tout est toujours atteignable |
| **Les questions** | **un seul budget** : la question EST un pas du fil | **deux budgets** : bandeau au-dessus de la main, ne bloque rien | **troisième voie** : un tiroir « à préciser (N) », jamais de surgissement |
| **Le créneau non planifié** | un bouton « je ne planifie pas celui-là » | « Passer », qui ne revient pas | par construction : ce qu'on n'a pas retenu est hors du plan |

Les trois finissent sur le même récapitulatif à **deux canaux** (#41) : *le
frais* (marché, casier, panier — non choisi) et *la réserve* (Carrefour — sec,
boîte, congelé). C'est la seule chose qu'elles partagent avec la carte jouable,
parce que ni l'un ni l'autre n'est en jeu ici.

## Captures

`node proto-rail-shots.mjs` (dev server sur le port 5199) régénère
`/tmp/rail-*.png`.
