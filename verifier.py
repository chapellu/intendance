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

import re
import sys
from pathlib import Path

import catalogue
import compile as rc  # shadows the builtin `compile` in this module only

HERE = Path(__file__).parent

BANDES = {"1-repas", "2-repas", "3-repas", "lunchbox"}
MOTS_ASSAISONNEMENT = re.compile(r"\bsel\b|sal|poivr|assaisonn|rectifi", re.I)


def verifier(rid: str, r: dict, rayons: dict, rules: dict, cat: dict, capacites: set) -> tuple:
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
        vus.append(s["id"])

    # Ingrédients : tout id doit avoir un rayon, sinon il tombe en « NON CLASSÉ ».
    for ing in r.get("ingredients", []) + r.get("sans_reste", {}).get("ingredients", []):
        if ing.get("from_accepts"):
            continue
        cid = alias.get(ing["id"], ing["id"])
        if cid not in ids_connus:
            err.append(f"ingrédient « {cid} » sans rayon (à ajouter dans rayons.yaml)")

    # Chaînage. Un `accepts` demande soit un `type:` exact (« sauce-bolognaise »),
    # soit un `kind:`, c'est-à-dire une CLASSE de sorties (« n'importe quel
    # reste-plat »). Les trois lecteurs passent maintenant par `rc.accepte`.
    for acc in r.get("accepts", []):
        libelle = rc.libelle_accepts(acc)
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

    # Le prélèvement bébé et sa porte.
    portes = [s for s in etapes if s.get("seasoning_gate")]
    if r.get("baby_portion"):
        if not portes:
            err.append("baby_portion sans seasoning_gate : le prélèvement ne sera jamais injecté")
        elif len(portes) > 1:
            err.append(f"{len(portes)} seasoning_gate : le prélèvement serait injecté plusieurs fois")
        else:
            g = portes[0]
            # L'erreur commise trois fois : une porte posée sur l'étape qui
            # FABRIQUE le mélange. Le signe mécanique est qu'elle dure trop
            # longtemps pour ne faire que saler.
            if g.get("time_min", 0) > 2:
                warn.append(f"seasoning_gate sur « {g['id']} » ({g['time_min']} min) : une étape qui ne fait "
                            "que saler est courte. Si elle fabrique aussi le mélange, le prélèvement bébé "
                            "sera injecté AVANT que ce mélange existe — scinder en deux étapes.")
            if not MOTS_ASSAISONNEMENT.search(g.get("action", "")):
                warn.append(f"seasoning_gate sur « {g['id']} » : l'action ne parle pas d'assaisonnement")

    # Une source doit être RETROUVABLE, pas forcément paginée : un livre se cite
    # par sa page, un billet de blog par son URL.
    src = r.get("source")
    if src and not (src.get("page") or src.get("url")):
        warn.append("bloc source sans numéro de page ni URL : la recette n'est pas retrouvable")
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

    cibles = sys.argv[1:] or sorted(cat)
    n_err = n_warn = 0
    for rid in cibles:
        if rid not in cat:
            print(f"✗ {rid} : absent du catalogue")
            n_err += 1
            continue
        err, warn = verifier(rid, cat[rid], rayons, rules, cat, capacites)
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
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
