#!/usr/bin/env python3
"""Extrait les recettes du blog Saines Gourmandises vers un JSON intermédiaire.

Le blog court sur une quinzaine d'années et a traversé deux générations de
markup WordPress : les articles récents utilisent les blocs Gutenberg
(`<ul class="wp-block-list">`), les anciens des `<p>` dont les lignes sont
séparées par des `<br/>` et coloriées à la main. Parser le HTML par sélecteurs
demanderait donc deux extracteurs ; on aplatit plutôt le corps de l'article en
LIGNES DE TEXTE, et on raisonne sur leur forme, ce qui marche pour les deux.

La structure commune, elle, est stable :

    …prose d'introduction…
    Ingrédients pour N personnes
    Préparation : X min   /   Cuisson : Y min   /   Repos : 1H
    <lignes courtes>          ← les ingrédients
    <lignes longues>          ← les étapes

CE QUE CE SCRIPT NE FAIT PAS, ET NE DOIT PAS FAIRE : deviner les `apports`
(protéine, féculent, familles de légumes, profil). C'est du jugement, pas de
l'extraction, et l'inventer à l'échelle produirait exactement ce que le
répertoire de départ se reproche à lui-même. Les recettes sortent sans
`apports` ; c'est le travail qui reste à faire à la main.
"""

import html
import json
import pathlib
import re
import sys

RACINE = pathlib.Path(__file__).parent
HTML = RACINE / "html"

RE_ENTETE = re.compile(r'^\s*ingr[ée]dients\b', re.I)
RE_PERSONNES = re.compile(
    r'pour\s+(?:environ\s+)?(\d+)\s*(?:[àa/-]\s*\d+\s*)?(personnes?|parts?|pièces?|'
    r'gaufres?|cr[êe]pes?|biscuits?|muffins?|falafels?|croquettes?|bocaux|pots?)', re.I)
RE_PREP = re.compile(r'pr[ée]paration\s*:?\s*(?:environ\s*)?(\d+)(?:\s*[àa]\s*\d+)?\s*(?:min|mn)', re.I)
RE_CUISSON = re.compile(r'cuisson\s*:?\s*(?:environ\s*)?(\d+)\s*(min|mn|h)\b', re.I)
RE_ATTENTE = re.compile(
    r'(repos|attente|r[ée]frig[ée]ration|cong[ée]lation|trempage|pousse|marinade|'
    r'prise au frais|s[ée]chage)[^:]{0,25}:?\s*(?:environ\s*)?(\d+)\s*(h|min|mn|jours?|nuits?)',
    re.I)

BRUIT = re.compile(
    r'(partager|facebook|pinterest|instagram|newsletter|abonn|commentaire|'
    r'copyright|©|tous droits|cliquez ici|lire la suite|voir la recette|'
    r'soutenir|se connecter|mon blog jardin|mon site pro|aller au contenu)', re.I)

# Fin de l'article : au-delà, ce sont les encarts partenaires, la navigation
# entre billets et le formulaire de commentaires. Sans cette coupure, le
# décompte d'étapes gonfle de quinze lignes de promo sur chaque recette.
FIN_ARTICLE = re.compile(
    r'(pr[ée]c[ée]dent\s*voir l.article|voir l.article plus (ancien|r[ée]cent)|'
    r'n.en perdez pas une miette|votre adresse mail|profitez de codes|'
    r'avec le code |cuisine bio, sant[ée] naturelle|<div id="respond"|'
    r'pour le fameux|cercles inox|programme de remise en forme)', re.I)


def lignes_du_corps(page: str) -> list[str]:
    """Corps de l'article, aplati en lignes de texte propres."""
    i = page.find("theme-post-content")
    if i < 0:
        return []
    body = page[i:]
    for fin in ("elementor-location-footer", "comment-respond", "<footer"):
        j = body.find(fin)
        if j > 0:
            body = body[:j]
    body = re.sub(r'<(script|style|figure|figcaption).*?</\1>', ' ', body, flags=re.S)
    # Tout ce qui sépare visuellement devient un saut de ligne.
    body = re.sub(r'<br\s*/?>|</p>|</li>|</h[1-6]>|</div>', '\n', body, flags=re.I)
    body = re.sub(r'<[^>]+>', '', body)
    body = html.unescape(body).replace('\xa0', ' ').replace('’', "'")
    out = []
    for ligne in body.split('\n'):
        ligne = re.sub(r'\s+', ' ', ligne).strip(' —–-–')
        if ligne and not BRUIT.search(ligne):
            out.append(ligne)
    return out


VERBE_INSTRUCTION = re.compile(
    r'^(Mettre|Mélanger|Melanger|Verser|Ajouter|Faire|Couper|Découper|Decouper|Éplucher|'
    r'Eplucher|Laisser|Porter|Cuire|Enfourner|Préchauffer|Prechauffer|Servir|Déposer|'
    r'Deposer|Battre|Fouetter|Mixer|Réserver|Reserver|Égoutter|Egoutter|Disposer|Saler|'
    r'Poivrer|Retirer|Remuer|Étaler|Etaler|Garnir|Rincer|Peler|Émincer|Emincer|Hacher|'
    r'Incorporer|Chauffer|Badigeonner|Répartir|Repartir|Fondre|Monter|Tailler|Brasser|'
    r'Façonner|Faconner|Rouler|Trancher|Arroser|Parsemer|Napper|Filtrer|Presser|Malaxer|'
    r'Pétrir|Petrir|Dresser|Assaisonner|Goûter|Gouter|Sortir|Commencer|Terminer|Finir|'
    r'Dans un|Dans une|Dans le|Dans la|Pendant|Puis|Ensuite|Au bout|Quand|Lorsque|'
    r'La veille|Le lendemain|Environ|Une fois|Après|Apres|Avant de|Il (?:faut|suffit)|'
    r'On (?:peut|met|verse|ajoute))\b', re.I)

# Sous-titres d'une liste d'ingrédients : « Pour la pâte : », « Pour la garniture »…
SOUS_TITRE = re.compile(r'^pour (la|le|les|l\'|une?|environ)\b.{0,60}:?\s*$', re.I)


def est_instruction(ligne: str) -> bool:
    """Reconnaît une étape à son verbe d'attaque, pas à sa longueur.

    C'est le point qui décide de tout : une ligne d'ingrédient peut être longue
    (« 50g de sucre de bouleau (ou à défaut, de sucre blond, cela remonte un peu
    l'IG…) ») et une instruction peut être courte (« Réserver. »). Couper sur la
    longueur mélangeait les deux dans les deux sens.
    """
    if SOUS_TITRE.match(ligne):
        return False
    return bool(VERBE_INSTRUCTION.match(ligne)) or ligne.count('.') >= 2


def extraire(slug: str, page: str) -> dict | None:
    lignes = lignes_du_corps(page)
    if not lignes:
        return None

    # Repère l'en-tête « Ingrédients … ».
    idx = next((k for k, l in enumerate(lignes) if RE_ENTETE.match(l)), None)
    if idx is None:
        return None

    # Le bloc d'en-tête : la ligne « Ingrédients » et les 4 suivantes portent
    # les temps (préparation / cuisson / repos), sur une ou plusieurs lignes.
    entete = " | ".join(lignes[idx:idx + 5])
    m = RE_PERSONNES.search(entete) or RE_PERSONNES.search(lignes[idx])
    personnes, unite_rendement = (int(m.group(1)), m.group(2).lower()) if m else (None, None)
    m = RE_PREP.search(entete)
    prep = int(m.group(1)) if m else None
    m = RE_CUISSON.search(entete)
    cuisson = int(m.group(1)) * (60 if m and m.group(2).lower() == 'h' else 1) if m else None
    attentes = [f"{a} {b} {c}" for a, b, c in RE_ATTENTE.findall(entete)]

    # Après l'en-tête : les lignes courtes sont les ingrédients, la première
    # ligne longue ouvre les étapes.
    ingredients, etapes, dans_etapes = [], [], False
    for ligne in lignes[idx + 1:]:
        if RE_PREP.match(ligne) or RE_CUISSON.match(ligne) or RE_ATTENTE.match(ligne):
            continue
        if RE_ENTETE.match(ligne):
            continue
        if not dans_etapes:
            if not est_instruction(ligne):
                if len(ligne) > 2:
                    ingredients.append(ligne)
                continue
            dans_etapes = True
        if FIN_ARTICLE.search(ligne):
            break
        if len(ligne) >= 20:
            etapes.append(ligne)
        if len(etapes) >= 30:
            break

    if len(ingredients) < 3:
        return None

    # LE TITRE EST LE POINT FAIBLE, ET C'EST STRUCTUREL.
    # Un livre de cuisine nomme ses plats ; un blog personnel les raconte. Les
    # titres d'articles ici sont des accroches — « Mais elles ne sont plus là ! »,
    # « Bon, et cette tarte au citron on en parle enfin ? » — et le nom du plat
    # n'apparaît souvent nulle part sous une forme isolable. On prend donc le
    # titre canonique de l'article (le seul qui soit un vrai titre et pas une
    # phrase attrapée au hasard avant la liste), et on marque l'entrée comme
    # étant à renommer à la main.
    titre = None
    m = re.search(r'<h1[^>]*>(.*?)</h1>', page, re.S)
    if m:
        titre = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', m.group(1)))).strip()
    if not titre:
        m = re.search(r'<title>(.*?)(?:\s*[–|-]\s*Saines)', page, re.S)
        titre = html.unescape(m.group(1)).strip() if m else slug.replace('-', ' ')
    titre = titre.strip(' «»"\'')

    # Une accroche se reconnaît : ponctuation expressive, pronom, question.
    titre_douteux = bool(
        re.search(r"[?!…]|\\b(je|j'|on|vous|nous|mes|mon|ma|ce|cette|ces|enfin|voici|voil\u00e0)\\b",
                  titre, re.I))

    return {
        "slug": slug,
        "url": f"https://saines-gourmandises.fr/{slug}/",
        "titre": titre,
        "titre_a_revoir": titre_douteux,
        "personnes": personnes,
        "unite_rendement": unite_rendement,
        "prep_min": prep,
        "cuisson_min": cuisson,
        "attentes": attentes,
        "ingredients": ingredients,
        "etapes": etapes,
    }


def main() -> int:
    out, rejets = [], []
    for f in sorted(HTML.glob("*.html")):
        page = f.read_text(encoding="utf-8", errors="replace")
        r = extraire(f.stem, page)
        (out if r else rejets).append(r or f.stem)

    (RACINE / "recettes.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    (RACINE / "rejets.txt").write_text("\n".join(rejets), encoding="utf-8")

    exploitables = [r for r in out if r["personnes"] and len(r["etapes"]) >= 2]
    print(f"{len(out)} recettes extraites sur {len(out) + len(rejets)} articles")
    print(f"  rendement connu        : {sum(1 for r in out if r['personnes'])}")
    print(f"  temps de préparation   : {sum(1 for r in out if r['prep_min'])}")
    print(f"  temps de cuisson       : {sum(1 for r in out if r['cuisson_min'])}")
    print(f"  au moins 2 étapes      : {sum(1 for r in out if len(r['etapes']) >= 2)}")
    print(f"  → exploitables         : {len(exploitables)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Aspiration : le sitemap WordPress liste 399 articles.
#   curl -s https://saines-gourmandises.fr/wp-sitemap-posts-post-1.xml
#   → un GET par article, 3 en parallèle, 0,4 s entre les lots.
#   robots.txt (14/08/2026) n'interdit que /wp-admin/.
