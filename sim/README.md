# Une année simulée

Une année de cuisine menée par l'app, au doigt, contre le build de production —
pour voir ce que le stock devient sur 365 jours, pas sur un parcours.

```
npm run build && npx vite preview --port 4193 --strictPort &
PROFILE=/tmp/profil OUT=/tmp/annee node sim/vider.mjs   # jour 0 : les deux lots retirés, les sept zones relevées à zéro
PERSONA=moi PROFILE=/tmp/profil OUT=/tmp/annee node sim/annee.mjs 365
python3 sim/bilan.py /tmp/annee > bilan.json
python3 sim/repas.py /tmp/annee [/tmp/annee2 …]        # les cinq repas, côte à côte
npx vite-node sim/croyance.ts /tmp/annee                # ce que l'app croit du fond, face à la cuisine
python3 sim/fond.py                                     # le fond mesuré au catalogue (sans navigateur)
```

`annee.mjs` reprend où il s'est arrêté (`etat.json`). Le monde réel — ce qu'il
y a VRAIMENT au frigo et au placard — est tenu à côté de l'app, et c'est une
approximation : une boîte de reste vaut deux parts, chaque denrée se tient dans
une seule unité (la première du corpus) et une recette qui la dit autrement se
convertit (`versBase` : « 300 g de poireau » ne vide pas un stock en pièces).

Variables : `PERSONA=moi` (le foyer sans semaine planifiée, décidé à 15 h),
`FLUX=passe` (l'autre chemin de décision), `SEED` (le hasard), `DEBUT`
(premier jour, `2026-10-16` par défaut — les routines ne comptent qu'à partir de
`creneaux.routines.depuis`), `URL` (le build visé).

## Le jour 0 : le fond posé, la cuisine pleine

Le foyer cuisine « au par » : un fond tenu, rechargé par la liste du mercredi et
du samedi. Au jour 0, « Suivre ces N essentiels » pose les planchers du fond d'un
doigt, et la cuisine réelle reçoit exactement ce que l'app suit désormais (« En
garder N » veut dire « j'en ai »), plus les deux bocaux de l'apéro, posés à la
main. **Un passage dont `notes.jsonl` dit « fond — pas de bouton » n'a pas de
fond : ses chiffres ne valent rien.**

## Les cinq repas, pour les quatre (`PERSONA=moi`)

- **petit-déjeuner** — la routine des enfants (`petit-dejeuner-des-enfants`) et
  une part de pain maison ; sans pain, un porridge pour les adultes ;
- **midi** — les restes du frigo pour les quatre (`partsDuMidi`) ; le week-end, le
  midi que le cockpit propose de cuisiner ; sinon une omelette, hors app ;
- **la fournée** — celle que « Ce soir » propose, faite le mercredi, le week-end,
  ou quand le pain manque ;
- **goûter** — la routine (`gouter-des-enfants`) et une part de la fournée ;
- **dîner** — la pause de 15 h, « Je lance ça » ; un repli (pâtes, gnocchis) se
  mange VRAIMENT au placard, et sans eux le soir est compté « RIEN » ;
- **dessert** — un soir sur deux à peu près, un yaourt ou un fruit pour trois ;
- **apéro** — le vendredi et le samedi de temps en temps, toujours avec des
  invités ; un bocal fini se dit « Fini » au stock.

Chaque dimanche, le journal de l'app et la cuisine réelle sont exportés
(`OUT/journal/<jour>.json`) ; `croyance.ts` rejoue le journal avec le code de
l'app et compte, denrée du fond par denrée du fond, ce qu'elle « croit à tort »
(au-dessus du plancher, la cuisine vide) et ce qu'elle « oublie ».
`journal-export.mjs <profil> <jour> <fichier>` sort le même journal d'un profil
arrêté, pour le rejouer à la main.
