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
from collections import Counter, OrderedDict
from pathlib import Path

import yaml

import catalogue
import chainage as ch
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
    # then let each day's `emits` land in it, dated that day. It DEPLETES —
    # `prelever` takes what a dish needs and the next dish only finds the rest.
    depot = ch.Stock(stock.get("outputs", []), hh["fridge_window_days"])

    menu, warnings, chained = [], [], []
    manques = []          # shortfalls, turned into sizing offers after the walk
    facteurs = []
    compte_provenance = Counter()
    # (canonical_id, unit) -> {name, qty, recipes}
    basket = OrderedDict()
    to_check = OrderedDict()

    for offset, entry in enumerate(days):
        date = today + dt.timedelta(days=offset)
        r = cat[entry["recipe"]]

        # --- portions: same rule as the compiler (keep the full batch when it keeps)
        base = r["yields"]["portions_eq"]
        keeps_well = any(e.get("keeps", {}).get("congelo") or e["kind"] == "reste-plat"
                         for e in r.get("emits", []))
        factor = 1.0 if (keeps_well and need < base) else need / base
        facteurs.append(factor)

        # --- chaining: take what this dish accepts out of the running stock
        covered = set()
        prises = []
        for acc in r.get("accepts", []):
            pr = depot.prelever(acc, date)
            prises.append(pr)
            if pr.trouve:
                covered.add(ch.libelle_accepts(acc))
                chained.append(f"{r['title']} part de {pr.raconte()} "
                               f"— rien à acheter pour cette base.")
            if pr.couvert or (pr.trouve and pr.approximatif):
                continue

            # Not covered, or covered only in part. A partial cover is the case
            # the token model could not express at all, and it is the common one.
            manque = pr.manque if pr.unite else None
            if manque:
                manques.append({"i": offset, "acc": acc, "manque": manque,
                                "unite": pr.unite, "titre": r["title"],
                                "gain_min": ch.gain_du_chainage(r)})
            if pr.trouve:
                warnings.append(
                    f"{entry['jour'].capitalize()} — {r['title']} réclame "
                    f"{ch.fmt_qte(*ch.quantite(acc))} de "
                    f"« {ch.libelle_accepts(acc)} » et il n'en reste que "
                    f"{ch.fmt_qte(pr.pris, pr.unite)} : il manque "
                    f"{ch.fmt_qte(pr.manque, pr.unite)}.")
            elif acc.get("required"):
                fb = acc.get("fallback_recipe")
                # « rien n'en produit » et « tout est déjà mangé » demandent des
                # gestes opposés — avancer une recette, ou en faire plus. Dire
                # l'un pour l'autre envoie corriger le plan là où il est juste.
                emis_avant = any(
                    any(ch.accepte(e, acc) for e in cat[d["recipe"]].get("emits", []))
                    for d in days[:offset])
                if emis_avant:
                    warnings.append(
                        f"{entry['jour'].capitalize()} — {r['title']} réclame "
                        f"« {ch.libelle_accepts(acc)} » : la semaine en produit, mais "
                        f"tout est déjà consommé quand ce jour arrive. En faire plus "
                        f"en amont (voir plus bas) ou déplacer ce plat.")
                else:
                    warnings.append(
                        f"{entry['jour'].capitalize()} — {r['title']} a besoin du reste "
                        f"« {ch.libelle_accepts(acc)} », que rien ne produit avant ce "
                        f"jour-là. " + (f"Avancer « {fb} » plus tôt dans la semaine."
                                        if fb else
                                        "Ce plat ne se cuisine que sur un reste : il "
                                        "n'a sa place qu'après un plat qui en émet un."))

        # Une seule décision par ligne — d'où elle vient — et le reste en découle.
        # Avant, « c'est un reste » et « c'est du placard » étaient deux tests
        # écrits séparément ici, dans `semaine_model.py` et nulle part dans
        # `compile.py`, qui les affichait donc tous à l'identique.
        for ing in r["ingredients"]:
            cid = canon(ing["id"], aliases)
            prov = ch.provenance(ing, cid, rayons.get("placard", []), prises)
            compte_provenance[prov] += 1
            if prov in ch.HORS_COURSES:
                continue                  # cuisiné, déjà là, ou à cuisiner : pas un achat
            if prov == ch.PLACARD:
                to_check.setdefault(cid, ing["name"])
                continue
            q, u = rc.scale_qty(ing["qty"], ing["unit"], factor)
            key = (cid, u)
            slot = basket.setdefault(key, {"name": ing["name"], "qty": 0, "recipes": []})
            slot["qty"] += q
            slot["recipes"].append(r["title"])

        # --- this dish's own outputs join the running stock for later days.
        # Scaled by the batch: cooking 2× the sauce banks 2× the sauce, which is
        # exactly what makes an over-production offer worth anything.
        for e in r.get("emits", []):
            sortie = dict(e)
            amount, unit = ch.quantite(e)
            if amount is not None:
                sortie["qty"] = {"amount": amount * factor, "unit": unit}
            depot.ajouter(sortie, born=date, source=r["title"], location="frigo")

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
    depart = {id(l) for l in depot.lignes[:len(stock.get("outputs", []))]}
    for o in depot.restant():
        if id(o) not in depart and o.get("_from"):
            continue                      # cooked this week, not "already at home"
        if o.get("location") == "congelo":
            continue
        born = o["born"]
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        age = (today - born).days
        # A partly eaten jar is neither « intact » nor « consumed » — say how
        # much is left, because that is what decides whether it is worth a meal.
        reste = ("" if o.get("_reste") is None
                 else f", il reste {ch.fmt_qte(o['_reste'], o['_unite'])}")
        if age > hh["fridge_window_days"]:
            fridge.append(f"{o['type']} ({o['qty_band']}{reste}) — J-{age}, au-delà de la "
                          f"fenêtre de {hh['fridge_window_days']} j : à vérifier, "
                          f"le plan ne compte plus dessus.")
        else:
            fridge.append(f"{o['type']} ({o['qty_band']}{reste}) — J-{age}, encore bon "
                          f"mais la semaine ne le finit pas.")

    offres = ch.offres_surproduction(manques, days, cat, facteurs)
    return (menu, basket, to_check, warnings, chained, fridge, offres,
            compte_provenance)


def render(menu, basket, to_check, warnings, chained, fridge, offres,
           provenances, rayons, household):
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

    # Le rapport de la semaine : combien de lignes on achète vraiment, et combien
    # étaient déjà là. C'est la mesure de ce que le chaînage rapporte, et elle
    # n'existait pas — la liste de courses ne montre que ce qui reste à payer.
    if provenances:
        total = sum(provenances.values())
        detail = " · ".join(
            f"{provenances[p]} {ch.ETIQUETTES[p]}"
            for p in (ch.COURSES, ch.PLACARD, ch.CHAINE, ch.FRIGO, ch.ABSENT)
            if provenances.get(p))
        out.append(f"D'OÙ VIENT LA SEMAINE — {total} lignes d'ingrédients")
        out.append(f"  {detail}")
        out.append("")

    if fridge:
        out.append("AVANT DE PARTIR — CE QUI EST DÉJÀ AU FRIGO")
        out += [f"  · {f}" for f in fridge]
        out.append("")

    if chained:
        out.append("CE QUE LE CHAÎNAGE ÉVITE D'ACHETER")
        out += [f"  ↪ {c}" for c in chained]
        out.append("")

    # Des propositions, jamais un redimensionnement d'office : cuisiner plus
    # grand engage un saladier, un tiroir de congélo et de l'argent.
    if offres:
        out.append("EN FAIRE PLUS EN AMONT ? (la semaine sait ce qu'elle réclamera)")
        for o in offres:
            out.append(f"  ⤴ {o.phrase()}")
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

    (menu, basket, to_check, warnings, chained, fridge, offres,
     provenances) = plan_week(days, household, rules, stock, rayons, today)
    print(render(menu, basket, to_check, warnings, chained, fridge, offres,
                 provenances, rayons, household))


if __name__ == "__main__":
    sys.exit(main())
