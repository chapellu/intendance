#!/usr/bin/env python3
"""Catalogue integrity checks — run before trusting a newly entered recipe.

WHY THIS EXISTS. Entering the first ten Chioca recipes produced three silent
errors of the same kind: a `seasoning_gate` placed on a step that *creates* the
mixture as well as salting it, so the compiler printed the baby's set-aside
before the thing being set aside existed. Nothing failed — `compile.py` rendered
a plausible, wrong plan. At six recipes you catch that by reading the output. At
a hundred you do not.

Errors are things that will misrender or crash. Warnings are things that were
wrong every time so far but that a recipe could legitimately do — read them,
don't obey them blindly.

    python3 verifier.py            # whole catalogue
    python3 verifier.py <id> ...   # named recipes only
"""

import collections
import re
import sys
import unicodedata
from pathlib import Path

import anticipation as an
import catalogue
import chainage as ch
import compile as rc  # shadows the builtin `compile` in this module only
import fond as fd
import garde_manger as gm

HERE = Path(__file__).parent

BANDES = {"1-repas", "2-repas", "3-repas", "lunchbox"}
# Tout ce qu'une ligne d'ingrédient a le droit de porter. La liste est CLOSE
# exprès : c'est elle qui fait remonter les clés nées d'une virgule non quotée
# (voir le contrôle plus bas). Un nouveau champ s'ajoute ici en même temps que
# le code qui le lit.
CHAMPS_INGREDIENT = {"id", "name", "qty", "unit", "seasoning", "ref",
                     "from_accepts", "subs", "equivalences", "optional"}
# LES RÔLES — ce que ce plat est DANS un repas, et non ce qu'il contient.
#
# UNION FERMÉE, DÉFAUT `plat`. Cinq valeurs pour la seule question qui commande
# une décision : est-ce que ça fait un repas à soi seul ? `plat` répond oui,
# les quatre autres répondent non, chacune pour une raison différente — à côté,
# avant, dedans, dans un verre.
#
# `dessert` N'EN EST PAS UNE, ET C'EST DÉLIBÉRÉ. Le moment où un plat se mange
# est déjà dit par `creneaux:` (15 plats portent `[gouter, dessert]`), et deux
# champs qui portent la même information finissent par se contredire — le
# dépôt l'a payé une fois avec `espace` et `congelo`. Le rôle dit la PLACE dans
# le repas, `creneaux` dit le MOMENT dans la journée.
ROLES = {"plat", "accompagnement", "entree", "base", "boisson"}

# LE FORMAT — la FORME que le dîner prend sur la table, dans les mots du foyer.
#
# Dit le 2026-10-18 : « encourager la quiche, la soupe, le gratin », ces
# formes-là que le foyer cuisine déjà les yeux fermés. Ni le rôle (la place
# dans le repas) ni `apports.profil` (four, mijoté, cru — le MODE de cuisson)
# ne le disaient : un gratin et une quiche sont tous deux `four`, et c'est
# précisément la différence qui compte pour quelqu'un qui choisit à 15 h.
#
# UNION FERMÉE, comme `ROLES` : une faute de frappe ici ferait disparaître un
# plat d'un filtre, sans un mot. OBLIGATOIRE sur tout `plat` qui peut se
# proposer au dîner — c'est là que le moteur de suggestion le lira ; ailleurs
# (desserts, bases, boissons) la question ne se pose pas.
#
# `piece` est « une pièce et sa garniture » (le poulet rôti, le pavé de
# saumon) ; `galettes` couvre tout ce qui se façonne en portions et se poêle
# ou s'enfourne (burgers, croquettes, falafels, nuggets) ; `pizza` toute pâte
# garnie qui n'est pas une tarte (focaccia, chausson, samoussas).
FORMATS = {"quiche", "soupe", "gratin", "poelee", "mijote", "salade", "omelette",
           "pates", "galettes", "piece", "tartine", "pizza", "cake", "terrine"}

# L'ASSIETTE — ce qui se sert À CÔTÉ, et qui n'est pas un ingrédient du plat.
# Même forme qu'une ligne d'ingrédient, moins tout ce qui n'a de sens que
# dedans : un accompagnement n'est visé par aucun `uses:` (il n'entre dans
# aucune étape), ne franchit aucune porte d'assaisonnement, et ne sort d'aucun
# `accepts` — on ne chaîne pas du riz, on le fait cuire.
CHAMPS_ACCOMPAGNEMENT = {"id", "name", "qty", "unit"}
MOTS_ASSAISONNEMENT = re.compile(r"\bsel\b|sal|poivr|assaisonn|rectifi", re.I)
# Une attente écrite DANS la phrase est invisible au modèle : c'est exactement
# la faute que `attente_min` répare, et elle a été commise huit fois avant
# d'être vue. Le contrôle la rend impossible à refaire en silence.
#
# Resserré une fois écrit, et pour la raison que ce fichier connaît déjà : une
# première version attrapait « tremper » et « la veille » n'importe où, donc le
# pain qu'on trempe 3 min et le plat « plus fade que la veille ». Trois faux
# positifs sur quatre — le seuil à partir duquel un contrôle apprend à être
# ignoré. Ne restent que les tournures qui annoncent VRAIMENT une attente.
# Au-delà de ce seuil, une action n'est plus un geste : elle porte une
# explication (qui appartient à `astuce:`) ou plusieurs gestes (qui
# appartiennent à plusieurs étapes). Mesuré sur le corpus avant d'être posé —
# médiane 98 caractères, troisième quartile 145, maximum 405.
MAX_ACTION = 160
MOTS_ATTENTE = re.compile(
    r"^\s*la veille\b|\ble lendemain\b|\btoute la nuit\b|\bune nuit\b"
    r"|\bd'avance\b|\bà l'avance\b|\d+\s*h\s*avant|\bà tremper\b|\btrempage\b"
    r"|\bdécongel", re.I)


def verifier(rid: str, r: dict, rayons: dict, rules: dict, cat: dict,
             capacites: set, foyer: dict) -> tuple:
    err, warn = [], []
    ids_connus = {i for v in rayons["rayons"].values() for i in v} | set(rayons["placard"])
    alias = rayons.get("aliases", {})

    etapes = r.get("steps", [])
    vus = []
    for i, s in enumerate(etapes):
        # `compile.py` lit `id` et `action` sans garde : une étape qui n'a ni
        # l'un ni l'autre le fait planter, pas échouer proprement.
        if not isinstance(s, dict) or "id" not in s or "action" not in s:
            err.append(f"étape n°{i + 1} sans `id:` ou `action:` — compile.py plantera dessus")
            continue
        if s["id"] in vus:
            err.append(f"étape en double : {s['id']}")
        for c in s.get("needs", []):
            if c not in capacites:
                err.append(f"étape {s['id']} : capacité « {c} » inconnue "
                           "(ni dans rules.yaml, ni fournie par un équipement du foyer)")
        p = s.get("parallel_with")
        if p and p not in vus:
            err.append(f"étape {s['id']} : parallel_with « {p} » ne précède pas cette étape")

        # L'attente, seconde horloge du modèle (cf. `anticipation.py`).
        att = s.get("attente_min")
        if att is not None and (not isinstance(att, int) or att <= 0):
            err.append(f"étape {s['id']} : `attente_min` doit être un entier de minutes "
                       "strictement positif")
        elif att and att >= an.COUPURE_MIN and not s.get("attente_raison"):
            warn.append(f"étape {s['id']} : {att} min d'attente coupent la recette en deux "
                        "séances, mais sans `attente_raison:` l'agenda ne saura pas dire "
                        "de quoi il s'agit")
        # L'ASTUCE, ET LE SEUIL QUI LA REND NÉCESSAIRE.
        #
        # 196 étapes sur 692 portaient leur explication SOUDÉE à l'action, après
        # un « : » ou un « — », faute d'un champ où la mettre — et l'écran de
        # cuisine rend `action` en gros titre. La moitié du titre n'était donc
        # pas le geste. `astuce:` est l'endroit ; ce seuil est ce qui empêche
        # l'ancien réflexe de revenir.
        #
        # LE SEUIL EST MESURÉ, PAS CHOISI : la médiane des actions était à 98
        # caractères et le troisième quartile à 145. 160 laisse passer une
        # phrase d'instruction longue et attrape les deux tiers de ce qui
        # dépasse — 188 actions au moment où le champ est créé, et c'est
        # exactement la liste de travail.
        astuce = s.get("astuce")
        if astuce is not None and not (isinstance(astuce, str) and astuce.strip()):
            err.append(f"étape {s['id']} : `astuce:` vide ou non textuelle — "
                       "l'omettre dit la même chose sans occuper l'écran")
        if isinstance(astuce, str) and astuce.strip() == s.get("action", "").strip():
            err.append(f"étape {s['id']} : `astuce:` répète l'action mot pour mot")
        if len(s.get("action", "")) > MAX_ACTION:
            warn.append(f"étape {s['id']} : action de {len(s['action'])} caractères "
                        f"(seuil {MAX_ACTION}) — soit elle porte une explication qui "
                        "devrait être dans `astuce:`, soit elle enchaîne plusieurs "
                        "gestes qui devraient être plusieurs étapes")

        rat = s.get("rattrapage")
        if rat and not (rat.get("action") and rat.get("cout_min")):
            err.append(f"étape {s['id']} : `rattrapage` demande une `action` et un "
                       "`cout_min` — sans quoi il n'y a rien à proposer à qui a oublié")
        if not att and MOTS_ATTENTE.search(s.get("action", "")):
            warn.append(f"étape {s['id']} : l'action parle d'attente (« la veille », "
                        "« 2 h avant », trempage…) sans `attente_min:`. Écrite dans la "
                        "phrase, l'attente est invisible au modèle : le plat ne sera "
                        "jamais annoncé la veille et son coût sera facturé au repas.")
        vus.append(s["id"])

    # Ingrédients : tout id doit avoir un rayon, sinon il tombe en « NON CLASSÉ ».
    for ing in r.get("ingredients", []) + r.get("sans_reste", {}).get("ingredients", []):
        # UNE VIRGULE NON QUOTÉE COUPE LE NOM EN DEUX, EN SILENCE. Les lignes
        # d'ingrédient sont écrites en flow mapping — `{id: x, name: y, qty: 1}` —
        # où la virgule sépare les champs. Un nom qui en contient une sans être
        # entre guillemets s'arrête donc à la virgule, et ce qui suit devient une
        # CLÉ sans valeur, que personne ne lit. Rien ne casse : la recette se
        # charge, se vérifie et se compile, avec un nom amputé.
        #
        # Huit lignes du catalogue étaient dans ce cas, découvertes en saisissant
        # l'hiver. Ce qu'elles perdaient n'était pas de l'ornement — « sans peau
        # ni arêtes », « à température ambiante », « très froide » : des
        # instructions dont dépend la recette. Les clés inconnues sont donc une
        # erreur, jamais un avertissement.
        inconnues = set(ing) - CHAMPS_INGREDIENT
        if inconnues:
            err.append(
                f"ingrédient « {ing.get('id', '?')} » : champ(s) inconnu(s) "
                f"{sorted(inconnues)} — presque toujours une virgule non quotée "
                f"dans `name:`, qui a coupé le nom à « {ing.get('name')} » et "
                "transformé la suite en clés vides. Mettre le nom entre guillemets.")
        # T186 — FACULTATIF, C'EST « LE PLAT SE FAIT SANS ». Une base, un
        # assaisonnement (déjà jamais compté) ou une ligne dite centrale ne
        # peuvent pas l'être : la phrase se contredirait.
        if ing.get("optional") is not None and ing.get("optional") is not True:
            err.append(f"ingrédient « {ing.get('id', '?')} » : `optional` ne prend que `true`")
        if ing.get("optional") and (ing.get("from_accepts") or ing.get("seasoning") or ing.get("central")):
            err.append(f"ingrédient « {ing.get('id', '?')} » : `optional` avec `from_accepts`, "
                       "`seasoning` ou `central` — un facultatif est une ligne ordinaire")
        if ing.get("from_accepts"):
            continue
        cid = alias.get(ing["id"], ing["id"])
        if cid not in ids_connus:
            err.append(f"ingrédient « {cid} » sans rayon (à ajouter dans rayons.yaml)")
        # UN REMPLAÇANT AVEC UN `id` EST UN ACHAT, et il doit en être un vrai :
        # sans rayon, la fiche dirait « en stock » d'une chose que le stock ne
        # peut pas porter. Sans `id`, `subs` reste la note d'avant — lue par
        # l'humain, pas par le modèle.
        for sub in ing.get("subs") or []:
            if "id" not in sub:
                continue
            sid = alias.get(sub["id"], sub["id"])
            if sid not in ids_connus:
                err.append(f"ingrédient « {cid} » : remplaçant « {sid} » sans rayon")
            if sid == cid:
                err.append(f"ingrédient « {cid} » : se remplace par lui-même")
            if not isinstance(sub.get("ratio", 1.0), (int, float)) or sub.get("ratio", 1.0) <= 0:
                err.append(f"ingrédient « {cid} » : remplaçant « {sid} » au ratio invalide")
        # T178 — `equivalences: false` refuse la table du commerce pour CETTE
        # ligne ; `true` ne veut rien dire de plus que l'absence du champ.
        if "equivalences" in ing and ing["equivalences"] is not False:
            err.append(f"ingrédient « {cid} » : `equivalences` ne prend que `false`")

    # ────────────────────────────────────────────────────────── le rôle
    #
    # « LE RÔLE D'UN PLAT N'EXISTE NULLE PART DANS LE MODÈLE », écrit en tête de
    # `tian-ratatouille-parmesan` le jour de sa saisie et resté vrai six
    # semaines. Sans lui, `creneaux:` était le seul filtre, et il ne parle que
    # de l'heure : une pâte brisée et une detox-water se proposaient pour le
    # dîner, parce que rien ne disait qu'elles ne sont pas des dîners.
    role = r.get("role", "plat")
    if role not in ROLES:
        err.append(f"rôle « {role} » inconnu — attendu l'un de {sorted(ROLES)}")
    # UN ACCOMPAGNEMENT N'A PAS D'ACCOMPAGNEMENT. `avec:` dit ce qu'il manque à
    # une assiette ; sur un plat qui EST ce qui manque à une autre, la question
    # ne se pose pas, et la réponse s'additionnerait deux fois au panier le jour
    # où les deux plats seront posés ensemble.
    if role != "plat" and r.get("avec"):
        err.append(f"un plat de rôle « {role} » porte un `avec:` — seul un `plat` "
                   "peut réclamer quelque chose à côté")

    # Le format — voir `FORMATS` en tête de fichier.
    fmt = r.get("format")
    if fmt is not None and fmt not in FORMATS:
        err.append(f"format « {fmt} » inconnu — attendu l'un de {sorted(FORMATS)}")
    if (fmt is None and role == "plat"
            and "diner" in (r.get("creneaux") or ["dejeuner", "diner"])):
        err.append("plat de dîner sans `format:` — le moteur de suggestion ne saurait "
                   "pas dire si c'est une soupe ou un gratin")

    # ────────────────────────────────────────────────────── l'assiette
    #
    # `avec:` EST CE QUI MANQUE À L'ASSIETTE, ET C'EST UNE DONNÉE D'ACHAT.
    #
    # Dit le 22/09/2026 : « il manque toujours les accompagnements, je n'ai pas
    # un repas complet ». Les escalopes p. 39 s'arrêtent au four ; le livre,
    # lui, finissait par « servir avec une salade verte et du riz ». Cette
    # phrase-là n'avait aucun endroit où aller — ni dans `ingredients`, qui
    # décrit ce qu'on met DANS le plat, ni dans une étape, qui décrit un geste.
    #
    # Les contrôles sont ceux des ingrédients, pour une raison simple : ces
    # lignes finissent dans le même panier, à la même échelle. Une seule leur
    # est propre — un id déjà présent dans `ingredients` ferait acheter deux
    # fois la même chose, et personne ne relirait le total.
    ids_du_plat = {alias.get(i["id"], i["id"]) for i in r.get("ingredients", [])}
    vus_avec = set()
    for ing in r.get("avec", []):
        if not isinstance(ing, dict):
            err.append(f"`avec:` n'est pas une ligne d'accompagnement : {ing!r}")
            continue
        manquants = {"id", "name", "qty", "unit"} - set(ing)
        if manquants:
            err.append(f"accompagnement « {ing.get('id', '?')} » : champ(s) "
                       f"{sorted(manquants)} manquant(s) — sans quantité ni unité il "
                       "ne peut ni s'afficher à l'échelle du foyer, ni entrer au panier")
            continue
        inconnues = set(ing) - CHAMPS_ACCOMPAGNEMENT
        if inconnues:
            err.append(f"accompagnement « {ing['id']} » : champ(s) inconnu(s) "
                       f"{sorted(inconnues)} — même piège que les ingrédients, "
                       "une virgule non quotée dans `name:`")
        if not isinstance(ing["qty"], (int, float)) or ing["qty"] <= 0:
            err.append(f"accompagnement « {ing['id']} » : `qty` doit être un nombre > 0 "
                       f"(lu : {ing['qty']!r})")
        cid = alias.get(ing["id"], ing["id"])
        if cid not in ids_connus:
            err.append(f"accompagnement « {cid} » sans rayon (à ajouter dans rayons.yaml)")
        if cid in ids_du_plat:
            err.append(f"accompagnement « {cid} » est déjà un ingrédient du plat — "
                       "il serait acheté deux fois, et le panier ne dirait pas lequel "
                       "des deux nombres est le bon")
        if cid in vus_avec:
            err.append(f"accompagnement « {cid} » en double dans `avec:`")
        vus_avec.add(cid)

    # Chaînage. Un `accepts` demande soit un `type:` exact (« sauce-bolognaise »),
    # soit un `kind:`, c'est-à-dire une CLASSE de sorties (« n'importe quel
    # reste-plat »). Tous les lecteurs passent par `chainage.accepte`.
    for acc in r.get("accepts", []):
        libelle = ch.libelle_accepts(acc)
        if not acc.get("type") and not acc.get("kind"):
            err.append("accepts sans `type:` ni `kind:` — l'arête ne peut matcher "
                       "aucune sortie, et échoue en silence")
            continue
        if acc.get("required") and not r.get("sans_reste"):
            fb = acc.get("fallback_recipe")
            if fb and fb not in cat:
                err.append(f"fallback_recipe « {fb} » absent du catalogue")
            elif not fb and acc.get("type"):
                err.append(f"accepts « {acc['type']} » requis, sans sans_reste ni "
                           "fallback_recipe : le plat sera bloqué à chaque tirage")
            elif not fb:
                # Une arête par CLASSE n'a pas de recette de repli unique — c'est
                # tout l'intérêt : n'importe lequel des émetteurs la couvre. Ce
                # qu'il faut vérifier, c'est qu'il en existe au moins un.
                emis = any(e.get("kind") == acc["kind"]
                           for r2 in cat.values() for e in r2.get("emits", []))
                if not emis:
                    err.append(f"accepts « {libelle} » requis, mais aucune recette du "
                               "catalogue n'émet cette classe : le plat sera bloqué "
                               "à chaque tirage")
    for e in r.get("emits", []):
        if e.get("qty_band") not in BANDES:
            warn.append(f"emits « {e.get('type')} » : bande « {e.get('qty_band')} » hors vocabulaire {sorted(BANDES)}")
        amount, unit = ch.quantite(e)
        if e.get("qty") is not None and (amount is None or amount <= 0 or not unit):
            err.append(f"emits « {e.get('type')} » : `qty:` doit porter un `amount` "
                       "positif et une `unit`")
        # Une arête typée dont l'émetteur ne chiffre rien retombe sur le jeton :
        # elle se laisse consommer autant de fois qu'on veut. La bande ne suffit
        # pas — « 2-repas » ne se compare pas à « 700 g ».
        demandeurs = [(rid2, ch.quantite(a)) for rid2, r2 in cat.items()
                      for a in r2.get("accepts", [])
                      if a.get("type") and a["type"] == e.get("type")]
        for rid2, (besoin, u2) in demandeurs:
            if besoin is None:
                continue
            if amount is None:
                warn.append(f"emits « {e['type']} » sans `qty:` alors que « {rid2} » en "
                            f"réclame {besoin} {u2} : le chaînage ne saura pas s'il y en "
                            "a assez, et la sortie se consommera sans jamais baisser")
            elif unit != u2:
                err.append(f"emits « {e['type']} » chiffré en {unit}, mais « {rid2} » le "
                           f"réclame en {u2} : les deux faces d'une arête doivent se "
                           "mesurer dans la même unité")
            break

    # La vaisselle est une capacité finie, comme la mémoire d'un CPU de craft :
    # un lot qui n'entre pas dans le récipient ne se cuisine pas, quels que
    # soient les ingrédients. Zéro recette du catalogue est dans ce cas
    # aujourd'hui ; le contrôle existe pour que ça se voie le jour où une
    # recette pour 12 arrive dans un foyer qui n'a qu'une sauteuse.
    eq_max, f_max = ch.facteur_max_vaisselle(r, foyer)
    if f_max is not None:
        base = r["yields"]["portions_eq"]
        garde = any(e.get("keeps", {}).get("congelo") or e["kind"] == "reste-plat"
                    for e in r.get("emits", []))
        besoin = sum(e["portion_eq"] for e in foyer["eaters"] if e.get("diet") != "baby")
        f = ch.facteur_lot(r, 1.0 if (garde and besoin < base) else besoin / base)
        if f > f_max + 1e-9:
            lab = eq_max.get("label", eq_max["id"])
            err.append(f"le lot courant (×{f:.2g} de {base:g} parts) ne tient pas dans "
                       f"{lab} (×{f_max:.2g} au maximum) : la recette ne s'exécute pas "
                       "telle quelle chez ce foyer")

    # `drop:` est une CHAÎNE (l'id de l'étape), `swap:` est un mapping — asymétrie
    # de `compile.py`. Écrire `drop: {step: …}` ne lève rien : la comparaison
    # str/dict échoue en silence et le plan B ne s'applique jamais.
    for pb in r.get("plan_b", []):
        if "drop" in pb:
            if not isinstance(pb["drop"], str):
                err.append("plan_b : `drop:` doit être l'id de l'étape en clair, pas un mapping")
                continue
            cible = pb["drop"]
        elif "swap" in pb:
            cible = pb["swap"].get("step")
        else:
            err.append("entrée plan_b sans `drop:` ni `swap:`")
            continue
        if cible not in vus:
            err.append(f"plan_b vise l'étape « {cible} », qui n'existe pas")

    # `uses:` — le lien étape → ingrédient, et ses deux façons de mentir.
    #
    # Il est OBLIGATOIRE depuis T193, et TOTAL : chaque étape le porte, `[]`
    # quand elle ne consomme rien. Le foyer l'a dit plusieurs fois — « on te
    # dit mélanger l'eau et la farine, mais on ne te donne pas les quantités,
    # donc tu restes sur la liste des ingrédients » : 82 plats sur 207 n'en
    # avaient aucun, et le mode en cuisine renvoyait à la liste pour eux. Une
    # couverture partielle est pire encore : l'écran ne montre alors qu'une
    # partie des quantités sans rien signaler.
    if etapes and not any("uses" in s for s in etapes if isinstance(s, dict)):
        err.append("aucune étape ne porte `uses:` : en cuisine, aucune quantité ne "
                   "serait rappelée au moment du geste — dire, étape par étape, "
                   "quelles lignes d'ingrédient elle emploie (`[]` si aucune)")
    refs, doublons = {}, []
    for i in r.get("ingredients", []):
        cle = i.get("ref") or i["id"]
        if cle in refs:
            doublons.append(cle)
        refs[cle] = i
    if any("uses" in s for s in etapes if isinstance(s, dict)):
        # Une même ligne deux fois — l'huile de la pâte et celle de la farce —
        # n'est un problème QUE là : sans `uses:`, l'`id` commun est même ce
        # qu'on veut, c'est lui qui fusionne les deux lignes de courses.
        for cle in doublons:
            err.append(f"deux lignes d'ingrédient portent la même référence « {cle} » : "
                       "`uses:` ne peut pas les distinguer — donner un `ref:` à chacune")
        vises = set()
        for s in etapes:
            if not isinstance(s, dict) or "id" not in s:
                continue
            if "uses" not in s:
                err.append(f"étape « {s['id']} » sans `uses:` alors que d'autres étapes en ont : "
                           "la couverture doit être totale, sinon l'écran affiche une "
                           "partie des quantités en ayant l'air de toutes les afficher "
                           "— écrire `uses: []` si l'étape ne consomme rien")
                continue
            for u in s["uses"]:
                if u not in refs:
                    err.append(f"étape « {s['id']} » : `uses: {u}` ne correspond à aucun "
                               "ingrédient de la recette")
                else:
                    vises.add(u)
        # Un ingrédient qu'aucune étape ne réclame est acheté et jamais versé.
        # Les assaisonnements ne sont PAS dispensés : le sel oublié dans la
        # liste sans étape pour l'employer est justement la faute que
        # `seasoning_gate` a déjà attrapée une fois sur `omelette-courgettes`.
        for cle, i in refs.items():
            if cle not in vises:
                err.append(f"« {i['name']} » est dans la liste d'ingrédients mais aucune "
                           "étape ne l'emploie : il serait acheté et jamais versé")

    # Le prélèvement bébé et sa porte.
    portes = [s for s in etapes if s.get("seasoning_gate")]
    if r.get("baby_portion"):
        if not portes:
            # LE CONTRÔLE DATAIT D'AVANT `depuis:`, ET SON MESSAGE EST DEVENU
            # FAUX. `compile.py` cherche d'abord les étapes de `depuis:` et rend
            # le prélèvement après la dernière ; il ne retombe sur la porte que
            # si `depuis:` est vide. Un plat SANS SEL DU TOUT — le yaourt de
            # soja p. 159, la compotée de pommes de la p. 160 — a un
            # prélèvement parfaitement injectable et se voyait refuser au motif
            # qu'il « ne serait jamais injecté ».
            #
            # Le contrôle supposait que la seule raison de prélever tôt est le
            # salage. C'est vrai de la majorité du catalogue et faux en général :
            # ce qu'il faut, c'est savoir D'OÙ sort la portion, et `depuis:` le
            # dit mieux qu'une porte.
            if not r["baby_portion"].get("depuis"):
                err.append("baby_portion sans seasoning_gate ni `depuis:` : rien ne dit "
                           "où insérer le prélèvement, il ne sera jamais injecté")
        elif len(portes) > 1:
            err.append(f"{len(portes)} seasoning_gate : le prélèvement serait injecté plusieurs fois")
        else:
            g = portes[0]
            # L'erreur commise trois fois : une porte posée sur l'étape qui
            # FABRIQUE la chose à prélever, donc le prélèvement est rendu avant
            # qu'elle existe. La bonne question n'est pas « cette étape est-elle
            # trop longue pour ne faire que saler » — c'était une devinette, et
            # elle criait au loup sur quatre recettes correctes sur cinq. C'est
            # « ce qu'on prélève existe-t-il déjà à ce moment-là ». `depuis:`
            # répond en données : les étapes dont sort la portion bébé, ou `[]`
            # quand elle est prélevée sur un ingrédient (disponible d'emblée).
            depuis = r["baby_portion"].get("depuis")
            if depuis is None:
                if g.get("time_min", 0) > 2:
                    warn.append(f"seasoning_gate sur « {g['id']} » ({g['time_min']} min) sans `depuis:` sur "
                                "baby_portion : faute de savoir d'où sort la portion, on ne peut que deviner. "
                                "Une étape qui ne fait que saler est courte ; si celle-ci fabrique aussi ce "
                                "qu'on prélève, le prélèvement sera injecté AVANT que ça existe.")
            else:
                rang_porte = vus.index(g["id"]) if g["id"] in vus else len(vus)
                for sid in depuis:
                    if sid not in vus:
                        err.append(f"baby_portion `depuis: {sid}` — cette étape n'existe pas")
                    elif vus.index(sid) >= rang_porte:
                        err.append(f"baby_portion prélevée depuis « {sid} », qui ne précède pas la porte "
                                   f"« {g['id']} » : le prélèvement serait rendu avant que la chose à "
                                   "prélever existe. C'est exactement la faute passée trois fois.")
            if not MOTS_ASSAISONNEMENT.search(g.get("action", "")):
                warn.append(f"seasoning_gate sur « {g['id']} » : l'action ne parle pas d'assaisonnement")

    # Une source doit être RETROUVABLE, pas forcément paginée : un livre se cite
    # par sa page, un billet de blog par son URL.
    src = r.get("source")
    if src and not (src.get("page") or src.get("url")):
        warn.append("bloc source sans numéro de page ni URL : la recette n'est pas retrouvable")
    e2, w2 = verifier_harmonie(r, rayons, rules, foyer)
    return err + e2, warn + w2


# ─────────────────────────────────────────────────────────── T198
#
# LES RÈGLES DE RÉDACTION, TENUES SUR TOUT LE CATALOGUE. Chacune est née d'un
# retour sur UNE fiche et appliquée aux suivantes, jamais aux précédentes : le
# catalogue disait donc la règle à moitié. Ce bloc en fait des contrôles, pour
# que la fiche saisie demain ne refasse pas la faute que la passe de T198 a
# corrigée sur les anciennes. Le détail de chaque règle et son origine sont
# dans le BACKLOG, ticket T198.
#
# LES RECETTES SANS SOURCE N'Y SONT PAS SOUMISES, sauf pour le céleri-rave et
# l'obligation d'avoir des étapes : elles partent une à une (T197), et les
# remettre au format reviendrait à les écrire une seconde fois.

ENCODAGE = "étapes restructurées et reformulées ; ni prose ni photo d'origine"
# Ce que l'inventaire du foyer n'a pas, nommé dans une consigne. Le foyer a un
# mixeur plongeur et un petit blender, pas de robot : un « bol du robot » écrit
# en clair contourne la résolution par capacité (`needs`), qui seule sait dire
# « au petit blender, par impulsions » ou « au couteau ».
APPAREILS = re.compile(r"\b(robot|mixeur|blender|sorbeti\w+|machine à pain|déshydrat\w+)\b", re.I)
# T186 — ce qu'un nom de ligne dit facultatif. « (+ 3 pour décorer) » ne l'est
# pas : c'est une part de la ligne, le reste entre dans le plat.
FACULTATIF = re.compile(r"facultati|pour servir|pour le service|pour décorer|en option", re.I)
EN_PARTIE = re.compile(r"\+[^)]*(pour décorer|pour servir)|le reste pour servir", re.I)
PENDANT = re.compile(r"^\s*(Pendant (?:ce temps|la|le|les|que)|Entre-temps)\b")
# T188 — une viande ou un poisson qui se compte à la pièce ne se dit pas qu'au
# poids : « 400 g de filets de poulet » ne dit pas combien de filets acheter.
PIECES = re.compile(r"\b(filets?|pavés?|cuisses?|escalopes?|blancs?|darnes?|côtes?|"
                    r"saucisses?|sardines?|gambas|steaks?|pilons?|magrets?)\b", re.I)
COMPTE = re.compile(r"\b(\d+|un|une|deux|trois|quatre|cinq|six|huit|dix|douze)\s+"
                    r"(grands?\s+|gros\s+|petits?\s+|longs?\s+|beaux?\s+)?" + PIECES.pattern[2:], re.I)
# Les mots d'un id qui ne nomment pas l'ingrédient à eux seuls.
MOTS_VIDES = {"huile", "sucre", "farine", "fleur", "poudre", "pate", "creme", "jus",
              "eau", "lait", "sauce", "pain", "bouillon", "puree", "graines", "feuilles",
              "frais", "fraiche", "blanc", "noir", "rouge", "vert", "verte", "sec", "seche",
              "cuit", "cuite", "demi", "petit", "petits", "gros", "extrait", "ecorce", "zeste"}


def _sans_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower())
                   if unicodedata.category(c) != "Mn")


def _lexique(rayons: dict) -> dict:
    """id → les mots qui le nomment (son nom lisible, son id en clair)."""
    if "_lexique" not in rayons:
        noms = rayons.get("noms") or {}
        ids = {i for v in rayons["rayons"].values() for i in v}
        rayons["_lexique"] = {i: {w for w in (_sans_accents(str(noms.get(i, ""))),
                                              _sans_accents(i.replace("-", " ")))
                                  if len(w) >= 5}
                              for i in ids}
    return rayons["_lexique"]


def verifier_harmonie(r: dict, rayons: dict, rules: dict, foyer: dict) -> tuple:
    err, warn = [], []
    alias = rayons.get("aliases", {})
    etapes = [s for s in r.get("steps", []) if isinstance(s, dict)]
    lignes = r.get("ingredients", []) + (r.get("sans_reste") or {}).get("ingredients", [])

    # LE CÉLERI-RAVE N'ENTRE PAS DANS CETTE CUISINE — le foyer ne l'aime pas.
    # Ni en ligne, ni en remplaçant, ni dans un nom : un plat qui le met au
    # centre est écarté dans l'index de sa source, un plat qui le mêle à
    # d'autres racines le remplace par l'une d'elles.
    for i in lignes + r.get("avec", []):
        ids = [i.get("id")] + [s.get("id") for s in i.get("subs") or []]
        noms = [str(i.get("name", ""))] + [str(s.get("name", "")) for s in i.get("subs") or []]
        if "celeri-rave" in ids or any(re.search(r"céleri[- ]rave", n, re.I) for n in noms):
            err.append(f"« {i.get('name')} » : du céleri-rave — le remplacer par une autre "
                       "racine, ou écarter le plat dans l'index de sa source")

    # UNE RECETTE A DES ÉTAPES (14/09 : « encore une recette sans étapes »).
    if not etapes:
        err.append("aucune étape : le plat se planifie mais ne se cuisine pas")

    if not r.get("source"):
        return err, warn

    # LA PROVENANCE COMPLÈTE (T73, T159) : de quoi retrouver la page ou l'article.
    src = r["source"]
    for k in ("author", "work", "source_id", "encoding"):
        if not src.get(k):
            err.append(f"bloc source sans `{k}:`")
    if src.get("encoding") and not str(src["encoding"]).startswith(ENCODAGE):
        err.append(f"`encoding:` doit commencer par « {ENCODAGE} » (lu : « {src['encoding']} »)")
    if src.get("page") and f"p. {src['page']}" not in str(src.get("work", "")):
        err.append(f"la page {src['page']} n'est pas dans `work:`, la phrase que la fiche affiche")

    deja = set()
    for s in etapes:
        a = s.get("action", "")
        # DEUX ÉTAPES EN MÊME TEMPS SE DISENT (les lentilles du 14/09, qui ont
        # fait attendre 30 min pour rien).
        if PENDANT.match(a) and not s.get("parallel_with"):
            err.append(f"étape {s['id']} : « {a[:30]}… » sans `parallel_with:` — le guide "
                       "fera attendre la fin de l'étape d'avant")
        # CE QUE LE FOYER N'A PAS (T84, T189, T196) : une capacité sans solution,
        # ou un appareil nommé en clair sans autre façon de faire.
        for cap in s.get("needs", []):
            lab, rew, _ = rc.resolve_capability(cap, foyer, rules)
            if lab is None and rew is None:
                err.append(f"étape {s['id']} : « {cap} » n'a aucune solution avec l'équipement "
                           "du foyer — adapter le geste ou écarter le plat")
        app = APPAREILS.search(a)
        if app and not s.get("needs") and not re.search(r"\bou\b|sans mixer", a):
            err.append(f"étape {s['id']} : nomme un appareil (« {app.group(0)} ») sans "
                       "`needs:` ni autre façon de faire — le foyer n'a pas de robot")
        # LA QUANTITÉ AU MOMENT DU GESTE (T113, T193, et le 23/11 : « sinon je
        # dois ouvrir les ingrédients à chaque étape »). La PREMIÈRE étape qui
        # nomme une ligne la porte dans `uses:` ; les suivantes peuvent la
        # citer sans elle (« retirer la carcasse »).
        texte = _sans_accents(a)
        uses = set(s.get("uses") or [])
        for i in r.get("ingredients", []):
            cle = i.get("ref") or i["id"]
            if cle in uses or cle in deja or i.get("seasoning"):
                continue
            mots = [w for w in i["id"].split("-") if len(w) >= 4 and w not in MOTS_VIDES]
            if mots and re.search(r"\b" + re.escape(mots[0]) + r"s?\b", texte):
                err.append(f"étape {s['id']} : nomme « {i['name']} » sans l'avoir dans `uses:` "
                           "— sa quantité ne s'affichera pas sous le geste")
                deja.add(cle)
        deja |= uses

    lex = _lexique(rayons)
    viandes = set(rayons["rayons"]["boucherie"]) | set(rayons["rayons"]["poissonnerie"])
    for i in lignes:
        if i.get("from_accepts"):
            continue
        n = str(i.get("name", ""))
        cid = alias.get(i["id"], i["id"])
        # T186 — CE DONT LE PLAT SE PASSE, DIT PAR SON NOM, EST `optional`.
        if FACULTATIF.search(n) and not EN_PARTIE.search(n) and not i.get("optional") \
                and not i.get("seasoning"):
            err.append(f"« {n} » : le nom le dit facultatif — `optional: true`")
        # T167 — UNE ALTERNATIVE QUI A UN RAYON EST UN REMPLAÇANT. Écrite dans
        # le nom, la fiche ne la propose pas et la liste ne la voit pas. Une
        # ligne qui porte déjà des `subs` (avec id, ou en note quand le ratio
        # n'a pas de sens) a été lue.
        coupe = re.split(r"\bou\b|à défaut|\bsinon\b", n, maxsplit=1)
        if len(coupe) == 2 and not i.get("subs"):
            alt = _sans_accents(coupe[1])
            autres = sorted(k for k, mots in lex.items()
                            if k != cid and alias.get(k, k) != cid
                            and any(re.search(r"\b" + re.escape(w) + r"\b", alt) for w in mots))
            if autres:
                err.append(f"« {n} » : l'alternative ({', '.join(autres[:3])}) a un rayon — "
                           "en faire un `subs:` avec `id`, ou une note `subs:` sans `id`")
        # T188 — LA PIÈCE ET LE POIDS. Avertissement seulement : le livre ne
        # donne souvent que l'un des deux, et l'autre est au foyer de le dire.
        if cid in viandes and i.get("unit") in ("g", "kg") and PIECES.search(n) \
                and not COMPTE.search(n):
            warn.append(f"« {n} » ({i.get('qty')} {i.get('unit')}) : combien de pièces ?")
    return err, warn


def verifier_entetes(dossier: Path) -> list:
    """T198 — une fiche sourcée s'ouvre sur son cadre de licence (carte #26),
    en français. Lu sur le fichier : le chargeur ne garde pas les commentaires."""
    err = []
    for p in sorted(dossier.glob("*.yaml")):
        texte = p.read_text()
        if "\nrecipe:" not in texte or "\n  source:" not in texte:
            continue
        tete = texte.split("\nrecipe:")[0]
        ouverture = "\n".join(tete.splitlines()[:3])
        if "#26" not in tete or re.search(r"\b(the|recipe|encoding)\b", ouverture):
            err.append(f"{p.name} : l'en-tête ne cite pas, en français, le cadre de licence "
                       "de la carte #26")
    return err


def verifier_types_lisibles(cat: dict) -> tuple:
    """T193 — tout ce qu'un plat produit se dit en français à l'écran.

    Le titre du plat suffit quand un seul plat émet le type et n'émet que lui ;
    sinon il faut un libellé dans `types.yaml`. Sans lui, l'écran retombait sur
    l'identifiant dé-tiretisé : « pate vegetal », sans accents."""
    libelles = (rc.load(HERE / "types.yaml") or {}).get("libelles", {})
    emetteurs = {}
    for rid, r in cat.items():
        for e in r.get("emits", []):
            emetteurs.setdefault(e["type"], []).append(r)
    err = []
    for t, rs in sorted(emetteurs.items()):
        if t in libelles:
            continue
        if len(rs) == 1 and len({e["type"] for e in rs[0].get("emits", [])}) == 1:
            continue
        err.append(f"type émis « {t} » sans nom lisible : l'ajouter à types.yaml "
                   f"({len(rs)} plat(s) l'émettent)")
    return err, []


def verifier_equivalences(eq: dict, rayons: dict) -> tuple:
    """T178 — la table du commerce : chaque id a un rayon, rien ne se remplace
    par lui-même, un ratio est un nombre positif, `potager` a un remplaçant."""
    err, warn = [], []
    alias = rayons.get("aliases") or {}
    connus = {i for v in rayons["rayons"].values() for i in v} | set(rayons["placard"])
    for oid, entree in (eq.get("equivalences") or {}).items():
        if oid not in connus:
            err.append(f"« {oid} » sans rayon")
        inconnus = set(entree or {}) - {"par", "potager", "evite"}
        if inconnus:
            err.append(f"« {oid} » : champ(s) inconnu(s) {sorted(inconnus)}")
        par = (entree or {}).get("par") or []
        if not par:
            err.append(f"« {oid} » : aucun remplaçant (`par:` vide)")
        if not isinstance((entree or {}).get("potager", False), bool):
            err.append(f"« {oid} » : `potager` est vrai ou faux")
        if not isinstance((entree or {}).get("evite", False), bool):
            err.append(f"« {oid} » : `evite` est vrai ou faux")
        for e in par:
            sid = alias.get(e.get("id"), e.get("id"))
            if sid not in connus:
                err.append(f"« {oid} » : remplaçant « {sid} » sans rayon")
            if sid == alias.get(oid, oid):
                err.append(f"« {oid} » : se remplace par lui-même")
            if not e.get("nom"):
                err.append(f"« {oid} » : remplaçant « {sid} » sans `nom`")
            r = e.get("ratio", 1.0)
            if isinstance(r, bool) or not isinstance(r, (int, float)) or r <= 0:
                err.append(f"« {oid} » : remplaçant « {sid} » au ratio invalide")
            u = e.get("unites")
            if u is not None and (not isinstance(u, list) or not u):
                err.append(f"« {oid} » : `unites` est une liste non vide")
            inconnus = set(e) - {"id", "nom", "ratio", "unites"}
            if inconnus:
                err.append(f"« {oid} » → « {sid} » : champ(s) inconnu(s) {sorted(inconnus)}")
    return err, warn


def verifier_centraux(rayons: dict) -> tuple:
    """`centraux` désigne des rayons et des ids ; les deux doivent exister.

    Une faute de frappe y est SILENCIEUSE et coûte cher : l'app cesse simplement
    de demander sur cet ingrédient, elle parie dessus, et rien à l'écran ne dit
    pourquoi. C'est exactement le genre de panne qu'un vérificateur attrape en
    une seconde et qu'un usage met un mois à révéler.
    """
    err, warn = [], []
    c = rayons.get("centraux") or {}
    connus = {i for v in rayons["rayons"].values() for i in v} | set(rayons.get("placard", []))

    for nom in c.get("rayons", []):
        if nom not in rayons["rayons"]:
            err.append(f"centraux.rayons : rayon « {nom} » inconnu")
    for iid in c.get("ids", []):
        if iid not in connus:
            err.append(f"centraux.ids : ingrédient « {iid} » sans rayon")

    # Nommer un id dont le rayon est DÉJÀ central ne casse rien mais ment sur
    # l'intention : la liste est censée ne porter que les exceptions.
    dedans = {i for nom in c.get("rayons", []) for i in rayons["rayons"].get(nom, [])}
    for iid in sorted(set(c.get("ids", [])) & dedans):
        warn.append(f"centraux.ids : « {iid} » est déjà central par son rayon")
    return err, warn


def verifier_foyer(foyer: dict, equilibre: dict, capacites: set) -> tuple:
    """Le foyer aussi se vérifie : espaces et contenants sont des données.

    Un contenant qui ne va nulle part, ou un espace sans contenant possible,
    sont des impasses silencieuses — la semaine se planifie et rien ne se range.
    """
    err, warn = [], []
    for c in foyer.get("contenants", []) or []:
        cid = c.get("id", "?")
        if not c.get("nombre") or not c.get("portions"):
            err.append(f"contenant « {cid} » : il faut un `nombre` et des `portions` "
                       "non nuls, sinon il n'offre aucune place")
        vol = c.get("volume_ml")
        if vol is not None and (not isinstance(vol, (int, float)) or vol <= 0):
            err.append(f"contenant « {cid} » : `volume_ml` doit être un nombre positif "
                       "(ou absent quand le label n'en dit rien)")
        inconnus = set(c.get("espaces", [])) - set(ch.ESPACES)
        if inconnus:
            err.append(f"contenant « {cid} » : espace(s) inconnu(s) {sorted(inconnus)} "
                       f"— attendu parmi {list(ch.ESPACES)}")
        if not c.get("espaces"):
            err.append(f"contenant « {cid} » ne déclare aucun espace : il ne servira jamais")

    espaces = ch.capacites_stockage(foyer, equilibre)
    boites = ch.contenants_par_espace(foyer, capacites)
    for espace, cap in espaces.items():
        if not boites.get(espace):
            warn.append(f"espace « {espace} » : {cap:g} places d'étagère mais AUCUN "
                        "contenant utilisable — rien ne peut y être rangé")
    return err, warn


def main() -> int:
    rayons = rc.load(HERE / "rayons.yaml")
    rules = rc.load(HERE / "rules.yaml")
    foyer = rc.load(HERE / "household.yaml")["household"]
    cat = catalogue.charger_recettes(HERE / "recipes")

    # Une capacité est valide si une chaîne de repli la décrit (rules.yaml) OU si
    # un équipement du foyer la fournit directement — `boil` et `gratin-vessel`
    # n'existent que par la seconde voie.
    capacites = set(rules["capabilities"])
    for e in foyer["equipment"]:
        capacites |= set(e.get("capabilities", []))

    equilibre = rc.load(HERE / "equilibre.yaml")
    cibles = sys.argv[1:] or sorted(cat)
    n_err = n_warn = 0

    # Le foyer d'abord : si les espaces ou les contenants sont incohérents,
    # aucune recette ne se range, et le dire recette par recette serait 51 fois
    # le même message.
    if not sys.argv[1:]:
        err, warn = verifier_centraux(rayons)
        n_err += len(err); n_warn += len(warn)
        if err or warn:
            print("\nrayons.yaml")
            for e in err:
                print(f"  ✗ {e}")
            for w in warn:
                print(f"  ⚠ {w}")

        err, warn = verifier_types_lisibles(cat)
        n_err += len(err); n_warn += len(warn)
        if err:
            print("\ntypes.yaml")
            for e in err:
                print(f"  ✗ {e}")

        err = verifier_entetes(HERE / "recipes")
        n_err += len(err)
        if err:
            print("\nrecipes/ (en-têtes)")
            for e in err:
                print(f"  ✗ {e}")

        err, warn = verifier_equivalences(rc.load(HERE / "equivalences.yaml"), rayons)
        n_err += len(err); n_warn += len(warn)
        if err or warn:
            print("\nequivalences.yaml")
            for e in err:
                print(f"  ✗ {e}")
            for w in warn:
                print(f"  ⚠ {w}")

        err, warn = verifier_foyer(foyer, equilibre, capacites)
        n_err += len(err); n_warn += len(warn)
        if err or warn:
            print("\nhousehold.yaml")
            for e in err:
                print(f"  ✗ {e}")
            for w in warn:
                print(f"  ⚠ {w}")

        # Le garde-manger ensuite, et ses avertissements ne ressemblent à aucun
        # autre : ils ne parlent pas du corpus mais de la CUISINE. « Les pignons
        # de pin sont à la lumière » se corrige en déplaçant un sachet, pas en
        # éditant un fichier — et c'est la seule sortie de ce vérificateur dont
        # ce soit vrai.
        err, warn = gm.verifier_garde_manger(gm.charger(HERE / "garde-manger.yaml"), rayons)
        n_err += len(err); n_warn += len(warn)
        if err or warn:
            print("\ngarde-manger.yaml")
            for e in err:
                print(f"  ✗ {e}")
            for w in warn:
                print(f"  ⚠ {w}")

        # Le fond de roulement, la garde des denrées, les saisons — trois
        # fichiers du 2026-10-18, vérifiés ensemble parce que le fond s'appuie
        # sur les deux autres : une denrée du fond sans famille de garde n'a
        # ni fenêtre ni conseil.
        conserv = rc.load(HERE / "conservation.yaml")
        fond = fd.charger_fond(HERE / "fond.yaml")
        for nom, (err, warn) in (
                ("conservation.yaml (familles)", fd.verifier_familles(conserv, rayons)),
                ("fond.yaml", fd.verifier_fond(fond, conserv, rayons, cat)),
                ("creneaux.yaml (routines)", fd.verifier_routines(
                    rc.load(HERE / "creneaux.yaml"), cat)),
                ("saisons.yaml", fd.verifier_saisons(
                    fd.charger_saisons(HERE / "saisons.yaml"), rayons))):
            n_err += len(err); n_warn += len(warn)
            if err or warn:
                print(f"\n{nom}")
                for e in err:
                    print(f"  ✗ {e}")
                for w in warn:
                    print(f"  ⚠ {w}")
    for rid in cibles:
        if rid not in cat:
            print(f"✗ {rid} : absent du catalogue")
            n_err += 1
            continue
        err, warn = verifier(rid, cat[rid], rayons, rules, cat, capacites, foyer)
        n_err += len(err)
        n_warn += len(warn)
        if err or warn:
            print(f"\n{rid}")
            for e in err:
                print(f"  ✗ {e}")
            for w in warn:
                print(f"  ⚠ {w}")

    plan = sum(1 for rid in cibles if rid in cat and not catalogue.est_cuisinable(cat[rid]))
    print(f"\n{len(cibles)} recettes · {len(cibles) - plan} cuisinables, {plan} au niveau plan "
          f"· {n_err} erreur(s), {n_warn} avertissement(s)")

    # Une ligne, pas un avertissement par recette : ce sont les portions bébé
    # encore contrôlées à la devinette faute de `depuis:`. C'est une dette, elle
    # se solde en lisant les recettes une par une, et elle mérite d'être visible
    # sans noyer les vraies trouvailles.
    sans_depuis = sorted(rid for rid in cibles
                         if rid in cat and cat[rid].get("baby_portion")
                         and cat[rid]["baby_portion"].get("depuis") is None)
    if sans_depuis:
        print(f"  ({len(sans_depuis)} baby_portion sans `depuis:` — porte contrôlée "
              f"par heuristique, pas par la structure)")

    # L'ASSIETTE QUI N'EST PAS PLEINE, et une ligne plutôt que quarante-trois
    # avertissements — même geste que la dette de `depuis:` juste au-dessus.
    #
    # LE CONTRÔLE EST GROSSIER, ET IL LE RESTE EXPRÈS. `apports` est une
    # couverture par CATÉGORIES (cf. l'en-tête d'`equilibre.yaml`) : il dit
    # qu'un féculent est coché, jamais combien il y en a dans l'assiette. Les
    # escalopes p. 39 — le plat qui a déclenché tout ce bloc — cochent les trois
    # cases avec 20 g de flocons d'avoine par personne, là où le MÉMO p. 97 de
    # la même autrice en demande 50 à 100 g secs. Elles ne sont donc PAS dans
    # cette liste, et c'est la limite qu'il faut connaître avant de la lire : un
    # zéro ici ne voudrait pas dire que toutes les assiettes sont pleines.
    #
    # Ne pas en faire un avertissement par recette est délibéré. Ce qu'il
    # faudrait écrire — « servir avec du riz » — est une décision du foyer ou
    # une phrase de l'ouvrage, pas quelque chose qu'un vérificateur puisse
    # deviner ; un contrôle qui réclame quarante-trois fois ce qu'il ne sait pas
    # nommer s'apprend à être ignoré.
    creuses = sorted(rid for rid in cibles if rid in cat
                     and not cat[rid].get("avec")
                     and ({"dejeuner", "diner"} & set(cat[rid].get("creneaux")
                                                      or ["dejeuner", "diner"]))
                     and (((cat[rid].get("apports") or {}).get("feculent") in (None, "aucun"))
                          or not (cat[rid].get("apports") or {}).get("legumes")))
    # LE RÔLE, ET CE QU'IL RETIRE DE LA MAIN. Un plat se propose pour un repas
    # s'il tient dans le créneau ET s'il fait un repas ; le second membre
    # n'existait pas. Le compte des deux est la seule façon de voir ce que la
    # règle coûte — 15 cartes le jour où elle est écrite, sur 117.
    par_role = collections.Counter(cat[rid].get("role", "plat") for rid in cibles if rid in cat)
    repas = [rid for rid in cibles if rid in cat
             and ({"dejeuner", "diner"} & set(cat[rid].get("creneaux") or ["dejeuner", "diner"]))]
    hors = [rid for rid in repas if cat[rid].get("role", "plat") != "plat"]
    print("  (" + " · ".join(f"{n} {r}" for r, n in par_role.most_common()) + ")")
    print(f"  ({len(repas)} plats tiennent dans un créneau de repas, dont {len(hors)} "
          f"que leur rôle en écarte)")

    avec = sum(1 for rid in cibles if rid in cat and cat[rid].get("avec"))
    print(f"  ({avec} plats disent avec quoi les servir · {len(creuses)} plats de repas "
          f"sans `avec:` à qui il manque un féculent ou des légumes déclarés)")

    # CE QUE LE FOND PERMET, REMESURÉ À CHAQUE PASSAGE. Le chiffre de départ
    # (2026-10-18, avant les recettes du foyer) : 101 dîners, 4 faisables avec
    # le fond seul et 10 à un ingrédient près. Il n'a pas de seuil — la seule
    # promesse qui rougit est celle des dix dîners, plus haut — mais le
    # lire dit si le corpus va vers le fond ou s'en éloigne.
    if not sys.argv[1:]:
        m = fd.mesure(cat, fd.charger_fond(HERE / "fond.yaml"), rayons)
        print(f"  ({m['diners']} dîners · {m['zero']} se font avec le fond seul · "
              f"{m['un']} à un ingrédient près)")
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
