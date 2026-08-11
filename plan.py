#!/usr/bin/env python3
"""Week planner + shopping list — extends the recipe compiler (ticket #31).

`compile.py` answers "what do I cook tonight". This answers the question that
comes *before* it, and that is the one you cannot do in your head: given a week
of dishes, what do I actually have to buy?

The interesting part is not the arithmetic, it is the chaining. Walking the
days forward, a dish that `emits` a base feeds a later dish that `accepts` it,
so the accepted item never reaches the shopping list. That is the whole point
of storing recipes as data: the list shrinks because the planner understands
that Wednesday eats what Tuesday made.

Usage:
  python3 plan.py                                  # the week in semaine.yaml
  python3 plan.py --today 2026-08-11               # plan from a given date
  python3 plan.py lentilles-mijotees omelette-...  # an ad-hoc list of dishes
"""

import argparse
import datetime as dt
import math
import sys
from collections import OrderedDict
from pathlib import Path

import yaml

import catalogue
import compile as rc  # shadows the builtin `compile` in this module only

HERE = Path(__file__).parent
JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


# Units you buy as whole objects. A list that says "7.5 oignons" is a list you
# argue with in the shop, so these round *up* once the week is totalled — the
# half onion is a kitchen quantity, not a shopping one.
COUNTABLE = ("pièce", "gousse")


def fmt(q, unit=None):
    """Round countables up, then drop the trailing .0."""
    if unit in COUNTABLE:
        q = math.ceil(float(q) - 1e-9)
    return int(q) if float(q) == int(q) else round(float(q), 1)


def canon(ing_id, aliases):
    return aliases.get(ing_id, ing_id)


def plan_week(days, household, rules, stock, rayons, today, cat=None):
    cat = cat if cat is not None else catalogue.charger_recettes(HERE / "recipes")
    hh = household["household"]
    need = rc.household_portions(hh)
    aliases = rayons.get("aliases", {})

    # Stock evolves as the week is cooked: start from what is in the fridge,
    # then let each day's `emits` land in it, dated that day.
    running = [dict(o) for o in stock.get("outputs", [])]

    menu, warnings, chained = [], [], []
    used_from_fridge = set()
    # (canonical_id, unit) -> {name, qty, recipes}
    basket = OrderedDict()
    to_check = OrderedDict()

    for offset, entry in enumerate(days):
        date = today + dt.timedelta(days=offset)
        r = cat[entry["recipe"]]

        # --- chaining: does an earlier dish (or the fridge) cover what this accepts?
        covered = set()
        for acc in r.get("accepts", []):
            out, age = rc.stock_has({"outputs": running}, acc["type"],
                                    hh["fridge_window_days"], date)
            if out:
                covered.add(acc["type"])
                src = out.get("_from")
                if src:
                    chained.append(f"{r['title']} part du reste de « {src} » "
                                   f"— rien à acheter pour cette base.")
                else:
                    used_from_fridge.add(acc["type"])
                    chained.append(f"{r['title']} part d'un reste déjà au frigo "
                                   f"({acc['type']}, J-{age}).")
            elif acc.get("required"):
                warnings.append(
                    f"{entry['jour'].capitalize()} — {r['title']} a besoin du reste "
                    f"« {acc['type']} », que rien ne produit avant ce jour-là. "
                    f"Avancer « {acc.get('fallback_recipe')} » plus tôt dans la semaine.")

        # --- portions: same rule as the compiler (keep the full batch when it keeps)
        base = r["yields"]["portions_eq"]
        keeps_well = any(e.get("keeps", {}).get("congelo") or e["kind"] == "reste-plat"
                         for e in r.get("emits", []))
        factor = 1.0 if (keeps_well and need < base) else need / base

        for ing in r["ingredients"]:
            # An accepted base is cooked, not bought — never a shopping line.
            if ing.get("from_accepts"):
                continue
            cid = canon(ing["id"], aliases)
            if cid in rayons.get("placard", []):
                to_check.setdefault(cid, ing["name"])
                continue
            q, u = rc.scale_qty(ing["qty"], ing["unit"], factor)
            key = (cid, u)
            slot = basket.setdefault(key, {"name": ing["name"], "qty": 0, "recipes": []})
            slot["qty"] += q
            slot["recipes"].append(r["title"])

        # --- this dish's own outputs join the running stock for later days
        for e in r.get("emits", []):
            running.append({"type": e["type"], "kind": e["kind"],
                            "qty_band": e["qty_band"], "born": date,
                            "location": "frigo", "_from": r["title"]})

        menu.append({
            "jour": entry["jour"], "date": date, "titre": r["title"],
            "minutes": r.get("time_min_total"),
            "reste": bool(covered),
            "emits": [e["type"] for e in r.get("emits", [])],
        })

    # What is already in the fridge and the plan does not touch. Worth saying
    # out loud *before* leaving: the cheapest item on any shopping list is the
    # one already at home, and the second cheapest is the one you throw away
    # knowingly rather than discovering next week.
    fridge = []
    for o in stock.get("outputs", []):
        if o["type"] in used_from_fridge or o.get("location") == "congelo":
            continue
        born = o["born"]
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        age = (today - born).days
        if age > hh["fridge_window_days"]:
            fridge.append(f"{o['type']} ({o['qty_band']}) — J-{age}, au-delà de la "
                          f"fenêtre de {hh['fridge_window_days']} j : à vérifier, "
                          f"le plan ne compte plus dessus.")
        else:
            fridge.append(f"{o['type']} ({o['qty_band']}) — J-{age}, encore bon "
                          f"mais aucun plat de la semaine ne le consomme.")

    return menu, basket, to_check, warnings, chained, fridge


def render(menu, basket, to_check, warnings, chained, fridge, rayons, household):
    hh = household["household"]
    out = []
    out.append("═══ COURSES — semaine du "
               f"{menu[0]['date'].strftime('%d/%m')} au {menu[-1]['date'].strftime('%d/%m/%Y')} ═══")
    out.append(f"Foyer {hh['name']} — {rc.household_portions(hh):g} parts adulte par repas "
               f"(+ portion bébé prélevée à chaque plat)")
    out.append("")

    out.append("MENU")
    for m in menu:
        marks = []
        if m["reste"]:
            marks.append("part d'un reste")
        if m["emits"]:
            marks.append("→ " + ", ".join(m["emits"]))
        tail = f"   ({' · '.join(marks)})" if marks else ""
        out.append(f"  {m['jour'].capitalize():<10} {m['date'].strftime('%d/%m')}  "
                   f"{m['titre']}  ⏱ {m['minutes']} min{tail}")
    out.append("")

    if warnings:
        out.append("⚠ À CORRIGER DANS LE PLAN")
        out += [f"  · {w}" for w in warnings]
        out.append("")

    out.append("LISTE DE COURSES")
    by_rayon = rayons["rayons"]
    seen = set()
    for rayon in rayons["ordre"]:
        lines = []
        for (cid, unit), slot in basket.items():
            if cid in by_rayon.get(rayon, []):
                seen.add((cid, unit))
                lines.append(f"    ☐ {fmt(slot['qty'], unit)} {unit} — {slot['name']}"
                             + (f"   ({len(slot['recipes'])} plats)" if len(slot["recipes"]) > 1 else ""))
        if lines:
            out.append(f"  {rayon.upper()}")
            out += sorted(lines)
    orphans = [(k, v) for k, v in basket.items() if k not in seen]
    if orphans:
        out.append("  NON CLASSÉ (à ajouter dans rayons.yaml)")
        out += [f"    ☐ {fmt(v['qty'], k[1])} {k[1]} — {v['name']}" for k, v in orphans]
    out.append("")

    if to_check:
        out.append("À VÉRIFIER AU PLACARD (pas d'achat sauf si vide)")
        out.append("  " + " · ".join(sorted(to_check.values())))
        out.append("")

    if fridge:
        out.append("AVANT DE PARTIR — CE QUI EST DÉJÀ AU FRIGO")
        out += [f"  · {f}" for f in fridge]
        out.append("")

    if chained:
        out.append("CE QUE LE CHAÎNAGE ÉVITE D'ACHETER")
        out += [f"  ↪ {c}" for c in chained]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("recipes", nargs="*", help="dish ids; default = semaine.yaml")
    ap.add_argument("--today", default=None)
    args = ap.parse_args()

    household = rc.load(HERE / "household.yaml")
    rules = rc.load(HERE / "rules.yaml")
    stock = rc.load(HERE / "stock.yaml")
    rayons = rc.load(HERE / "rayons.yaml")
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()

    if args.recipes:
        days = [{"jour": JOURS[(today.weekday() + i) % 7], "recipe": rid}
                for i, rid in enumerate(args.recipes)]
    else:
        days = rc.load(HERE / "semaine.yaml")["semaine"]

    menu, basket, to_check, warnings, chained, fridge = plan_week(
        days, household, rules, stock, rayons, today)
    print(render(menu, basket, to_check, warnings, chained, fridge,
                 rayons, household))


if __name__ == "__main__":
    sys.exit(main())
