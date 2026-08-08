#!/usr/bin/env python3
"""Recipe compiler prototype — ticket #31.

Compiles a structured recipe against the household (equipment, eaters, exclusions),
tonight's context (time budget, stock of chaining outputs) and global capability
fallback rules, and renders a French guided step-by-step plan.

Usage:
  python3 compile.py burgers-de-lentilles
  python3 compile.py burgers-de-lentilles --time 20        # plan B compression
  python3 compile.py burgers-de-lentilles --no-stock       # the reste is gone
  python3 compile.py burgers-de-lentilles --kids           # monthly kids session
  python3 compile.py lentilles-mijotees
"""

import argparse
import datetime as dt
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent


def load(path):
    return yaml.safe_load(path.read_text())


# ---------------------------------------------------------------- equipment

def owned_tools(household):
    return {eq["id"]: eq for eq in household["equipment"]}


def native_capabilities(household):
    caps = {}
    for eq in household["equipment"]:
        for c in eq["capabilities"]:
            caps.setdefault(c, eq)
    return caps


def resolve_capability(cap, household, rules):
    """Walk the fallback chain for `cap`; return (tool_label, rewrite, time_delta)."""
    native = native_capabilities(household)
    chain = rules["capabilities"].get(cap)
    if chain is None:
        # No chain declared: capability must be native or the step is impossible.
        if cap in native:
            eq = native[cap]
            return eq.get("label", eq["id"]), None, 0
        return None, None, 0
    tools = owned_tools(household)
    for candidate in chain:
        tid = candidate["tool"]
        if tid == "none":
            return None, candidate.get("rewrite"), candidate.get("time_delta_min", 0)
        if tid in tools:
            eq = tools[tid]
            return (eq.get("label", eq["id"]),
                    candidate.get("rewrite"),
                    candidate.get("time_delta_min", 0))
        # tool not owned but capability may be native under this id's caps
        if tid in native:
            eq = native[tid]
            return eq.get("label", eq["id"]), candidate.get("rewrite"), candidate.get("time_delta_min", 0)
    return None, None, 0


# ---------------------------------------------------------------- portions

def household_portions(household):
    return sum(e["portion_eq"] for e in household["eaters"] if e.get("diet") != "baby")


def scale_qty(qty, unit, factor):
    v = qty * factor
    if unit == "g":
        return int(round(v / 10) * 10), unit
    if unit in ("pièce", "c. à s.", "c. à c.", "pincée"):
        r = round(v * 2) / 2
        return (int(r) if r == int(r) else r), unit
    return round(v, 1), unit


# ---------------------------------------------------------------- stock

def stock_has(stock, wanted_type, fridge_window_days, today):
    for out in stock.get("outputs", []):
        if out["type"] != wanted_type:
            continue
        born = out["born"]
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        age = (today - born).days
        if out["location"] == "congelo" or age <= fridge_window_days:
            return out, age
    return None, None


# ---------------------------------------------------------------- compilation

def compile_recipe(recipe_id, household, rules, stock, time_budget=None,
                   kids_mode=False, today=None):
    today = today or dt.date.today()
    r = load(HERE / "recipes" / f"{recipe_id}.yaml")["recipe"]
    hh = household["household"]
    notes, prelude, steps_out = [], [], []

    # --- chaining: accepts against stock (#30)
    scale_base = r["yields"]["portions_eq"]
    for acc in r.get("accepts", []):
        out, age = stock_has(stock, acc["type"], hh["fridge_window_days"], today)
        if out:
            loc = "au frigo" if out["location"] == "frigo" else "au congélo"
            notes.append(f"✔ Reste disponible : {acc['type']} ({out['qty_band']}, "
                         f"{loc}, J-{age}) — la recette démarre directement dessus.")
        elif acc.get("required"):
            fb = acc.get("fallback_recipe")
            prelude.append(
                f"Il manque le reste « {acc['type']} » : prévoir la recette "
                f"« {fb} » en amont (ou la veille — elle mijote toute seule), "
                f"ou remonter d'un cran dans le plan de la semaine.")

    # --- portions: household need vs full batch (chaining bias)
    need = household_portions(hh)
    keeps_well = any(e.get("keeps", {}).get("congelo") or e["kind"] == "reste-plat"
                     for e in r.get("emits", []))
    if keeps_well and need < scale_base:
        factor = 1.0
        notes.append(f"Portions : besoin du foyer {need:g} éq., recette pour "
                     f"{scale_base:g} éq. — on garde la quantité entière, le surplus "
                     f"est une sortie planifiée (lunchbox/congélo), pas un reste subi.")
    else:
        factor = need / scale_base
        notes.append(f"Portions : recette ramenée de {scale_base:g} à {need:g} éq. adulte.")

    ingredients = []
    for ing in r["ingredients"]:
        q, u = scale_qty(ing["qty"], ing["unit"], factor)
        line = f"{q} {u} — {ing['name']}"
        if ing.get("from_accepts"):
            line += "  (le reste)"
        subs = ing.get("subs") or []
        if subs:
            line += f"  [à défaut : {subs[0]['name']} — {subs[0]['note']}]"
        ingredients.append(line)

    # --- steps: equipment resolution, plan B, baby set-aside, kid annotations
    plan_b_applied = []
    steps = list(r["steps"])

    has_baby = any(e.get("diet") == "baby" for e in hh["eaters"])
    baby_extra = 3 if has_baby and r.get("baby_portion") else 0

    def eff_time(s):
        t = s["time_min"]
        for cap in s.get("needs", []):
            _, _, delta = resolve_capability(cap, hh, rules)
            t += delta
        return t

    def plan_total(ss):
        return sum(eff_time(s) for s in ss if not s.get("parallel_with")) + baby_extra

    total = plan_total(steps)
    if time_budget and total > time_budget:
        for pb in r.get("plan_b", []):
            if total <= time_budget:
                break
            if "drop" in pb:
                steps = [s for s in steps if s["id"] != pb["drop"]]
                plan_b_applied.append(f"étape « {pb['drop']} » sautée (−{pb['saves_min']} min) : {pb['effect']}")
            elif "swap" in pb:
                idx = [x["id"] for x in steps].index(pb["swap"]["step"])
                s = dict(steps[idx])
                s["action"] = pb["swap"]["action"]
                s["time_min"] -= pb["swap"]["saves_min"]
                steps[idx] = s
                plan_b_applied.append(
                    f"étape « {pb['swap']['step']} » simplifiée (−{pb['swap']['saves_min']} min) : {pb['effect']}")
            total = plan_total(steps)
        if total > time_budget:
            notes.append(f"⚠ Même en plan B il faut {total} min (budget {time_budget}) — "
                         f"ce soir, c'est un créneau pour une portion maison du congélo.")

    eldest_months = max((e["age_months"] for e in hh["eaters"] if e["kind"] == "toddler"),
                        default=None)

    n = 0
    for s in steps:
        if s.get("seasoning_gate") and has_baby and r.get("baby_portion"):
            bp = r["baby_portion"]
            n += 1
            _, rw, _ = resolve_capability(bp["needs"][0], hh, rules) if bp.get("needs") else (None, None, 0)
            prep = bp["prep"] + (f" ({rw})" if rw else "")
            steps_out.append(f"{n}. Portion bébé, avant d'assaisonner : prélever "
                             f"{bp['take']} ; {prep}  ⏱ 3 min")
        n += 1
        time = s["time_min"]
        tool_txt = ""
        impossible = False
        for cap in s.get("needs", []):
            label, rewrite, delta = resolve_capability(cap, hh, rules)
            if label is None and rewrite is None:
                impossible = True
                continue
            time += delta
            if rewrite:
                tool_txt = f" — {rewrite}"
            elif label:
                tool_txt = f" — {label}"
        line = f"{n}. {s['action']}{tool_txt}  ⏱ {time} min"
        if s.get("parallel_with"):
            line += "  (en parallèle de l'étape précédente)"
        if not s.get("attended", True) is True and s.get("attended") is False:
            line += "  — sans surveillance"
        if impossible:
            line += "  ⚠ aucune solution avec l'équipement du foyer"
        if kids_mode and s.get("kid") and eldest_months and eldest_months >= s["kid"]["age_min_months"]:
            line += f"\n   👶 avec le grand : {s['kid']['task']}"
        steps_out.append(line)

    emits_out = []
    for e in r.get("emits", []):
        dest = []
        if e.get("keeps", {}).get("frigo_days"):
            dest.append(f"frigo {e['keeps']['frigo_days']} j")
        if e.get("keeps", {}).get("congelo"):
            dest.append("congélo (tiroir « plats maison » — sortie planifiée à programmer)")
        emits_out.append(f"{e['type']} ({e['kind']}, {e['qty_band']}) → {' ou '.join(dest)}"
                         + (f" — {e['note']}" if e.get("note") else ""))

    # --- render
    out = [f"═══ {r['title']} ═══"]
    if r.get("source"):
        out.append(f"D'après {r['source']['author']}, {r['source']['work']} (recette reformulée).")
    out.append(f"Compilé pour : {hh['name']} — {today.strftime('%d/%m/%Y')}"
               + (f" — budget {time_budget} min" if time_budget else "")
               + (" — session enfants" if kids_mode else ""))
    out.append("")
    if prelude:
        out.append("AVANT DE COMMENCER :")
        out += [f"  ⚠ {p}" for p in prelude]
        out.append("")
    if notes:
        out += [f"• {x}" for x in notes]
        out.append("")
    if plan_b_applied:
        out.append("PLAN B APPLIQUÉ :")
        out += [f"  ↯ {x}" for x in plan_b_applied]
        out.append("")
    out.append("INGRÉDIENTS :")
    out += [f"  {i}" for i in ingredients]
    out.append("")
    out.append("ÉTAPES :")
    out += [f"  {s}" for s in steps_out]
    out.append("")
    out.append(f"Temps total estimé : {total} min")
    if emits_out:
        out.append("")
        out.append("EN SORTIE (à consigner dans le stock) :")
        out += [f"  ↪ {e}" for e in emits_out]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("recipe")
    ap.add_argument("--time", type=int, default=None)
    ap.add_argument("--kids", action="store_true")
    ap.add_argument("--no-stock", action="store_true")
    ap.add_argument("--today", default="2026-08-08")
    args = ap.parse_args()

    household = load(HERE / "household.yaml")
    rules = load(HERE / "rules.yaml")
    stock = {"outputs": []} if args.no_stock else load(HERE / "stock.yaml")
    today = dt.date.fromisoformat(args.today)

    print(compile_recipe(args.recipe, household, rules, stock,
                         time_budget=args.time, kids_mode=args.kids, today=today))


if __name__ == "__main__":
    sys.exit(main())
