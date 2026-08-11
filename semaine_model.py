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
from collections import Counter
from dataclasses import dataclass, replace

# Ranking modes. `equilibre` is the default: the user asked for dishes that
# "complete the intake while varying the pleasures and respect the chains",
# which is a different objective from the cheapest possible shopping list.
# `courses` is kept as its rival so the two can be compared side by side.
MODES = ("equilibre", "courses", "temps", "frigo", "varie")

COUNTABLE = ("pièce", "gousse")


@dataclass(frozen=True)
class Contexte:
    """Everything static: the catalogue and the household it compiles against."""
    catalogue: dict          # recipe_id -> recipe dict
    foyer: dict              # household["household"]
    stock: dict              # {"outputs": [...]}
    rayons: dict
    equilibre: dict          # targets + weights
    today: dt.date
    jours: tuple             # ("mardi", "mercredi", ...)


@dataclass(frozen=True)
class Etat:
    """Everything the user has decided. A week is a tuple of slots."""
    choix: tuple             # Optional[recipe_id] per day
    jour: int                # the day currently being filled
    budgets: tuple           # Optional[int] minutes per day
    mulligans: tuple = ()    # how many times each day's hand was redealt
    mode: str = "equilibre"


# --------------------------------------------------------------- construction

def etat_initial(ctx: Contexte) -> Etat:
    n = len(ctx.jours)
    return Etat(choix=(None,) * n, jour=0, budgets=(None,) * n,
                mulligans=(0,) * n)


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

    if kind == "repiocher":
        m = list(etat.mulligans)
        m[etat.jour] += 1
        return replace(etat, mulligans=tuple(m))

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


# --------------------------------------------------------------- balance model

def couverture(ctx: Contexte, choix: tuple) -> dict:
    """What the week already covers, and what it is still missing.

    Categorical coverage only — protein sources, vegetable families, starches,
    formats, cuisines. This is *not* a nutrient calculation; see equilibre.yaml
    for why, and for the Ciqual/PNNS path if real intake is ever wanted.
    """
    servi, achete, fec, profils = Counter(), Counter(), Counter(), Counter()
    familles = set()
    for rid in choix:
        if not rid:
            continue
        r = ctx.catalogue[rid]
        a = r.get("apports", {})
        p = a.get("proteine")
        if p and p != "aucune":
            servi[p] += 1
            # A dish built on a base cooked earlier did not *buy* its protein
            # again. Caps are about the shopping trip, not the plate: refusing
            # the leftover bolognese only wastes it.
            if not vient_dun_reste(r):
                achete[p] += 1
        if a.get("feculent") and a["feculent"] != "aucun":
            fec[a["feculent"]] += 1
        familles.update(a.get("legumes", []) or [])
        if a.get("profil"):
            profils[a["profil"]] += 1

    cibles = ctx.equilibre["cibles"]
    manques, satures = {}, {}
    for p, c in cibles["proteine"].items():
        if "min" in c and servi[p] < c["min"]:
            manques[p] = c["min"] - servi[p]
        if "max" in c and achete[p] >= c["max"]:
            satures[p] = achete[p] - c["max"]

    besoin_familles = max(0, cibles["familles_legumes_min"] - len(familles))
    return {"proteine": servi, "achetee": achete, "feculent": fec,
            "familles": familles, "profil": profils,
            "manques": manques, "satures": satures,
            "familles_manquantes": besoin_familles}


def vient_dun_reste(recipe: dict) -> bool:
    """True when the dish is built on a base cooked earlier (an `accepts` edge)."""
    return any(i.get("from_accepts") for i in recipe.get("ingredients", []))


# --------------------------------------------------------------- card model

# A card's category is derived from the recipe, never hand-tagged: a dish that
# emits a base IS a souche, a dish with an `accepts` edge IS a derivative.
def categories(recipe: dict) -> set:
    cats = set()
    if any(e.get("kind") == "base" for e in recipe.get("emits", [])):
        cats.add("souche")
    if recipe.get("accepts"):
        cats.add("derive")
    if (recipe.get("time_min_total") or 999) <= 25:
        cats.add("express")
    if any(e.get("keeps", {}).get("congelo") for e in recipe.get("emits", [])):
        cats.add("congelable")
    if not cats:
        cats.add("complet")
    return cats


def categorie_principale(recipe: dict) -> str:
    for c in ("derive", "souche", "express", "congelable", "complet"):
        if c in categories(recipe):
            return c
    return "complet"


def portions_congelees(ctx: Contexte, choix: tuple) -> dict:
    """How many freezer portions the week banks, against the drawer budget."""
    conf = ctx.equilibre.get("congelateur", {})
    par_tiroir = conf.get("portions_par_tiroir", 6)
    capacite = ctx.foyer.get("freezer_drawers", 0) * par_tiroir
    n = 0
    for rid in choix:
        if not rid:
            continue
        for e in ctx.catalogue[rid].get("emits", []):
            if e.get("keeps", {}).get("congelo"):
                n += 1
    return {"portions": n, "capacite": capacite,
            "deborde": capacite and n > capacite}


def _score(ctx: Contexte, ligne: dict, cov: dict) -> tuple:
    """Score a candidate against what the week still needs. Returns (score, why)."""
    w = ctx.equilibre["poids"]
    a = ctx.catalogue[ligne["id"]].get("apports", {})
    rep = ctx.equilibre["cibles"]["repetition_max"]
    s, why = 0.0, []

    p = a.get("proteine")
    sur_un_reste = vient_dun_reste(ctx.catalogue[ligne["id"]])
    if p and p != "aucune":
        if p in cov["manques"]:
            s += w["proteine_manquante"]
            why.append(f"apporte {p}, qui manque")
        elif p in cov["satures"] and not sur_un_reste:
            s += w["proteine_saturee"]
            why.append(f"{p} déjà servi assez")
        elif p in cov["satures"]:
            # The cap is about the shopping trip. This portion was bought — and
            # frozen or jarred — in a week already; eating it now costs nothing
            # and refusing it only wastes food.
            why.append(f"{p} déjà pris cette semaine, mais celle-ci est déjà payée")

    neuves = [f for f in (a.get("legumes") or []) if f not in cov["familles"]]
    if neuves:
        s += w["famille_legume_neuve"] * len(neuves)
        why.append("légumes nouveaux : " + ", ".join(neuves))

    f = a.get("feculent")
    if f and f != "aucun" and cov["feculent"][f] >= rep["feculent"]:
        s += w["repetition_feculent"]
        why.append(f"{f} déjà {cov['feculent'][f]}×")
    if a.get("profil") and cov["profil"][a["profil"]] >= rep["profil"]:
        s += w["repetition_profil"]
        why.append(f"encore du {a['profil']}")

    if ligne["chaine"]:
        s += w["chaine_couverte"]
    if ligne["ecoule"]:
        s += w["ecoule_frigo"]
    if ligne.get("congelo"):
        s += w.get("ecoule_congelo", 0)
        why.append("sort une portion du congélo")
    if ligne["manque"]:
        s += w["chaine_manquante"]
    if ligne["hors_budget"]:
        s += w["hors_budget"]
    s += w["article_marginal"] * ligne["marginal"]
    return round(s, 2), why


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
        ecoule, du_congelo = [], False
        for acc in r.get("accepts", []):
            out, age = _stock_has(ctx.stock.get("outputs", []), acc["type"],
                                  window, date)
            if out:
                ecoule.append(acc["type"])
                if out.get("location") == "congelo":
                    du_congelo = True

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
            "congelo": du_congelo,
            "hors_budget": bool(budget and minutes > budget),
            "emits": [e["type"] for e in r.get("emits", [])],
            "apports": r.get("apports", {}),
        })

    cov = couverture(ctx, etat.choix)
    for l in lignes:
        l["score"], l["pourquoi"] = _score(ctx, l, cov)
    return _trier(lignes, etat.mode)


def _trier(lignes, mode):
    if mode == "equilibre":
        cle = lambda l: (-l["score"], l["marginal"])
    elif mode == "temps":
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

def deck(ctx: Contexte, etat: Etat, historique: dict) -> list:
    """The dishes still in the paquet: not already placed, not on cooldown.

    The deck turning over is what stops the planner proposing the same five
    dinners forever — a dish cooked recently goes to the discard pile for
    `cooldown_jours` and simply is not dealt.
    """
    conf = ctx.equilibre.get("main", {})
    cd = conf.get("cooldown_jours", 0)
    recents = set()
    for entree in (historique or {}).get("cuisines", []):
        d = entree["date"]
        if isinstance(d, str):
            d = dt.date.fromisoformat(d)
        if (ctx.today - d).days < cd:
            recents.add(entree["recipe"])
    deja = {r for r in etat.choix if r}
    return [rid for rid in ctx.catalogue if rid not in deja and rid not in recents]


def main_du_soir(ctx: Contexte, etat: Etat, historique: dict) -> list:
    """Deal a hand for the selected day: a few cards, spread across categories.

    This is the shape the user pictured — a hand drawn from a varying deck,
    cards of different kinds — rather than a ranked list of twenty-one. The
    balance score becomes the *weight* of a card in the draw instead of a
    verdict, so what the week needs shows up more often without the app
    deciding for you.

    Deterministic for a given (day, mulligan count) so the hand does not
    reshuffle under you on every keystroke; `[r]` deals a new one.
    """
    import random

    conf = ctx.equilibre.get("main", {})
    taille = conf.get("taille", 5)
    garantir = list(conf.get("garantir", []))

    dispo = set(deck(ctx, etat, historique))
    lignes = [l for l in offre(ctx, etat) if l["id"] in dispo]
    if not lignes:
        return []

    rng = random.Random(f"{ctx.today}:{etat.jour}:{etat.mulligans[etat.jour]}")
    par_id = {l["id"]: l for l in lignes}

    def tirer(candidats, deja_pris):
        pool = [l for l in candidats if l["id"] not in deja_pris]
        if not pool:
            return None
        # Score -> weight. Floor at a small positive so a badly-fitting dish
        # stays possible: a deck you can predict is not a deck.
        poids = [max(0.4, l["score"] + 12) for l in pool]
        return rng.choices(pool, weights=poids, k=1)[0]

    prises, hand = set(), []
    for cat in garantir:
        cands = [l for l in lignes if cat in categories(ctx.catalogue[l["id"]])]
        c = tirer(cands, prises)
        if c:
            prises.add(c["id"])
            hand.append(c)
    while len(hand) < taille:
        c = tirer(lignes, prises)
        if c is None:
            break
        prises.add(c["id"])
        hand.append(c)

    for l in hand:
        l["categorie"] = categorie_principale(ctx.catalogue[l["id"]])
    return sorted(hand, key=lambda l: -l["score"])


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
