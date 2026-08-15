"""Le chaînage : ce qu'une arête `accepts` / `emits` veut dire, quantité comprise.

POURQUOI CE MODULE EXISTE
-------------------------
Le chaînage était un jeu de JETONS. Une sortie entrait en stock, `stock_has()`
la trouvait, et personne ne la retirait jamais : le même bocal de bolognaise
couvrait les pâtes du mardi (500 g) ET les lasagnes du mercredi (700 g), soit
1200 g réclamés sur un bocal — pendant que la sauce cuisinée le lundi n'était
consommée par personne. Les `qty:` écrits sur chaque `accepts` depuis #30
n'étaient lus par aucune ligne de code.

Ce qui manquait n'était pas un contrôle mais une GRANDEUR : combien il y en a,
combien on en prend, combien il en reste. Une fois la quantité réelle, trois
choses tombent toutes seules :

- le double-comptage devient impossible (on prélève, donc ça baisse) ;
- « il en manque 100 g » devient dicible, au lieu de « il y en a / il n'y en a
  pas » ;
- et surtout la semaine devient DIMENSIONNABLE : si jeudi réclame une base que
  mardi produit, mardi peut être cuisiné plus grand exprès. C'est la demande de
  l'usager, et c'est une offre, pas une correction automatique — on propose de
  doubler la sauce, on ne double pas la sauce.

LES DEUX MESURES, ET POURQUOI ELLES COEXISTENT
----------------------------------------------
`qty: {amount, unit}` chiffre une BASE — 700 g de sauce, 1500 ml de bouillon,
1 carcasse. C'est ce que les consommateurs réclament, et c'est en grammes que la
question « y en a-t-il assez » a un sens.

`qty_band` (« 2-repas », « lunchbox ») compte des REPAS. C'est la bonne unité
pour un reste de plat — on ne mange pas 340 g de gratin, on mange une part — et
c'est celle du budget congélo. Les deux ne se concurrencent pas : elles mesurent
des choses différentes. Une arête chiffrée des deux côtés se règle en grandeur ;
sinon on retombe sur le jeton d'avant, et le prélèvement se dit `approximatif`
pour que l'appelant puisse l'annoncer au lieu de faire semblant.
"""

import datetime as dt
import math


# ---------------------------------------------------------------- vocabulaire

def accepte(out, acc):
    """Cette sortie stockée satisfait-elle cette arête `accepts` ?

    Deux façons de demander. `type:` nomme une sortie exacte — « sauce-bolognaise ».
    `kind:` nomme une CLASSE — « n'importe quel reste-plat » — ce qui permet à une
    seule carte « reste de la veille » de manger le chili, le gratin, la quiche ou
    la ratatouille de la veille sans écrire neuf recettes jumelles.
    """
    if acc.get("type"):
        return out.get("type") == acc["type"]
    if acc.get("kind"):
        return out.get("kind") == acc["kind"]
    return False


def libelle_accepts(acc):
    """Un type est déjà un nom, une classe demande un article :
    « sauce-bolognaise » contre « un reste-plat »."""
    return acc.get("type") or f"un {acc.get('kind', '?')}"


def quantite(bloc):
    """`{'qty': {'amount': 700, 'unit': 'g'}}` -> `(700.0, 'g')`, sinon `(None, None)`."""
    q = (bloc or {}).get("qty")
    if isinstance(q, dict) and q.get("amount") is not None:
        return float(q["amount"]), q.get("unit")
    return None, None


def band_repas(band):
    """« 2-repas » -> 2. Grossier, et honnête là-dessus : les bandes le sont."""
    try:
        return int(str(band).split("-")[0])
    except (TypeError, ValueError):
        return 1


def fmt_qte(v, unit):
    v = round(v, 1)
    return f"{int(v) if v == int(v) else v} {unit}"


# ---------------------------------------------------------------- prélèvement

class Prelevement:
    """Le résultat d'une tentative de prise sur le stock.

    `couvert` distingue les trois cas que le booléen d'avant confondait : rien
    trouvé, trouvé mais pas assez, trouvé et suffisant.
    """

    def __init__(self, out=None, age=None, pris=None, manque=0.0, unite=None,
                 approximatif=False, sources=()):
        self.out = out
        self.age = age
        self.pris = pris
        self.manque = manque
        self.unite = unite
        self.approximatif = approximatif
        self.sources = list(sources)

    @property
    def trouve(self):
        return self.out is not None

    @property
    def couvert(self):
        return self.out is not None and self.manque <= 1e-9

    def raconte(self):
        """D'où sort ce que le plat a pris, morceau par morceau."""
        bouts = []
        for s in self.sources:
            ligne, pris = s["ligne"], s["pris"]
            source = ligne.get("_from")
            ou = (f"du lot « {source} »" if source
                  else "du congélo" if ligne.get("location") == "congelo"
                  else f"du frigo (J-{s['age']})")
            quoi = ligne.get("type") if pris is None else fmt_qte(pris, self.unite)
            bouts.append(f"{quoi} {ou}")
        return " + ".join(bouts)

    def __repr__(self):
        if not self.trouve:
            return "<Prelevement rien>"
        etat = "couvert" if self.couvert else f"manque {self.manque}{self.unite or ''}"
        return f"<Prelevement {self.out.get('type')} {etat}>"


class Stock:
    """Les sorties disponibles pour le chaînage — et qui SE CONSOMMENT.

    C'est toute la différence avec le `stock_has()` d'avant : `prelever()` retire
    ce qu'il prend. Un plat qui se branche sur un bocal le vide d'autant, et le
    suivant ne retrouve que ce qui reste.
    """

    def __init__(self, outputs=(), window_days=4):
        self.window = window_days
        self.lignes = []
        for o in outputs or ():
            self.ajouter(o)

    # -- alimentation

    def ajouter(self, sortie, born=None, source=None, location=None):
        ligne = dict(sortie)
        if born is not None:
            ligne["born"] = born
        if source is not None:
            ligne["_from"] = source
        if location is not None:
            ligne["location"] = location
        amount, unit = quantite(ligne)
        ligne["_reste"] = amount          # None = jeton non chiffré
        ligne["_unite"] = unit
        ligne["_epuise"] = False
        self.lignes.append(ligne)
        return ligne

    # -- lecture

    def _age_si_frais(self, ligne, on_date):
        born = ligne.get("born")
        if isinstance(born, str):
            born = dt.date.fromisoformat(born)
        if born is None:
            return None
        age = (on_date - born).days
        if ligne.get("location") == "congelo" or age <= self.window:
            return age
        return None

    def _candidates(self, acc, on_date):
        for ligne in self.lignes:
            if ligne.get("_epuise"):
                continue
            if not accepte(ligne, acc):
                continue
            age = self._age_si_frais(ligne, on_date)
            if age is None:
                continue
            yield ligne, age

    def disponible(self, acc, on_date):
        """Sonde NON destructive : (ligne, age) ou (None, None).

        Sert aux vues qui demandent « ce plat mangerait-il quelque chose du
        frigo ? » sans rien engager — proposer une carte n'est pas la jouer.
        """
        for ligne, age in self._candidates(acc, on_date):
            return ligne, age
        return None, None

    # -- consommation

    def prelever(self, acc, on_date):
        """Prend ce que l'arête réclame, sur une ou plusieurs lignes, et décompte."""
        besoin, unite = quantite(acc)
        premier = premier_age = None
        pris_total = 0.0
        sources = []

        for ligne, age in self._candidates(acc, on_date):
            chiffrable = (besoin is not None and ligne["_reste"] is not None
                          and ligne["_unite"] == unite)
            if not chiffrable:
                # Une des deux faces ne chiffre rien : on retombe sur le jeton
                # d'avant — la ligne entière part. C'est le cas des restes de
                # plat, comptés en repas et non en grammes.
                ligne["_epuise"] = True
                return Prelevement(out=ligne, age=age, approximatif=True,
                                   sources=[{"ligne": ligne, "pris": None, "age": age}])

            pris = min(besoin - pris_total, ligne["_reste"])
            if pris <= 0:
                continue
            ligne["_reste"] -= pris
            if ligne["_reste"] <= 1e-9:
                ligne["_epuise"] = True
            pris_total += pris
            # On garde COMBIEN vient de chaque ligne : un plat qui finit un fond
            # de bocal et attaque le lot de la veille se raconte en deux morceaux,
            # et annoncer le total sur le premier bocal serait un mensonge.
            sources.append({"ligne": ligne, "pris": pris, "age": age})
            if premier is None:
                premier, premier_age = ligne, age
            if pris_total >= besoin - 1e-9:
                break

        if premier is None:
            return Prelevement(manque=besoin or 0.0, unite=unite)
        return Prelevement(out=premier, age=premier_age, pris=pris_total,
                           manque=max(0.0, (besoin or 0.0) - pris_total),
                           unite=unite, sources=sources)

    # -- reste

    def restant(self, on_date=None):
        """Ce qui n'a pas été mangé par la semaine, dans l'ordre d'entrée."""
        out = []
        for ligne in self.lignes:
            if ligne.get("_epuise"):
                continue
            item = dict(ligne)
            if on_date is not None:
                item["_age"] = self._age_si_frais(ligne, on_date)
            out.append(item)
        return out


# ------------------------------------------------------- dimensionnement

# Unités qui comptent des OBJETS. Une sortie mesurée là-dedans ne se produit pas
# en fraction : on ne récupère pas 1,4 carcasse ni 1,4 recette de mousse.
LOTS_COMPTABLES = ("pièce", "recette", "lot")


def lot_indivisible(recipe, unite=None):
    """Ce lot ne se cuisine-t-il qu'en multiples entiers ?

    Deux raisons, une dérivée et une déclarée. La sortie peut être comptable
    (`pièce`, `recette`, `lot`). Ou bien la recette est bâtie sur un objet qu'on
    ne coupe pas : un poulet entier, un moule, un bocal — ce que `lot_entier:`
    déclare, parce qu'aucune règle ne le devine (« 1 pièce » qualifie aussi bien
    un oignon, qu'on achète à 5 sans y penser).
    """
    return bool(recipe.get("lot_entier")) or (unite or "") in LOTS_COMPTABLES


def facteur_lot(recipe, facteur):
    """Ramène un facteur d'échelle à ce que la recette sait réellement produire.

    `facteur = besoin / rendement` donne 0,42 pour un foyer de 2,5 devant une
    recette pour 6. Pour une sauce, cuisiner 42 % du lot a un sens. Pour un plat
    bâti sur un objet entier, non : « faire 0,42 poulet rôti » n'est pas une
    quantité, c'est une erreur de modèle qui se propageait jusque dans le panier.
    Un lot indivisible se cuisine au moins une fois, et en nombre entier.
    """
    if not recipe.get("lot_entier"):
        return facteur
    return float(max(1, math.ceil(facteur - 1e-9)))


class Offre:
    """« Fais-en plus tôt dans la semaine, et le plat d'après est déjà payé. »

    Une offre, pas une correction : le prototype ne redimensionne rien tout seul.
    Cuisiner plus grand engage un saladier, un tiroir de congélo et de l'argent
    — trois choses que le modèle ne sait pas arbitrer à la place de l'usager.
    """

    def __init__(self, i_emetteur, rid_emetteur, titre_emetteur, type_sortie,
                 facteur_actuel, par_lot, manque, unite, pour, gain_min=0,
                 indivisible=False):
        self.i_emetteur = i_emetteur
        self.rid_emetteur = rid_emetteur
        self.titre_emetteur = titre_emetteur
        self.type_sortie = type_sortie
        self.facteur_actuel = facteur_actuel
        self.par_lot = par_lot          # ce qu'un lot plein rend, dans `unite`
        self.manque = manque
        self.unite = unite
        self.pour = list(pour)          # [(jour, titre)]
        self.gain_min = gain_min
        self.indivisible = indivisible

    @property
    def facteur_propose(self):
        """Calculé, jamais stocké — le manque s'accumule quand deux plats
        réclament la même base, et l'arrondi doit se faire sur le total."""
        brut = self.facteur_actuel + self.manque / self.par_lot
        return math.ceil(brut - 1e-9) if self.indivisible else brut

    @property
    def multiple(self):
        return self.facteur_propose / self.facteur_actuel if self.facteur_actuel else 1.0

    def phrase(self):
        beneficiaires = " et ".join(f"{j} ({t})" for j, t in self.pour)
        gain = f", {self.gain_min} min gagnées" if self.gain_min else ""
        # Un lot indivisible se dit en LOTS, pas en multiplicateur : « ×4,8 »
        # d'un lot déjà fractionnaire ne veut rien dire devant une casserole.
        if self.indivisible:
            n = self.facteur_propose
            combien = f"en faire {n:g} lot{'s' if n > 1 else ''} entier{'s' if n > 1 else ''}"
        else:
            combien = f"en faire {self.multiple:.2g}×"
        # Quand l'arrondi a mordu, le dire : le surplus au-delà du manque est un
        # effet du lot indivisible, pas une largesse du planificateur.
        arrondi = ""
        if self.indivisible:
            rendu = self.par_lot * (self.facteur_propose - self.facteur_actuel)
            if rendu > self.manque + 1e-9:
                arrondi = (f" — un lot ne se coupe pas, donc "
                           f"{fmt_qte(rendu - self.manque, self.unite)} en plus au congélo")
        return (f"{self.titre_emetteur} : {combien} "
                f"(+{fmt_qte(self.manque, self.unite)} de {self.type_sortie}) "
                f"et {beneficiaires} ne coûte plus rien{gain}{arrondi}.")


def offres_surproduction(manques, jours, catalogue, facteurs):
    """Transforme les manques constatés en propositions d'agrandir un lot AMONT.

    `manques` : [{i, acc, manque, unite, titre}] relevés en marchant la semaine.
    `jours`   : [{jour, recipe}] dans l'ordre. `facteurs` : le facteur retenu par
    jour. On remonte du manque vers le plat le plus proche EN AMONT qui émet la
    chose, parce que c'est celui qu'il coûte le moins cher d'agrandir : il est
    déjà au menu, déjà allumé, déjà payé en temps.
    """
    offres = []
    for m in manques:
        if not m.get("unite") or m["manque"] <= 0:
            continue
        for j in range(m["i"] - 1, -1, -1):
            r = catalogue.get(jours[j]["recipe"])
            if not r:
                continue
            trouve = False
            for e in r.get("emits", []):
                if not accepte(e, m["acc"]):
                    continue
                amount, unit = quantite(e)
                if amount is None or unit != m["unite"] or amount <= 0:
                    continue
                offres.append(Offre(
                    i_emetteur=j, rid_emetteur=jours[j]["recipe"],
                    titre_emetteur=r["title"], type_sortie=e.get("type"),
                    facteur_actuel=facteurs[j], par_lot=amount,
                    manque=m["manque"], unite=m["unite"],
                    pour=[(jours[m["i"]]["jour"], m["titre"])],
                    gain_min=m.get("gain_min", 0),
                    indivisible=lot_indivisible(r, unit)))
                trouve = True
                break
            if trouve:
                break
    return _fusionner(offres)


def _fusionner(offres):
    """Deux plats qui réclament la même base au même émetteur = une seule offre.

    Seul le MANQUE s'additionne ; le facteur se recalcule dessus. Additionner
    des facteurs arrondis arrondirait deux fois et proposerait un lot de trop.
    """
    par_cle = {}
    for o in offres:
        cle = (o.i_emetteur, o.type_sortie)
        if cle in par_cle:
            a = par_cle[cle]
            a.manque += o.manque
            a.pour += o.pour
            a.gain_min += o.gain_min
        else:
            par_cle[cle] = o
    return list(par_cle.values())


# ---------------------------------------------------------------- provenance

# D'où sort une ligne d'ingrédient. Ces quatre cas existaient déjà, mais éclatés
# en trois encodages sans rapport : `rayons.placard` (une liste globale et
# statique), `ing.from_accepts` (un booléen par ligne) et `stock.location`
# (un état du foyer, réservé aux sorties de chaînage). Rien ne les rassemblait,
# donc chaque lecteur redécidait dans son coin — et « déjà à la maison » ne se
# disait pas du tout pour un ingrédient ordinaire.
PLACARD = "placard"     # denrée de fond : on vérifie, on n'achète pas
CHAINE = "chaine"       # cuisiné plus tôt dans la semaine
FRIGO = "frigo"         # déjà à la maison avant que la semaine commence
COURSES = "courses"     # à acheter
ABSENT = "absent"       # base attendue qui n'est pas là — et qui NE S'ACHÈTE PAS

ETIQUETTES = {
    PLACARD: "placard",
    CHAINE: "déjà cuisiné cette semaine",
    FRIGO: "déjà au frigo",
    COURSES: "à acheter",
    ABSENT: "à cuisiner d'avance",
}

# Les provenances qui ne produisent JAMAIS de ligne de courses. `ABSENT` en fait
# partie et c'est contre-intuitif : une base manquante se rattrape en cuisinant
# (`sans_reste` dit alors quoi acheter, en matières premières), jamais en
# achetant la base elle-même. On n'achète pas 250 g de lentilles *cuites*.
HORS_COURSES = (CHAINE, FRIGO, ABSENT)


def provenance(ing, cid, placard_ids, prelevements=()):
    """Où va-t-on chercher cette ligne d'ingrédient ?

    UNE décision, au lieu de trois tests dispersés. L'ordre compte : une base
    chaînée l'emporte sur le placard, parce qu'elle est déjà cuisinée et qu'on
    ne la rachète en aucun cas.

    `prelevements` sont les prises faites pour cette recette. Une ligne
    `from_accepts` non couverte devient `ABSENT` et non `COURSES` : la dire
    « à acheter » mettrait « 250 g de lentilles cuites » sur la liste de
    courses, ce qui ne s'achète nulle part. C'est `sans_reste` qui dit alors
    quoi acheter — des lentilles sèches — et combien de temps ça coûte.
    """
    if ing.get("from_accepts"):
        pr = next((p for p in prelevements if p.trouve), None)
        if pr is None:
            return ABSENT
        return CHAINE if pr.out.get("_from") else FRIGO
    if cid in placard_ids:
        return PLACARD
    return COURSES


def gain_du_chainage(recipe):
    """Minutes évitées quand la base est déjà là : le plein tarif moins le prix chaîné."""
    sr = recipe.get("sans_reste") or {}
    plein = sr.get("temps_min")
    chaine = recipe.get("time_min_total")
    if plein and chaine and plein > chaine:
        return plein - chaine
    return 0
