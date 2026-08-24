# intendance.chapellu.fr — l'app, construite puis servie en statique.
#
# DEUX ÉTAGES, contrairement au prototype qui n'avait rien à construire. Le
# premier fabrique `dist/` ; le second ne contient QUE `dist/` — ni Node, ni
# `node_modules`, ni les sources. Une image de 60 Mo au lieu de 400, et surtout
# rien à exécuter côté serveur : ce qui sort d'ici est un tas de fichiers.
#
# `npm run build` TYPECHECK AVANT DE CONSTRUIRE (`tsc --noEmit && vite build`).
# Un code qui ne compile pas ne produit donc pas d'image du tout, plutôt qu'une
# image qu'on découvrirait cassée sur le téléphone.
FROM node:22-alpine AS build
WORKDIR /app
# Les dépendances d'abord, séparément : elles changent tous les deux mois quand
# le code change tous les jours, et cette couche-là se réutilise d'un build à
# l'autre.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
# LA COMPRESSION SE PAIE ICI, UNE FOIS, ET À FOND. Le nœud est un ARM à un
# cœur : lui faire recompresser 326 ko de JS à chaque première visite serait
# payer tous les jours ce qui se paie une fois. nginx sert le `.gz` tel quel
# (`gzip_static`). Rien pour les polices ni les PNG — déjà compressés, les
# regzipper les fait grossir.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \
      -o -name '*.json' -o -name '*.svg' -o -name '*.webmanifest' \) \
      -exec gzip -9 -k {} +

# nginx-unprivileged écoute sur 8080 et tourne en uid 101 : c'est ce qui
# satisfait le `runAsNonRoot` + `readOnlyRootFilesystem` du deployment sans
# configuration sur mesure. Même base que `proto-shell`, pour la même raison.
FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
