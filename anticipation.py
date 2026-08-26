"""Le second axe du temps : ce qu'il faut avoir lancé AVANT.

POURQUOI CE MODULE EXISTE
-------------------------
Le modèle ne connaissait qu'une horloge : les MINUTES DE CUISINE d'une étape. Il
avait par ailleurs un calendrier — quel plat à quel créneau — et rien entre les
deux. Or l'essentiel de ce qui rate un dîner ne se joue ni dans l'une ni dans
l'autre : ça se joue la veille au soir, quand personne n'a mis les légumineuses
à tremper.

Huit recettes du catalogue portaient déjà l'aveu en commentaire, toujours dans
les mêmes termes — « le trempage n'est pas dans ce chiffre », « les 2 h de
décongélation ne sont pas dedans », « faute de pouvoir exprimer une attente dans
le modèle ». Les pois chiches trempent une nuit (p. 36), l'orge 12 h (p. 56 et le
blog), le poisson décongèle 2 h (p. 51), la pâte repose 1 h (p. 58), le rôti se
cuit la veille pour être mangé froid (p. 55). Cinq recettes sur vingt-quatre,
c'est-à-dire pas un cas limite.

CE QUI MANQUAIT N'EST PAS UN CHAMP « LA VEILLE », C'EST L'ATTENTE
-----------------------------------------------------------------
La tentation était d'écrire `avance: veille` sur les étapes concernées. C'est
l'erreur que ce dépôt répare en boucle : une étiquette posée à la main là où une
grandeur se déduit. Il suffit d'une seule donnée honnête —

    attente_min: combien de temps ça ATTEND après le geste, sans personne

— et tout le reste tombe par arithmétique. Une recette se découpe alors en
SESSIONS : là où l'attente est trop longue pour rester devant le plan de travail,
on part, et ce qui suit est une autre séance de cuisine. La veille n'est pas un
champ, c'est ce qui arrive quand 12 h d'attente reculent la première session
au-delà de minuit.

Ça se paie tout de suite en justesse :

- les 3 min de « mettre à tremper » ne sont plus facturées au dîner de demain,
  elles sont facturées à ce soir — le seul moment où quelqu'un peut les faire ;
- une recette dit enfin À QUELLE HEURE la commencer, ce que « 50 min » ne dit
  pas quand la pâte repose une heure au milieu ;
- et la semaine devient annonçable la veille au soir, ce qui est la seule forme
  d'aide à l'anticipation qui serve à quelque chose : un rappel après coup n'est
  qu'un reproche.

LES DEUX BOUTS DU MÊME AXE
--------------------------
`attente_min` dit « pas moins de ». Il existe le contraire, et le catalogue le
porte déjà : le gâteau de la p. 61 réclame la mousse de la p. 59 ENCORE TIÈDE,
avant qu'elle ne prenne. `delai_max_h` sur une arête `accepts` dit « pas plus
de » — chaîner maintenant, ou pas du tout. Les deux mesurent l'écart entre deux
moments, que le modèle ne savait pas mesurer du tout.
"""

import datetime as dt
from dataclasses import dataclass

# Au-delà de cette attente, on ne reste pas dans la cuisine : on s'en va, et ce
# qui suit est une autre séance. Le seuil est un paramètre de modèle, pas une
# vérité — 1 h de repos de pâte se passe à la maison, 2 h de marinade non.
COUPURE_MIN = 90

# Faute d'heure déclarée sur un repas, celles-ci. Elles ne servent qu'à situer
# un geste dans la journée ; se tromper d'une heure ne change rien à « c'est la
# veille au soir », qui est l'information utile.
HEURES_DEFAUT = {"petit-dejeuner": 8, "dejeuner": 12.5, "gouter": 16, "diner": 20}

RAISONS = {
    "trempage": "trempage",
    "decongelation": "décongélation",
    "repos": "repos",
    "maceration": "macération",
    "refroidissement": "refroidissement",
    # Arrivées avec l'automne : le yaourt de soja p. 159 fermente 8 h, le riz au
    # lait p. 158 « prend au frais au moins 4 h ». Ni l'un ni l'autre n'est un
    # repos — on n'attend pas que ça se calme, on attend que ça DEVIENNE autre
    # chose. Le libellé compte : c'est ce que l'agenda affichera au cuisinier.
    "fermentation": "fermentation",
    "prise-au-frais": "prise au frais",
    # La glace p. 104 : le congélateur n'est plus un rangement, c'est une étape
    # de la recette. Quatre heures pendant lesquelles il occupe une place que
    # `equilibre.congelateur` croit réservée aux portions de secours.
    "prise-au-congelateur": "prise au congélateur",
}


# ------------------------------------------------------------------- horloge

def heure_de(repas_conf, repas):
    """L'heure du repas, en heures décimales. Un créneau n'avait jusqu'ici
    qu'un jour : c'est ce qui rendait « la veille au soir » indicible."""
    conf = (repas_conf or {}).get(repas) or {}
    return float(conf.get("heure", HEURES_DEFAUT.get(repas, 20)))


def quand_repas(date, repas_conf, repas):
    h = heure_de(repas_conf, repas)
    return dt.datetime.combine(date, dt.time(0)) + dt.timedelta(hours=h)


def _arrondi_quart(moment):
    """Aucun de ces horaires n'est précis à la minute — les afficher ainsi
    serait mentir sur la précision du modèle."""
    q = (moment.minute + 7) // 15 * 15
    return moment.replace(minute=0, second=0, microsecond=0) + dt.timedelta(minutes=q)


def dire_quand(moment, date_repas):
    """« hier soir vers 19 h », « le matin même vers 8 h » — ce qu'on dit à
    quelqu'un, pas un horodatage."""
    moment = _arrondi_quart(moment)
    ecart = (date_repas - moment.date()).days
    h = moment.hour + moment.minute / 60
    creneau = ("dans la nuit" if h < 6 else "au matin" if h < 11
               else "à midi" if h < 14 else "dans l'après-midi" if h < 18
               else "au soir")
    jour = ("le jour même" if ecart == 0 else "la veille" if ecart == 1
            else "l'avant-veille" if ecart == 2 else f"{ecart} jours avant")
    heure = f"{moment.hour} h" + (f" {moment.minute:02d}" if moment.minute else "")
    return f"{jour} {creneau}, vers {heure}"


# ------------------------------------------------------------------ sessions

@dataclass(frozen=True)
class Session:
    """Une séance de cuisine : ce qui s'enchaîne sans qu'on quitte la pièce.

    `debut_avant_min` est ce qu'on veut vraiment savoir — combien de minutes
    avant le repas il faut s'y mettre. Il se calcule depuis la FIN : la dernière
    session finit à l'heure du repas, et chaque attente recule tout ce qui la
    précède.
    """
    etapes: tuple
    gestes_min: int          # minutes de cuisine effectives, parallélisme déduit
    attente_min: int         # l'attente qui la clôt (0 pour la dernière)
    debut_avant_min: int
    fin_avant_min: int

    @property
    def raison(self):
        for s in reversed(self.etapes):
            if s.get("attente_min"):
                return s.get("attente_raison")
        return None

    @property
    def geste(self):
        """Ce qu'il y a à faire, en une phrase — l'action de l'étape unique, ou
        la première suivie du nombre des autres."""
        actions = [s.get("action", "") for s in self.etapes]
        if len(actions) == 1:
            return actions[0]
        return f"{actions[0]} (puis {len(actions) - 1} étape(s))"


def _minutes(step, temps=None):
    return int(temps(step) if temps else step.get("time_min", 0))


def decouper(recipe, coupure_min=COUPURE_MIN, temps=None) -> list:
    """La recette en sessions, de la plus lointaine à celle du repas.

    `temps` permet à `compile.py` de passer ses minutes RÉSOLUES contre le foyer
    (une étape au petit blender coûte 3 min de plus) sans que ce module ait à
    connaître les capacités.
    """
    etapes = recipe.get("steps") or []
    if not etapes:
        return []

    groupes, courant = [], []
    for s in etapes:
        courant.append(s)
        if int(s.get("attente_min", 0)) >= coupure_min:
            groupes.append((courant, int(s["attente_min"])))
            courant = []
    if courant:
        groupes.append((courant, 0))
    elif groupes:
        # Une recette qui se termine sur une longue attente (le rôti qu'on mange
        # froid le lendemain) : le repas lui-même clôt la dernière session, il
        # n'y a rien à faire au retour.
        groupes.append(([], 0))

    sessions, fin = [], 0
    for etapes_g, attente in reversed(groupes):
        # Une étape en parallèle ne s'ajoute pas au chrono, exactement comme
        # dans `compile.plan_total` — deux calculs du même nombre finiraient
        # par diverger, mais ce module ne voit pas les capacités du foyer.
        gestes = sum(_minutes(s, temps) for s in etapes_g if not s.get("parallel_with"))
        attentes_courtes = sum(int(s.get("attente_min", 0)) for s in etapes_g
                               if int(s.get("attente_min", 0)) < coupure_min)
        span = gestes + attentes_courtes
        # La fin de cette session, c'est l'attente qui la clôt, plus tout ce qui
        # vient après. Compter l'attente sur la session SUIVANTE la ferait
        # disparaître pour un plat qui se termine par elle — le rôti qu'on
        # mange froid le lendemain se serait retrouvé à cuire pendant le repas.
        fin_avant = fin + attente
        debut_avant = fin_avant + span
        sessions.append(Session(etapes=tuple(etapes_g), gestes_min=gestes,
                                attente_min=attente,
                                debut_avant_min=debut_avant,
                                fin_avant_min=fin_avant))
        fin = debut_avant
    sessions.reverse()
    return [s for s in sessions if s.etapes]


def anticipations(recipe, coupure_min=COUPURE_MIN, temps=None) -> list:
    """Les sessions qui se terminent AVANT le repas. Vide pour la quasi-totalité
    du catalogue, et c'est bien ainsi : la plupart des plats se cuisinent d'un
    seul tenant."""
    return [s for s in decouper(recipe, coupure_min, temps) if s.fin_avant_min > 0]


def minutes_sur_place(recipe, coupure_min=COUPURE_MIN, temps=None) -> int:
    """Les minutes qui se paient VRAIMENT à l'heure du repas.

    C'est le chiffre que l'offre de la semaine doit afficher : les 3 min de
    trempage sont réelles, mais elles se dépensent la veille, et les compter
    dans le dîner de demain revient à dire à quelqu'un qui a 20 min qu'il n'en
    a que 17. Un plat entièrement cuisiné la veille — le rôti servi froid —
    tombe à zéro, ce qui est la vérité : ce jour-là on le tranche.

    On RETRANCHE du total annoncé plutôt que de resommer les étapes. Les deux
    chiffres diffèrent déjà pour d'autres raisons — les samoussas annoncent
    90 min et en coûtent 121 chez ce foyer — et mélanger les deux écarts ferait
    passer une correction d'anticipation pour une correction d'estimation.
    """
    total = int(recipe.get("time_min_total", 0) or 0)
    ss = decouper(recipe, coupure_min, temps)
    if not ss:
        return total
    anticipe = sum(s.gestes_min for s in ss if s.fin_avant_min > 0)
    if total:
        return max(0, total - anticipe)
    return sum(s.gestes_min for s in ss if s.fin_avant_min == 0)


def duree_totale(recipe, coupure_min=COUPURE_MIN, temps=None) -> int:
    """Du premier geste au repas, attentes comprises. C'est ce que le livre
    appelle « prép. + cuisson » et qu'il n'a jamais mesuré."""
    ss = decouper(recipe, coupure_min, temps)
    return ss[0].debut_avant_min if ss else 0


# --------------------------------------------------------------- échéances

def echeances(recipe, quand, coupure_min=COUPURE_MIN, temps=None) -> list:
    """Les gestes à anticiper pour un repas servi à `quand` (datetime).

    Chacun porte son échéance, ce qu'il coûte en minutes et de quoi le dire à
    voix haute. C'est la matière de l'agenda.

    `limite` est un AU PLUS TARD, jamais un rendez-vous : 12 h de trempage avant
    un dîner à 19 h 30, c'est 7 h du matin, et tremper depuis la veille au soir
    convient tout aussi bien. C'est `semaine_model.agenda()` qui sait accrocher
    le geste à un moment où quelqu'un est de toute façon dans la cuisine — il a
    les créneaux, ce module n'a qu'une horloge. `attente_souple: false` marque
    ce qui ne se remonte pas : un rôti cuit trois jours avant n'est plus le même
    plat.
    """
    out = []
    for s in anticipations(recipe, coupure_min, temps):
        limite = quand - dt.timedelta(minutes=s.debut_avant_min)
        out.append({
            "quand": limite,
            "limite": limite,
            "dit": "au plus tard " + dire_quand(limite, quand.date()),
            "souple": all(e.get("attente_souple", True) for e in s.etapes),
            "geste": s.geste,
            "minutes": s.gestes_min,
            "attente_min": s.attente_min,
            "raison": RAISONS.get(s.raison, s.raison),
            "etapes": [e.get("id") for e in s.etapes],
            "rattrapage": next((e.get("rattrapage") for e in reversed(s.etapes)
                                if e.get("rattrapage")), None),
        })
    return out


def en_retard(ech, maintenant) -> bool:
    """L'échéance est-elle déjà passée ? On compare à la LIMITE, pas au moment
    praticable : rater l'heure conseillée n'est pas rater le plat.

    Un plat dont le trempage était pour hier soir n'est pas interdit — il est
    plus cher, et il faut le dire AVANT de le choisir, pas au moment de le
    cuisiner. C'est la règle 7 Wonders du dépôt, appliquée au temps."""
    return maintenant is not None and ech["limite"] < maintenant


# ------------------------------------------------------ décongélation dérivée

def decongelation_h(foyer, rules) -> tuple:
    """(heures d'avance, comment) pour sortir une portion du congélateur.

    Dérivé, jamais écrit sur une recette : c'est une propriété du FOYER. Et
    c'est la trouvaille désagréable de ce module — `bilan_congelo` appelle ces
    portions « portions d'urgence », la carte qu'on joue le soir où tout
    s'effondre. Sans micro-ondes, elles réclament une nuit de préavis : c'est
    une réserve, pas une urgence. Les deux mots ne désignent pas la même chose.
    """
    caps = {c for eq in foyer.get("equipment", []) for c in eq.get("capabilities", [])}
    for etape in (rules.get("capabilities", {}).get("decongeler") or []):
        tid = etape.get("tool")
        if tid == "none" or any(eq["id"] == tid for eq in foyer.get("equipment", [])):
            return float(etape.get("avance_h", 0)), etape.get("rewrite") or ""
        if tid in caps:
            return float(etape.get("avance_h", 0)), etape.get("rewrite") or ""
    return 12.0, "au frigo, la veille"


# ------------------------------------------------------------ « pas plus de »

def delai_max_h(acc):
    """L'autre bout de l'axe : une base qui ne se chaîne que TOUT DE SUITE.

    La mousse au chocolat de la p. 59 entre dans le gâteau de la p. 61 « encore
    tiède », avant d'avoir pris. La fenêtre de fraîcheur du stock se compte en
    JOURS, donc celle d'hier au frigo passe le test et rate la recette.
    """
    v = (acc or {}).get("delai_max_h")
    return float(v) if v is not None else None
