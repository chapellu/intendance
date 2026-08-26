#!/usr/bin/env python3
"""Transforme l'extraction JSON en index de source YAML pour le catalogue.

CE QUI EST REPRIS ET CE QUI NE L'EST PAS — c'est la question qui décide de la
forme de ce fichier, et elle est tranchée par le cadre de licence de la carte
#26, déjà appliqué à l'ouvrage papier :

  REPRIS   titre, URL, rendement, temps, LISTE D'INGRÉDIENTS. Une liste de
           quantités est une donnée fonctionnelle — c'est du savoir-faire, pas
           de l'expression — et c'est exactement ce que les recettes déjà
           encodées depuis le livre contiennent.

  NON REPRIS  LES ÉTAPES. Chez Chioca les étapes sont de la prose, et de la
           bonne. Toutes les recettes du catalogue les ont vues REFORMULÉES au
           moment de l'encodage, jamais recopiées. Stocker ici 255 jeux de
           phrases verbatim reviendrait à republier le blog dans un dépôt git,
           ce que le cadre exclut. Les étapes restent donc à leur place — sur
           le blog, derrière le champ `url` — et se reformulent au moment où
           une entrée passe dans `recipes/`.

Les `apports` ne sont pas devinés non plus : c'est du jugement, et l'automatiser
produirait à l'échelle la faute que `_repertoire.yaml` se reproche déjà.
"""

import json
import pathlib
import re

RACINE = pathlib.Path(__file__).parent
SORTIE = RACINE / "saines-gourmandises-blog.yaml"


def q(s: str) -> str:
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


def main() -> None:
    recettes = json.load(open(RACINE / "recettes.json", encoding="utf-8"))
    recettes.sort(key=lambda r: r["titre"].lower())

    avec_rendement = sum(1 for r in recettes if r["personnes"])
    a_revoir = sum(1 for r in recettes if r["titre_a_revoir"])

    L = [
        "# " + "-" * 73,
        "# SOURCE — index du blog Saines Gourmandises (Marie Chioca).",
        "#",
        "# CE FICHIER N'EST PAS UN CATALOGUE, au même titre que l'index du livre :",
        "# il vit hors de `recipes/`, `charger_recettes()` ne le lit pas, et rien",
        "# n'entre au catalogue tant qu'une entrée n'a pas été reprise à la main.",
        "#",
        f"# Relevé automatique du sitemap WordPress : 399 articles parcourus,",
        f"# {len(recettes)} portent une liste d'ingrédients exploitable.",
        "#",
        "# CE QUI EST REPRIS ET CE QUI NE L'EST PAS (cadre de licence, carte #26) :",
        "#   repris      titre, URL, rendement, temps, liste d'ingrédients — données",
        "#               fonctionnelles, du même ordre que ce que les recettes déjà",
        "#               encodées depuis le livre contiennent ;",
        "#   NON repris  LES ÉTAPES. Ce sont ses phrases. Toutes les recettes du",
        "#               catalogue les ont vues reformulées à l'encodage, jamais",
        "#               recopiées ; stocker ici 255 jeux d'étapes verbatim",
        "#               reviendrait à republier le blog dans un dépôt git. Elles",
        "#               restent derrière le champ `url`.",
        "#",
        "# CE QUI MANQUE ET NE PEUT PAS ÊTRE AUTOMATISÉ :",
        f"#   - `apports` : aucun. C'est du jugement, pas de l'extraction.",
        f"#   - le titre : {a_revoir} entrées sur {len(recettes)} portent `titre_a_revoir: true`.",
        "#     Un livre nomme ses plats, un blog les raconte — « Mais elles ne sont",
        "#     plus là ! » est un titre d'article, pas un nom de recette. Ces",
        "#     entrées-là demandent d'ouvrir la page pour nommer le plat.",
        f"#   - le rendement : connu pour {avec_rendement} entrées seulement.",
        "# " + "-" * 73,
        "",
        "source:",
        "  id: saines-gourmandises-blog",
        "  type: blog",
        "  author: Marie Chioca",
        "  title: Saines Gourmandises",
        "  url: https://saines-gourmandises.fr/",
        "  lang: fr",
        "  releve: sitemap WordPress, 2026-08-14",
        "  encodage: >-",
        "    titre, URL, rendement, temps et ingrédients. Étapes NON reprises :",
        "    elles se reformulent au moment de passer une entrée dans recipes/.",
        "",
        "recettes:",
    ]

    for r in recettes:
        L.append(f"  - slug: {r['slug']}")
        L.append(f"    titre: {q(r['titre'])}")
        if r["titre_a_revoir"]:
            L.append("    titre_a_revoir: true")
        L.append(f"    url: {r['url']}")
        if r["personnes"]:
            L.append(f"    rendement: {{n: {r['personnes']}, unite: {r['unite_rendement']}}}")
        if r["prep_min"]:
            L.append(f"    prep_min: {r['prep_min']}")
        if r["cuisson_min"]:
            L.append(f"    cuisson_min: {r['cuisson_min']}")
        if r["attentes"]:
            L.append(f"    attentes: [{', '.join(q(a) for a in r['attentes'])}]")
        L.append("    ingredients:")
        for i in r["ingredients"]:
            L.append(f"      - {q(i)}")
        L.append(f"    etapes_sur_le_blog: {len(r['etapes'])}")

    SORTIE.write_text("\n".join(L) + "\n", encoding="utf-8")
    print(f"{SORTIE} — {len(recettes)} entrées, {SORTIE.stat().st_size // 1024} Ko")


if __name__ == "__main__":
    main()
