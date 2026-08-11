"""Week-building state model — the portable half of the week-builder prototype.

THE QUESTION THIS ANSWERS
-------------------------
`plan.py` takes a week that a human already decided and prices it. That is the
easy half, and it is the half that made the user say: *you chose the dishes for
me, I want to choose*. So the real question is the one before it:

    When I build the week one dish at a time, what must the app show me after
    every single choice, so that choosing feels informed rather than blind?

The bet under test is that the useful feedback is **marginal, not total**. A
shopping list of 17 lines tells you nothing while you are choosing. What tells
you something is: *this dish adds 2 lines, that one adds 6, and this third one
adds 0 because Tuesday already cooked its base.* Whether that framing actually
helps — or whether it quietly turns dinner into an optimisation game and starves
the variety of the week — is exactly what driving this by hand should reveal.

This module is pure: no I/O, no printing, no terminal. `semaine_tui.py` loads the
YAML, holds the loop, and calls in here. Nothing flows the other way, so the
functions below are what lifts into the real app once the question is settled.
"""

import datetime as dt
from dataclasses import dataclass, replace
from typing import Optional

# Ranking modes the offer can be sorted by. Which of these deserves to be the
# default is a live design question — cycling them is the point of the probe.
MODES = ("courses", "temps", "frigo", "varie")

COUNTABLE = ("pièce", "gousse")


@dataclass(frozen=True)
class Contexte:
    """Everything static: the catalogue and the household it compiles against."""
    catalogue: dict          # recipe_id -> recipe dict
    foyer: dict              # household["household"]
    stock: dict              # {"outputs": [...]}
    rayons: dict
    today: dt.date
    jours: tuple             # ("mardi", "mercredi", ...)


@dataclass(frozen=True)
class Etat:
    """Everything the user has decided. A week is a tuple of slots."""
    choix: tuple             # Optional[recipe_id] per day
    jour: int                # the day currently being filled
    budgets: tuple           # Optional[int] minutes per day
    mode: str = "courses"


# --------------------------------------------------------------- construction

def etat_initial(ctx: Contexte) -> Etat:
    n = len(ctx.jours)
    return Etat(choix=(None,) * n, jour=0, budgets=(None,) * n)


def reduire(ctx: Contexte, etat: Etat, action) -> Etat:
    """(ctx, state, action) -> state. Pure; unknown actions are a no-op."""
    kind, *args = action

    if kind == "choisir":
        choix = list(etat.choix)
        choix[etat.jour] = args[0]
        etat = replace(etat, choix=tuple(choix))
        return _avancer(etat)

    if kind == "vider":
        choix = list(etat.choix)
        choix[etat.jour] = None
        return replace(etat, choix=tuple(choix))

    if kind == "jour":
        i = args[0]
        return replace(etat, jour=i % len(etat.choix)) if etat.choix else etat

    if kind == "budget":
        b = list(etat.budgets)
        b[etat.jour] = args[0]
        return replace(etat, budgets=tuple(b))

    if kind == "mode":
        return replace(etat, mode=args[0] if args[0] in MODES else etat.mode)

    if kind == "remplir":
        # Fill every empty slot with whatever the offer ranks first. Exists to
        # be compared against choosing by hand — not because it is the answer.
        cur = etat
        for i in range(len(cur.choix)):
            if cur.choix[i] is None:
                cur = replace(cur, jour=i)
                o = offre(ctx, cur)
                if o:
                    c = list(cur.choix)
                    c[i] = o[0]["id"]
                    cur = replace(cur, choix=tuple(c))
        return replace(cur, jour=etat.jour)

    if kind == "vider-tout":
        return etat_initial(ctx)

    return etat


def _avancer(etat: Etat) -> Etat:
    """After a pick, land on the next empty day — the natural build loop."""
    n = len(etat.choix)
    for step in range(1, n + 1):
        i = (etat.jour + step) % n
        if etat.choix[i] is None:
            return replace(etat, jour=i)
    return etat


# --------------------------------------------------------------- derived view

def _date(ctx: Contexte, i: int) -> dt.date:
    return ctx.today + dt.timedelta(days=i)


def _canon(ing_id, rayons):
    return rayons.get("aliases", {}).get(ing_id, ing_id)


def _stock_has(outputs, wanted_type, window_days, on_date):
    for out in outputs:
        if out["type"] != wanted_type:
            continue
        born = out["born"]
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        age = (on_date - born).days
        if out.get("location") == "congelo" or age <= window_days:
            return out, age
    return None, None


def _portions_foyer(foyer):
    return sum(e["portion_eq"] for e in foyer["eaters"] if e.get("diet") != "baby")


def _facteur(recipe, besoin):
    base = recipe["yields"]["portions_eq"]
    keeps = any(e.get("keeps", {}).get("congelo") or e["kind"] == "reste-plat"
                for e in recipe.get("emits", []))
    return 1.0 if (keeps and besoin < base) else besoin / base


def _echelle(qty, unit, factor):
    v = qty * factor
    if unit == "g":
        return int(round(v / 10) * 10)
    if unit in ("pièce", "c. à s.", "c. à c.", "pincée", "gousse"):
        r = round(v * 2) / 2
        return int(r) if r == int(r) else r
    return round(v, 1)


def calculer(ctx: Contexte, choix: tuple) -> dict:
    """The whole derived state of a (possibly partial) week. Pure.

    Returns the basket, what the cupboard should be checked for, the chaining
    edges that actually fired, the problems, and the leftover fridge stock.
    """
    besoin = _portions_foyer(ctx.foyer)
    window = ctx.foyer["fridge_window_days"]
    placard = ctx.rayons.get("placard", [])

    running = [dict(o) for o in ctx.stock.get("outputs", [])]
    panier, a_verifier = {}, {}
    chaine, problemes, ecoule = [], [], set()

    for i, rid in enumerate(choix):
        if rid is None:
            continue
        r = ctx.catalogue[rid]
        date = _date(ctx, i)

        for acc in r.get("accepts", []):
            out, age = _stock_has(running, acc["type"], window, date)
            if out:
                src = out.get("_from")
                chaine.append({"jour": i, "type": acc["type"], "depuis": src,
                               "age": age})
                if src is None:
                    ecoule.add(acc["type"])
            elif acc.get("required"):
                problemes.append({
                    "jour": i, "titre": r["title"], "type": acc["type"],
                    "fix": acc.get("fallback_recipe"),
                })

        factor = _facteur(r, besoin)
        for ing in r["ingredients"]:
            if ing.get("from_accepts"):
                continue
            cid = _canon(ing["id"], ctx.rayons)
            if cid in placard:
                a_verifier[cid] = ing["name"]
                continue
            q = _echelle(ing["qty"], ing["unit"], factor)
            key = (cid, ing["unit"])
            slot = panier.setdefault(key, {"name": ing["name"], "qty": 0, "n": 0})
            slot["qty"] += q
            slot["n"] += 1

        for e in r.get("emits", []):
            running.append({"type": e["type"], "kind": e["kind"],
                            "qty_band": e["qty_band"], "born": date,
                            "location": "frigo", "_from": rid})

    frigo = []
    for o in ctx.stock.get("outputs", []):
        if o["type"] in ecoule or o.get("location") == "congelo":
            continue
        born = o["born"]
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        age = (ctx.today - born).days
        frigo.append({"type": o["type"], "band": o["qty_band"], "age": age,
                      "perime": age > window})

    return {"panier": panier, "placard": a_verifier, "chaine": chaine,
            "problemes": problemes, "frigo": frigo}


# ------------------------------------------------------------------- the offer

def offre(ctx: Contexte, etat: Etat) -> list:
    """Candidate dishes for the selected day, each priced in *marginal* terms.

    The marginal cost is the whole idea: how many NEW shopping lines does this
    dish add, given everything already chosen? A dish whose base was cooked on
    an earlier day, or whose vegetables another dish already needs, is cheap in
    a way no recipe page can tell you.
    """
    base = calculer(ctx, etat.choix)
    n_base = len(base["panier"])
    deja = {r for r in etat.choix if r}
    budget = etat.budgets[etat.jour]
    date = _date(ctx, etat.jour)
    window = ctx.foyer["fridge_window_days"]

    lignes = []
    for rid, r in ctx.catalogue.items():
        if rid in deja:
            continue
        essai = list(etat.choix)
        essai[etat.jour] = rid
        apres = calculer(ctx, tuple(essai))

        # Did placing it here actually resolve its own chaining need?
        chaine_ici = [c for c in apres["chaine"] if c["jour"] == etat.jour]
        manque_ici = [p for p in apres["problemes"] if p["jour"] == etat.jour]

        # Does it eat something already sitting in the fridge?
        ecoule = []
        for acc in r.get("accepts", []):
            out, age = _stock_has(ctx.stock.get("outputs", []), acc["type"],
                                  window, date)
            if out:
                ecoule.append(acc["type"])

        minutes = r.get("time_min_total", 0)
        lignes.append({
            "id": rid,
            "titre": r["title"],
            "minutes": minutes,
            "marginal": len(apres["panier"]) - n_base,
            "chaine": bool(chaine_ici),
            "depuis": chaine_ici[0]["depuis"] if chaine_ici else None,
            "manque": manque_ici[0] if manque_ici else None,
            "ecoule": ecoule,
            "hors_budget": bool(budget and minutes > budget),
            "emits": [e["type"] for e in r.get("emits", [])],
        })

    return _trier(lignes, etat.mode)


def _trier(lignes, mode):
    if mode == "temps":
        cle = lambda l: (l["hors_budget"], l["minutes"], l["marginal"])
    elif mode == "frigo":
        cle = lambda l: (not l["ecoule"], not l["chaine"], l["marginal"])
    elif mode == "varie":
        # Deliberately the mirror image of "courses": prefer the dish that
        # shares the LEAST with the week so far. If the marginal-cost framing
        # is quietly flattening the week into cheap repetition, comparing these
        # two orders back to back is what will expose it.
        cle = lambda l: (-l["marginal"], l["minutes"])
    else:  # courses
        cle = lambda l: (l["manque"] is not None, l["hors_budget"],
                         l["marginal"], l["minutes"])
    return sorted(lignes, key=cle)


# --------------------------------------------------------------- presentation

def articles(panier: dict) -> list:
    """Basket -> flat, aisle-ordered shopping lines. Countables round up."""
    import math
    out = []
    for (cid, unit), slot in panier.items():
        q = slot["qty"]
        if unit in COUNTABLE:
            q = math.ceil(float(q) - 1e-9)
        q = int(q) if float(q) == int(q) else round(float(q), 1)
        out.append({"id": cid, "nom": slot["name"], "qty": q, "unit": unit,
                    "plats": slot["n"]})
    return out


def par_rayon(ctx: Contexte, panier: dict) -> list:
    """[(rayon, [article, ...])] in the order you walk the shop."""
    table = ctx.rayons["rayons"]
    arts = articles(panier)
    groupes, vus = [], set()
    for rayon in ctx.rayons["ordre"]:
        dedans = [a for a in arts if a["id"] in table.get(rayon, [])]
        if dedans:
            vus.update(a["id"] for a in dedans)
            groupes.append((rayon, sorted(dedans, key=lambda a: a["nom"])))
    orphelins = [a for a in arts if a["id"] not in vus]
    if orphelins:
        groupes.append(("non classé", orphelins))
    return groupes


def minutes_semaine(ctx: Contexte, choix: tuple) -> int:
    return sum(ctx.catalogue[r].get("time_min_total", 0) for r in choix if r)
