"""La saisonnalité, et la règle qui découle de ce qu'elle ignore.

UNE SEULE DÉCISION EST PRISE ICI, ET C'EST LA BONNE MOITIÉ DU SUJET :

    on PÉNALISE le hors-saison avéré, on ne RÉCOMPENSE jamais l'en-saison.

Ce n'est pas de la prudence, c'est une conséquence de la donnée. Le calendrier
couvre 27 ingrédients sur les 57 du rayon primeur que les recettes utilisent —
c'est un calendrier de potager, sans aucun fruit et sans les courgettes.
Récompenser l'en-saison ferait donc gagner la tomate d'août contre la courgette
d'août, non parce que l'une est plus de saison, mais parce qu'on connaît l'une et
pas l'autre. Le classement refléterait les trous de sa source.

La pénalité n'a pas ce défaut. Elle ne se déclenche que là où on SAIT, et ce
qu'on sait alors est vrai : une tomate en janvier n'est pas de saison. Un
ingrédient absent du fichier n'est jamais pénalisé — neutre, ce qui est
exactement ce qu'on sait de lui.

Et c'est la moitié utile : personne n'a besoin qu'on lui vante la tomate en
août. Ce qu'une app peut apporter, c'est de ne pas la proposer en février.
"""

from pathlib import Path

import yaml


def charger(chemin: Path) -> dict:
    d = yaml.safe_load(chemin.read_text()) or {}
    return {
        "source": d.get("source") or {},
        "recoltes": d.get("recoltes") or {},
        "sans_source": d.get("sans_source") or {},
    }


def se_garde(ing_id: str, recoltes: dict) -> bool:
    """Survit-il à sa récolte ? Alors on ne le pénalise jamais.

    RÉCOLTE N'EST PAS DISPONIBILITÉ. L'oignon se récolte de mai à août et se
    mange toute l'année ; le punir en février punissait 56 plats sur 64, dont
    les lentilles paysannes. Une app qui déconseille l'oignon en hiver n'est pas
    rigoureuse, elle est inutilisable.
    """
    return bool((recoltes.get(ing_id) or {}).get("se_garde"))


def de_saison(ing_id: str, mois: int, recoltes: dict):
    """`True` de saison, `False` hors saison, `None` quand on ne sait pas.

    LES TROIS ÉTATS SONT NÉCESSAIRES, et `None` est celui qui compte. Réduire à
    un booléen ferait de « je ne sais pas » un « ce n'est pas de saison », donc
    une pénalité sur trente ingrédients dont la courgette et toutes les fraises.
    """
    e = recoltes.get(ing_id)
    if not e:
        return None
    return mois in (e.get("mois") or [])


def hors_saison(ingredients, mois: int, recoltes: dict, aliases=None) -> list:
    """Les ingrédients d'un plat dont on SAIT qu'ils ne sont pas de saison.

    `ingredients` est une suite de dicts d'ingrédient de recette. Les lignes de
    base (`from_accepts`) sont ignorées : elles réclament une chose cuisinée, pas
    un produit du marché, et le chaînage a déjà ses propres poids.
    """
    aliases = aliases or {}
    vus, out = set(), []
    for ing in ingredients:
        if ing.get("from_accepts") or ing.get("base"):
            continue
        cid = aliases.get(ing["id"], ing["id"])
        if cid in vus:
            continue
        vus.add(cid)
        if se_garde(cid, recoltes):
            continue
        if de_saison(cid, mois, recoltes) is False:
            out.append(cid)
    return out


def verifier_saisons(sais: dict, rayons: dict) -> tuple:
    """Le fichier se vérifie comme le reste : un id inconnu est une ligne morte."""
    err, warn = [], []
    connus = {i for v in rayons["rayons"].values() for i in v} | set(rayons.get("placard") or [])
    for cid, e in (sais["recoltes"] or {}).items():
        ou = f"recoltes.{cid}"
        if cid not in connus:
            err.append(f"{ou} : ingrédient sans rayon (à ajouter dans rayons.yaml)")
        mois = e.get("mois") or []
        if not mois:
            err.append(f"{ou} : aucune fenêtre de récolte — une entrée vide ne dit rien "
                       "et vaut moins que pas d'entrée du tout")
        if any(not isinstance(m, int) or not 1 <= m <= 12 for m in mois):
            err.append(f"{ou} : mois hors de 1..12 — {mois}")
        if len(set(mois)) != len(mois):
            err.append(f"{ou} : mois répété — {mois}")
        if not e.get("ligne"):
            warn.append(f"{ou} : pas de `ligne` — on ne pourra pas retourner vérifier "
                        "d'où sort cette fenêtre")
        if len(mois) == 12:
            warn.append(f"{ou} : récolté toute l'année, donc jamais hors saison. "
                        "L'entrée est inerte pour le score ; c'est peut-être juste, "
                        "mais ça vaut d'être relu sur la fiche.")
    for groupe, ids in (sais["sans_source"] or {}).items():
        for cid in ids or []:
            if cid in (sais["recoltes"] or {}):
                err.append(f"sans_source.{groupe} : « {cid} » est aussi dans `recoltes` — "
                           "il ne peut pas être à la fois su et inconnu")
            if cid not in connus:
                warn.append(f"sans_source.{groupe} : « {cid} » n'est dans aucun rayon")
    return err, warn
