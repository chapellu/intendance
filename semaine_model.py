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

import anticipation as an
import chainage as ch

# Ranking modes. `equilibre` is the default: the user asked for dishes that
# "complete the intake while varying the pleasures and respect the chains",
# which is a different objective from the cheapest possible shopping list.
# `courses` is kept as its rival so the two can be compared side by side.
MODES = ("equilibre", "courses", "temps", "frigo", "varie")

COUNTABLE = ("pièce", "gousse")


@dataclass(frozen=True)
class Creneau:
    """One meal slot: a day *and* which meal of that day.

    The prototype used to index everything by day, which silently meant « one
    dinner per day » and made the most common chain in a real household —
    *last night's dinner is today's lunch* — literally inexpressible. #29 is
    explicit: all three meals are planned, ~21 slots a week, both adults home
    at midday.

    Slots are kept in chronological order, which is what makes the chain
    correct for free: lunch on day 3 is reduced before dinner on day 3, so it
    can only ever see what day 2 left behind.
    """
    jour: int                # offset in days from ctx.today
    repas: str               # petit-dejeuner | dejeuner | gouter | diner
    emporte: bool = False    # coworking day: this lunch travels (#29)

    @property
    def cle(self):
        return (self.jour, self.repas)


@dataclass(frozen=True)
class Contexte:
    """Everything static: the catalogue and the household it compiles against."""
    catalogue: dict          # recipe_id -> recipe dict
    foyer: dict              # household["household"]
    stock: dict              # {"outputs": [...]}
    rayons: dict
    equilibre: dict          # targets + weights
    conservation: dict       # preservation methods
    today: dt.date
    jours: tuple             # ("mardi", "mercredi", ...)
    creneaux: tuple = ()     # Creneau, chronological — what `choix` indexes
    repas: dict = None       # creneaux.yaml["repas"]: label, nature, minutes, heure
    equilibre_sur: tuple = ("dejeuner", "diner")
    rules: dict = None       # rules.yaml — pour le préavis de décongélation
    # L'instant où la semaine se construit. Il ne servait à rien tant que le
    # modèle n'avait que des jours ; il décide maintenant si un trempage est
    # encore possible ou déjà manqué. 8 h du matin par défaut : on planifie la
    # semaine devant son café, pas à minuit.
    maintenant: dt.datetime = None

    def nature(self, i):
        return (self.repas or {}).get(self.creneaux[i].repas, {}).get("nature", "choisi")

    def label(self, i):
        c = self.creneaux[i]
        lab = (self.repas or {}).get(c.repas, {}).get("label", c.repas)
        return f"{self.jours[c.jour]} {lab}"

    def quand(self, i):
        """L'heure exacte du créneau `i`. Un créneau n'avait qu'un jour, ce qui
        rendait « la veille au soir » indicible — cf. `anticipation.py`."""
        c = self.creneaux[i]
        return an.quand_repas(self.today + dt.timedelta(days=c.jour),
                              self.repas, c.repas)

    @property
    def instant(self):
        return self.maintenant or dt.datetime.combine(self.today, dt.time(8, 0))


@dataclass(frozen=True)
class Etat:
    """Everything the user has decided. A week is a tuple of slots."""
    choix: tuple             # Optional[recipe_id] per day
    jour: int                # the day currently being filled
    budgets: tuple           # Optional[int] minutes per day
    mulligans: tuple = ()    # how many times each day's hand was redealt
    mode: str = "equilibre"
    jetes: tuple = ()        # fridge outputs the user chose to throw away


# --------------------------------------------------------------- construction

def etat_initial(ctx: Contexte) -> Etat:
    n = len(ctx.creneaux)
    # Land on the first slot that is actually chosen by hand — a breakfast is a
    # routine, not a decision, so starting the week there would be nonsense.
    depart = next((i for i in range(n) if ctx.nature(i) == "choisi"), 0)
    return Etat(choix=(None,) * n, jour=depart, budgets=(None,) * n,
                mulligans=(0,) * n)


def reduire(ctx: Contexte, etat: Etat, action) -> Etat:
    """(ctx, state, action) -> state. Pure; unknown actions are a no-op."""
    kind, *args = action

    if kind == "choisir":
        choix = list(etat.choix)
        choix[etat.jour] = args[0]
        etat = replace(etat, choix=tuple(choix))
        return _avancer(ctx, etat)

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
            if cur.choix[i] is None and ctx.nature(i) == "choisi":
                cur = replace(cur, jour=i)
                o = offre(ctx, cur)
                if o:
                    c = list(cur.choix)
                    c[i] = o[0]["id"]
                    cur = replace(cur, choix=tuple(c))
        return replace(cur, jour=etat.jour)

    if kind == "conjurer":
        # Play the curse: put the dish that eats the doomed leftover on the
        # earliest day that still catches it, before it ages out.
        m = malediction(ctx, etat)
        if not m or not m["candidats"]:
            return etat
        jour = min(min(c["jours"]) for c in m["candidats"])
        ids = {c["id"] for c in m["candidats"] if jour in c["jours"]}
        lignes = [l for l in offre(ctx, replace(etat, jour=jour)) if l["id"] in ids]
        if not lignes:
            return etat
        choix = list(etat.choix)
        choix[jour] = max(lignes, key=lambda l: l["score"])["id"]
        return _avancer(ctx, replace(etat, choix=tuple(choix), jour=jour))

    if kind == "jeter":
        # Discard the curse. Deliberately an *action*, so throwing food away is
        # something you did rather than something that happened to you.
        m = malediction(ctx, etat)
        if not m or m["type"] in etat.jetes:
            return etat
        return replace(etat, jetes=etat.jetes + (m["type"],))

    if kind == "vider-tout":
        return etat_initial(ctx)

    return etat


def _avancer(ctx: Contexte, etat: Etat) -> Etat:
    """After a pick, land on the next empty slot that is chosen by hand."""
    n = len(etat.choix)
    for step in range(1, n + 1):
        i = (etat.jour + step) % n
        if etat.choix[i] is None and ctx.nature(i) == "choisi":
            return replace(etat, jour=i)
    return etat


# --------------------------------------------------------------- derived view

def _date(ctx: Contexte, i: int) -> dt.date:
    """The calendar date of slot `i` — no longer the same thing as its index."""
    return ctx.today + dt.timedelta(days=ctx.creneaux[i].jour)


def _canon(ing_id, rayons):
    return rayons.get("aliases", {}).get(ing_id, ing_id)


# The `accepts` matcher used to live here, and only here — `plan.py` and
# `compile.py` each indexed `acc["type"]` by hand and crashed on the first
# recipe to match by `kind:`. It now lives in `chainage.py` with the rest of the
# chaining vocabulary; these aliases keep the local names of this file.
_accepte = ch.accepte
_libelle = ch.libelle_accepts


def _stock_has(outputs, acc, window_days, on_date):
    """Sonde NON destructive — sert aux vues qui demandent « ce plat mangerait-il
    quelque chose du frigo ? ». Proposer une carte n'est pas la jouer, donc rien
    ne se consomme ici ; c'est `calculer()` qui prélève pour de bon."""
    return ch.Stock(outputs, window_days).disponible(acc, on_date)


def _portions_foyer(foyer):
    return sum(e["portion_eq"] for e in foyer["eaters"] if e.get("diet") != "baby")


def _facteur(recipe, besoin):
    base = recipe["yields"]["portions_eq"]
    keeps = any(e.get("keeps", {}).get("congelo") or e["kind"] == "reste-plat"
                for e in recipe.get("emits", []))
    f = 1.0 if (keeps and besoin < base) else besoin / base
    return ch.facteur_lot(recipe, f)


def _echelle(qty, unit, factor):
    v = qty * factor
    if unit == "g":
        return int(round(v / 10) * 10)
    if unit in ("pièce", "c. à s.", "c. à c.", "pincée", "gousse"):
        r = round(v * 2) / 2
        return int(r) if r == int(r) else r
    return round(v, 1)


def calculer(ctx: Contexte, choix: tuple, jetes: tuple = ()) -> dict:
    """The whole derived state of a (possibly partial) week. Pure.

    Returns the basket, what the cupboard should be checked for, the chaining
    edges that actually fired, the problems, and the leftover fridge stock.

    `jetes` are outputs the user discarded: they stop being available to chain
    against, which is the whole point — waste has to cost something downstream
    or the discard is free and means nothing.
    """
    besoin = _portions_foyer(ctx.foyer)
    window = ctx.foyer["fridge_window_days"]
    placard = ctx.rayons.get("placard", [])

    # Le stock SE CONSOMME au fil de la semaine : un plat qui se branche dessus
    # le vide d'autant, et le suivant ne trouve que le reste. Tant que c'était
    # une simple liste, le même bocal couvrait autant de plats qu'on voulait.
    running = ch.Stock([o for o in ctx.stock.get("outputs", [])
                        if o["type"] not in jetes], window)
    panier, a_verifier = {}, {}
    provenances = Counter()
    chaine, problemes, ecoule = [], [], set()
    plein_tarif = []
    trop_tard = []           # arêtes qui exigent l'enchaînement immédiat
    emis_a = {}              # recipe_id -> créneau où il a été cuisiné

    for i, rid in enumerate(choix):
        if rid is None:
            continue
        r = ctx.catalogue[rid]
        date = _date(ctx, i)

        # 7 Wonders chaining: an uncovered `accepts` is a *price*, not a gate.
        # `sans_reste` says what to buy and how long it costs instead.
        plein = False
        prises = []
        for acc in r.get("accepts", []):
            pr = running.prelever(acc, date)
            prises.append(pr)
            if pr.trouve:
                src = pr.out.get("_from")
                chaine.append({"creneau": i, "type": pr.out["type"], "depuis": src,
                               "age": pr.age, "pris": pr.pris, "unite": pr.unite,
                               "manque": pr.manque,
                               "congelo": pr.out.get("location") == "congelo"})
                if src is None:
                    ecoule.add(pr.out["type"])
            # « Pas plus de » : certaines bases ne se chaînent que TOUT DE
            # SUITE. La mousse entre dans le gâteau encore tiède ; celle
            # d'hier est ferme et rate la recette, alors qu'elle passe sans
            # difficulté une fenêtre de fraîcheur comptée en jours.
            dmax = an.delai_max_h(acc)
            if dmax is not None and pr.trouve:
                src = pr.out.get("_from")
                j = emis_a.get(src)
                ecart = (ctx.quand(i) - ctx.quand(j)).total_seconds() / 3600 if j is not None else None
                if ecart is None or ecart > dmax:
                    trop_tard.append({
                        "creneau": i, "titre": r["title"], "type": _libelle(acc),
                        "delai_max_h": dmax, "ecart_h": ecart, "depuis": src,
                    })
            if pr.couvert or (pr.trouve and pr.approximatif):
                continue
            if r.get("sans_reste"):
                plein = True
                plein_tarif.append({"creneau": i, "titre": r["title"],
                                    "type": _libelle(acc),
                                    "minutes": r["sans_reste"].get("temps_min", 0)})
            elif acc.get("required"):
                problemes.append({
                    "creneau": i, "titre": r["title"], "type": _libelle(acc),
                    "fix": acc.get("fallback_recipe"),
                })

        factor = _facteur(r, besoin)
        lignes_ing = list(r["ingredients"])
        if plein:
            lignes_ing += r["sans_reste"].get("ingredients", [])
        for ing in lignes_ing:
            cid = _canon(ing["id"], ctx.rayons)
            prov = ch.provenance(ing, cid, placard, prises)
            provenances[prov] += 1
            if prov in ch.HORS_COURSES:
                continue
            if prov == ch.PLACARD:
                a_verifier[cid] = ing["name"]
                continue
            q = _echelle(ing["qty"], ing["unit"], factor)
            key = (cid, ing["unit"])
            slot = panier.setdefault(key, {"name": ing["name"], "qty": 0, "n": 0})
            slot["qty"] += q
            slot["n"] += 1

        for e in r.get("emits", []):
            sortie = dict(e)
            amount, unit = ch.quantite(e)
            if amount is not None:
                sortie["qty"] = {"amount": amount * factor, "unit": unit}
            running.ajouter(sortie, born=date, source=rid, location="frigo")
        # Le stock date les sorties au JOUR ; l'heure du créneau, elle, permet
        # de dire « deux heures après », ce dont `delai_max_h` a besoin.
        emis_a[rid] = i

    frigo = []
    for o in ctx.stock.get("outputs", []):
        if o["type"] in ecoule or o.get("location") == "congelo":
            continue
        if o["type"] in jetes:
            continue
        born = o["born"]
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        age = (ctx.today - born).days
        frigo.append({"type": o["type"], "band": o["qty_band"], "age": age,
                      "perime": age > window})

    return {"panier": panier, "placard": a_verifier, "chaine": chaine,
            "problemes": problemes, "plein_tarif": plein_tarif, "frigo": frigo,
            "jetes": list(jetes), "provenances": provenances,
            "trop_tard": trop_tard}


# --------------------------------------------------------------- balance model

def couverture(ctx: Contexte, choix: tuple) -> dict:
    """What the week already covers, and what it is still missing.

    Categorical coverage only — protein sources, vegetable families, starches,
    formats, cuisines. This is *not* a nutrient calculation; see equilibre.yaml
    for why, and for the Ciqual/PNNS path if real intake is ever wanted.
    """
    servi, achete, fec, profils = Counter(), Counter(), Counter(), Counter()
    familles = set()
    for i, rid in enumerate(choix):
        if not rid:
            continue
        # Targets are measured on the main meals only (`equilibre_sur`). The
        # protein caps were posed by eye against six dinners; counting them
        # across all 21 slots would silently halve them, which nobody decided.
        if i < len(ctx.creneaux) and ctx.creneaux[i].repas not in ctx.equilibre_sur:
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


# ------------------------------------------------------------------ slot fit

# A dish that declares nothing is a main dish: it suits lunch and dinner. That
# default is what keeps the whole existing catalogue valid without editing 21
# files — breakfast and goûter are opt-in, because nothing in the repertoire is
# one yet.
CRENEAUX_DEFAUT = ("dejeuner", "diner")


def convient(ctx: Contexte, recipe: dict, i: int) -> bool:
    """Does this dish belong at this slot at all?"""
    ok = recipe.get("creneaux") or CRENEAUX_DEFAUT
    return ctx.creneaux[i].repas in ok


def transportable(recipe: dict) -> bool:
    """Does it survive a lunchbox? Opt-out, so silence means yes."""
    return recipe.get("transportable", True)


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


def capacites_foyer(ctx: Contexte) -> set:
    return {c for eq in ctx.foyer["equipment"] for c in eq.get("capabilities", [])}


def conservations(ctx: Contexte, recipe: dict) -> list:
    """Which preservation methods this dish's output can take, and which are locked.

    Keeping is not a property of the dish — it is a property of the dish times
    the method you own and know. A locked method is a skill-tree node, not a
    missing feature, so it reports *what it would need* and never a purchase.
    """
    conf = ctx.conservation
    acidite = recipe.get("acidite", conf.get("defaut_acidite", "basse"))
    caps = capacites_foyer(ctx)
    dehors = []

    for m in conf["methodes"]:
        need = m.get("needs")
        dispo = need is None or need in caps
        interdit = None
        if m.get("exige_acidite") == "haute" and acidite != "haute":
            interdit = "plat peu acide : cette méthode ne le sécurise pas"

        f = m.get("fenetre", {})
        if "multiplicateur" in f:
            base = ctx.foyer.get("fridge_window_days", 4)
            duree = f"{int(base * f['multiplicateur'])} j"
        elif f.get("unite") == "mois":
            duree = f"{f.get('valeur', '?')} mois"
        elif f.get("source") == "household.fridge_window_days":
            duree = f"{ctx.foyer.get('fridge_window_days', 4)} j"
        else:
            duree = f"{f.get('valeur', '?')} j"

        noeud = m.get("noeud_competence") or {}
        dehors.append({
            "id": m["id"], "label": m["label"], "duree": duree,
            "dispo": dispo and not interdit,
            "interdit": interdit,
            "manque": None if dispo else (noeud.get("kit_manquant") or need),
            "noeud": noeud.get("titre"),
            "securite": (m.get("note_securite") or "").strip() or None,
        })
    return dehors


def _band_portions(band) -> int:
    """« 2-repas » -> 2. Crude, and honest about it: the bands are coarse."""
    try:
        return int(str(band).split("-")[0])
    except (TypeError, ValueError):
        return 1


def bilan_congelo(ctx: Contexte, etat: Etat) -> dict:
    """The freezer as a level between a floor and a ceiling, across the week.

    RimWorld does not ask you to queue meals one at a time; you set a **standing
    bill** — *cook simple meals until you have 20* — and the colony reorders on
    its own when the stock drops through the threshold. That is the right shape
    for the emergency drawer, and it is a different question from the one the
    planner asks everywhere else. « What shall we eat Tuesday? » is a choice.
    « Are there still portions behind me if Tuesday collapses? » is a *level*,
    and levels want a floor, not a decision.

    So: what is in the freezer today, minus what the week takes out, plus what
    the week banks. Below the floor, batch-cooking stops being a nice idea and
    becomes the thing the week is short of — and `_score` says so out loud.
    """
    conf = ctx.equilibre.get("congelateur", {})
    par_tiroir = conf.get("portions_par_tiroir", 6)
    plancher = conf.get("plancher", 0)
    # Une seule source pour cette grandeur : `chainage` la calcule aussi pour
    # `plan.py`, et deux nombres pour une même capacité est précisément la
    # faute que ce prototype passe son temps à réparer.
    capacite = ch.capacites_stockage(ctx.foyer, {"congelateur": conf}).get("congelo", 0)

    debut = sum(_band_portions(o.get("qty_band"))
                for o in ctx.stock.get("outputs", [])
                if o.get("location") == "congelo" and o["type"] not in etat.jetes)

    banque = 0
    for rid in etat.choix:
        if not rid:
            continue
        for e in ctx.catalogue[rid].get("emits", []):
            if e.get("keeps", {}).get("congelo"):
                banque += _band_portions(e.get("qty_band"))

    calc = calculer(ctx, etat.choix, etat.jetes)
    sortie = sum(_band_portions("1-repas") for c in calc["chaine"] if c.get("congelo"))

    fin = debut - sortie + banque
    return {"debut": debut, "banque": banque, "sortie": sortie, "fin": fin,
            "plancher": plancher, "capacite": capacite,
            "sous_plancher": plancher and fin < plancher,
            "deborde": bool(capacite and fin > capacite)}


def malediction(ctx: Contexte, etat: Etat) -> dict:
    """The leftover that will spoil this week, dealt as a card nobody asked for.

    Slay the Spire's curse is a card shuffled into your deck that you did not
    choose and would rather not draw. The kitchen has exactly one of these, and
    it is not a metaphor: the thing at the back of the fridge with a clock on it.

    Today that fact is a grey line under the week — passive, scrollable, and in
    practice already too late by the time anyone reads it. As a card *in the
    hand*, with its deadline printed on it and only two ways out, the same fact
    becomes a decision: cook it, or discard it and watch the app write down that
    you threw food away. Making waste an explicit discard rather than a silent
    default is the point; nothing else in this model changes behaviour as
    directly.

    Returns the most urgent one, or None when the fridge holds no deadline.
    """
    window = ctx.foyer["fridge_window_days"]
    fin_semaine = _date(ctx, len(ctx.creneaux) - 1)
    calc = calculer(ctx, etat.choix, etat.jetes)
    deja_mange = {c["type"] for c in calc["chaine"]}
    places = {r for r in etat.choix if r}

    pire = None
    for o in ctx.stock.get("outputs", []):
        if o.get("location") == "congelo":
            continue                      # the freezer has no clock — that is why it exists
        if o["type"] in etat.jetes or o["type"] in deja_mange:
            continue
        born = o["born"]
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        peremption = born + dt.timedelta(days=window)
        if peremption > fin_semaine:
            continue                      # it outlives the week: no decision to force

        candidats = []
        for rid, r in ctx.catalogue.items():
            if rid in places:
                continue
            if not any(_accepte(o, a) for a in r.get("accepts", [])):
                continue
            jours = [i for i in range(len(ctx.creneaux))
                     if etat.choix[i] is None and ctx.nature(i) == "choisi"
                     and _date(ctx, i) <= peremption
                     and convient(ctx, r, i)]
            if jours:
                candidats.append({"id": rid, "titre": r["title"], "jours": jours})

        reste = (peremption - ctx.today).days
        item = {"type": o["type"], "band": o.get("qty_band"),
                "peremption": peremption, "reste": reste,
                "perdu": reste < 0, "candidats": candidats}
        if pire is None or reste < pire["reste"]:
            pire = item
    return pire


# ------------------------------------------------------------------- agenda

# De combien on accepte de prendre de l'avance sur une échéance qui ne se
# remonte pas. Un rôti cuit six heures trop tôt reste un rôti ; trois jours
# trop tôt, non.
AVANCE_RIGIDE_MAX_H = 6


def _ancrer(ctx: Contexte, limite, souple: bool):
    """Le dernier créneau qui précède l'échéance, ou None.

    Une échéance est une heure ; un rappel utile est un MOMENT OÙ ON EST DÉJÀ
    DANS LA CUISINE. « Au plus tard à 7 h 05 » se dit mieux « dimanche, en
    dînant » — et le modèle a exactement ce qu'il faut pour le dire, puisque
    les créneaux sont sa matière première. Tremper plus longtemps ne coûte
    rien, donc on remonte librement ; ce qui ne se remonte pas garde son heure.
    """
    avant = [j for j in range(len(ctx.creneaux)) if ctx.quand(j) <= limite]
    if not avant:
        return None
    j = avant[-1]
    if not souple and limite - ctx.quand(j) > dt.timedelta(hours=AVANCE_RIGIDE_MAX_H):
        return None
    return j


def agenda(ctx: Contexte, etat: Etat) -> list:
    """Ce que la semaine choisie oblige à lancer AVANT, en ordre chronologique.

    C'est la moitié manquante du planificateur. Il savait dire quoi manger
    mardi et ce qu'il fallait acheter ; il ne savait pas dire *ce soir, mets
    l'orge à tremper*, qui est pourtant le seul geste dont l'oubli fait rater
    le plat sans recours. Un rappel après coup n'est pas une aide, c'est un
    reproche.

    Deux sources, et la seconde ne s'écrit sur aucune recette :

    - les sessions anticipées de la recette (`attente_min`) ;
    - la décongélation d'une portion prise au congélateur, qui est une
      propriété du FOYER — 30 min avec un micro-ondes, une nuit sans.
    """
    calc = calculer(ctx, etat.choix, etat.jetes)
    gele = {c["creneau"] for c in calc["chaine"] if c.get("congelo")}
    h_decongelo, comment = an.decongelation_h(ctx.foyer, ctx.rules or {})

    lignes = []
    for i, rid in enumerate(etat.choix):
        if not rid:
            continue
        r = ctx.catalogue[rid]
        quand = ctx.quand(i)
        echeances = list(an.echeances(r, quand))
        if i in gele:
            limite = quand - dt.timedelta(hours=h_decongelo)
            echeances.append({
                "quand": limite, "limite": limite,
                "dit": "au plus tard " + an.dire_quand(limite, quand.date()),
                "souple": True,
                "geste": f"Sortir la portion du congélateur — {comment}",
                "minutes": 2, "attente_min": int(h_decongelo * 60),
                "raison": "décongélation", "etapes": [], "rattrapage": None,
            })
        for e in echeances:
            ancre = _ancrer(ctx, e["limite"], e.get("souple", True))
            lignes.append({
                **e,
                "creneau": i, "pour": ctx.label(i),
                "id": rid, "titre": r["title"],
                "ancre": ancre,
                "ou": ctx.label(ancre) if ancre is not None else None,
                "retard": an.en_retard(e, ctx.instant),
            })
    lignes.sort(key=lambda l: l["limite"])
    return lignes


def _score(ctx: Contexte, ligne: dict, cov: dict, cong: dict = None) -> tuple:
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
    # Standing bill: while the emergency drawer is under its floor, a dish that
    # refills it is worth more than one that merely feeds tonight.
    if cong and cong["sous_plancher"] and ligne.get("banque"):
        s += w.get("plancher_congelo", 0)
        why.append(f"remplit le congélo, sous son plancher "
                   f"({cong['fin']}/{cong['plancher']})")
    # L'anticipation en elle-même ne coûte RIEN au score : pénaliser un plat
    # parce qu'il faut y penser la veille reviendrait à écarter les
    # légumineuses, que les cibles juste à côté encouragent. C'est le fait
    # d'être DÉJÀ en retard qui se paie.
    if ligne.get("retard"):
        s += w.get("anticipation_ratee", 0)
        why.append(f"{ligne['retard'][0]['raison']} : l'heure est passée")
    if ligne["manque"]:
        s += w["chaine_manquante"]
    if ligne["hors_budget"]:
        s += w["hors_budget"]
    if ligne.get("mal_transporte"):
        s += w.get("mal_transporte", 0)
        why.append("voyage mal en gamelle")
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
    base = calculer(ctx, etat.choix, etat.jetes)
    n_base = len(base["panier"])
    deja = {r for r in etat.choix if r}
    budget = etat.budgets[etat.jour]
    date = _date(ctx, etat.jour)
    date_h = ctx.quand(etat.jour)
    window = ctx.foyer["fridge_window_days"]

    lignes = []
    for rid, r in ctx.catalogue.items():
        if rid in deja:
            continue
        if not convient(ctx, r, etat.jour):
            continue
        essai = list(etat.choix)
        essai[etat.jour] = rid
        apres = calculer(ctx, tuple(essai), etat.jetes)

        # Did placing it here actually resolve its own chaining need?
        chaine_ici = [c for c in apres["chaine"] if c["creneau"] == etat.jour]
        manque_ici = [p for p in apres["problemes"] if p["creneau"] == etat.jour]
        plein_ici = [p for p in apres["plein_tarif"] if p["creneau"] == etat.jour]

        # Does it eat something already sitting in the fridge?
        ecoule, du_congelo = [], False
        dispo_stock = [o for o in ctx.stock.get("outputs", [])
                       if o["type"] not in etat.jetes]
        for acc in r.get("accepts", []):
            out, age = _stock_has(dispo_stock, acc, window, date)
            if out:
                ecoule.append(out["type"])
                if out.get("location") == "congelo":
                    du_congelo = True

        # Les minutes du créneau, et elles seules : le trempage est réel mais il
        # se dépense la veille, et le compter ici revient à dire à quelqu'un qui
        # a 20 min qu'il n'en a que 17.
        minutes = an.minutes_sur_place(r)
        if plein_ici:
            minutes += plein_ici[0]["minutes"]
        avant = an.echeances(r, date_h)
        lignes.append({
            "id": rid,
            "titre": r["title"],
            "minutes": minutes,
            "avant": avant,
            "retard": [e for e in avant if an.en_retard(e, ctx.instant)],
            "plein": bool(plein_ici),
            "marginal": len(apres["panier"]) - n_base,
            "chaine": bool(chaine_ici),
            "depuis": chaine_ici[0]["depuis"] if chaine_ici else None,
            "manque": manque_ici[0] if manque_ici else None,
            "ecoule": ecoule,
            "congelo": du_congelo,
            "hors_budget": bool(budget and minutes > budget),
            "emits": [e["type"] for e in r.get("emits", [])],
            "banque": any(e.get("keeps", {}).get("congelo")
                          for e in r.get("emits", [])),
            "apports": r.get("apports", {}),
            # Coworking lunch: a dish that travels badly is not forbidden, it
            # is just a worse idea. Same rule as chaining — a price, not a gate.
            "mal_transporte": ctx.creneaux[etat.jour].emporte and not transportable(r),
        })

    cov = couverture(ctx, etat.choix)
    cong = bilan_congelo(ctx, etat)
    for l in lignes:
        l["score"], l["pourquoi"] = _score(ctx, l, cov, cong)
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
    base = sum(ctx.catalogue[r].get("time_min_total", 0) for r in choix if r)
    # Dishes cooked at full price took their `sans_reste` detour too.
    return base + sum(p["minutes"] for p in calculer(ctx, choix)["plein_tarif"])


def gaspillage(ctx: Contexte, etat: Etat) -> list:
    """What the week threw away, named. The scoreboard for the discard pile."""
    perdu = []
    for o in ctx.stock.get("outputs", []):
        if o["type"] in etat.jetes:
            perdu.append({"type": o["type"], "band": o.get("qty_band")})
    return perdu
