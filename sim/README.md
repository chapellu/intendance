# Une année simulée

Une année de cuisine menée par l'app, au doigt, contre le build de production —
pour voir ce que le stock devient sur 365 jours, pas sur un parcours.

```
npm run build && npx vite preview --port 4193 --strictPort &
PROFILE=/tmp/profil OUT=/tmp/annee node sim/vider.mjs   # jour 0 : les deux lots retirés, les sept zones relevées à zéro
PROFILE=/tmp/profil OUT=/tmp/annee node sim/annee.mjs 365
python3 sim/bilan.py /tmp/annee > bilan.json
```

`annee.mjs` reprend où il s'est arrêté (`etat.json`). Le monde réel — ce qu'il
y a VRAIMENT au frigo — est tenu à côté de l'app, et c'est une approximation :
une boîte de reste vaut deux parts, le frais tourne à sept jours.

`PERSONA=moi` (T142) mange quatre fois par jour : le petit-déjeuner et le
goûter des enfants (les recettes des routines, prises au grand livre ; un
manque se note `petit-dej` / `gouter`), le midi des quatre (le reste mis de
côté au dîner, sinon un reste du frigo, sinon la ligne « Midi : … (Chioca) »
cuisinée si la cuisine a tout, sinon sandwich hors app), la fournée de 15 h
quand le cockpit la propose, et le frais `hebdo` complété le samedi. Une ligne
« N repas » vaut un midi des quatre (ou un goûter, un matin pour la fournée et
le pain). `JOURS=30` arrête tôt ; `OUT/conso.json` donne la consommation de
l'année par ingrédient et par repas (dîner, midi, petit-déj, goûter).
