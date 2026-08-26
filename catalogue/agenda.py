"""L'agenda : des échéances accrochées à des moments où on est déjà là.

CE MODULE NE SAIT PAS CE QU'EST UNE RECETTE, ET C'EST LE POINT
--------------------------------------------------------------
L'anticipation est arrivée par la cuisine — le trempage de la veille — mais
elle n'y reste pas. Le jardin a exactement la même forme : un semis a une
fenêtre, un voile d'hivernage se pose AVANT la gelée, et le rappel ne sert que
s'il tombe à un moment où on est de toute façon devant la jardinière. La facette
change, la mécanique non. Ce fichier est donc écrit sans un seul mot de cuisine :
`semaine_model` lui fournit des présences et des échéances, une autre facette en
fournirait d'autres, et l'agenda est leur réunion.

LES TROIS OBJETS
----------------
**Une échéance** est un geste avec un « au plus tard ». Elle est SOUPLE si la
remonter ne coûte rien (tremper plus longtemps ne gâche rien) et RIGIDE sinon
(un rôti cuit trois jours trop tôt n'est plus le même plat).

**Une présence** est un moment où quelqu'un est déjà là — sans elle, un rappel
n'est qu'une alarme. C'est la seule donnée que chaque facette doit savoir
produire, et c'est plus étroit qu'il n'y paraît : un déjeuner emporté au
coworking est un repas, mais ce n'est pas un moment dans la cuisine.

**Une visite** est ce que les deux donnent ensemble : tout ce qu'on doit faire
pendant qu'on y est. C'est l'unité qui s'annonce. Annoncer geste par geste
redemande l'attention trois fois pour un seul déplacement ; annoncer la visite
la demande une fois et dit combien de temps elle prend vraiment.

POURQUOI LA VISITE EST L'UNITÉ, ET PAS LE GESTE
------------------------------------------------
Parce que la charge ne s'additionnait nulle part. Le modèle avait appris à
RETRANCHER les minutes anticipées du repas qui les subissait à tort — les 3 min
de trempage ne sont pas dans le dîner de demain — et ne les avait jamais
AJOUTÉES au soir qui les paie. Elles étaient tombées par terre entre les deux.
Un lundi soir qui affiche 20 min et en demande 98 ne se corrige pas en changeant
un chiffre : il se corrige en ayant un objet qui rassemble ce qui se passe au
même endroit au même moment.
"""

import datetime as dt
from dataclasses import dataclass

# De combien on accepte de prendre de l'avance sur une échéance qui ne se
# remonte pas. Un rôti cuit six heures trop tôt reste un rôti ; trois jours
# trop tôt, non. Ne s'applique QU'aux échéances rigides : une échéance souple
# se remonte autant qu'on veut, c'est ce que « souple » veut dire.
AVANCE_RIGIDE_MAX_H = 6


@dataclass(frozen=True)
class Presence:
    """Un moment où quelqu'un est déjà là, et pour combien de temps.

    `cle` est ce que la facette veut retrouver ensuite (ici l'index du créneau) ;
    l'agenda ne l'interprète pas. `charge_min` est ce que la présence coûte par
    elle-même — cuisiner le repas — avant que l'agenda n'y ajoute le reste.
    """
    quand: dt.datetime
    label: str
    cle: object = None
    facette: str = "cuisine"
    charge_min: int = 0


@dataclass(frozen=True)
class Visite:
    """Une présence et tout ce qu'elle doit porter."""
    presence: Presence
    echeances: tuple = ()

    @property
    def quand(self):
        return self.presence.quand

    @property
    def charge_min(self):
        """Les minutes réellement dues à ce moment-là — le motif de la présence
        plus tout ce qui s'y est accroché. C'est le chiffre qui manquait."""
        return self.presence.charge_min + sum(int(e.get("minutes", 0))
                                              for e in self.echeances)

    @property
    def debut(self):
        """L'heure à laquelle il faut vraiment y être.

        Une présence est datée par son MOTIF — le repas est à 19 h 30 — mais on
        entre dans la cuisine avant. Ce début-là recule quand demain demande
        quelque chose à ce soir, et c'est précisément l'information qu'aucune
        des deux moitiés du modèle ne pouvait donner seule.
        """
        return self.presence.quand - dt.timedelta(minutes=self.charge_min)

    @property
    def emprunte(self):
        """Les minutes de cette visite qui ne servent pas son propre motif."""
        return self.charge_min - self.presence.charge_min


def ancrer(limite, souple, presences, max_h=AVANCE_RIGIDE_MAX_H):
    """La dernière présence qui précède `limite`, ou None.

    Une échéance est une heure ; un rappel utile est un MOMENT OÙ ON EST DÉJÀ
    LÀ. « Au plus tard à 7 h 05 » se dit mieux « dimanche, en dînant ».

    Le tri est fait ICI, sur l'heure, et non par confiance dans l'ordre de la
    liste reçue : la version précédente prenait le dernier élément d'un filtre
    et se trompait dès qu'une facette rangeait ses présences autrement que par
    l'horloge — ce que la cuisine faisait, en listant le goûter de mercredi
    après le dîner du même jour parce que `creneaux.yaml` le déclare en dernier.
    Un ordre supposé n'est pas un ordre.
    """
    avant = sorted((p for p in presences if p.quand <= limite), key=lambda p: p.quand)
    if not avant:
        return None
    p = avant[-1]
    if not souple and limite - p.quand > dt.timedelta(hours=max_h):
        return None
    return p


def visites(presences, echeances, max_h=AVANCE_RIGIDE_MAX_H) -> list:
    """Les présences, chronologiques, chacune portant ce qui s'y accroche.

    Une présence sans rien à y faire de plus reste une visite : c'est là qu'on
    voit qu'une soirée est libre. Une échéance qui ne trouve pas de présence
    n'est pas perdue — elle ressort dans `orphelines`, parce que « je n'ai pas
    su quand te le dire » est une réponse et que se taire n'en est pas une.
    """
    ordre = sorted(presences, key=lambda p: p.quand)
    portees, orphelines = [[] for _ in ordre], []
    for e in echeances:
        p = ancrer(e["limite"], e.get("souple", True), presences, max_h)
        if p is None:
            orphelines.append(e)
        else:
            # Par identité : deux présences peuvent être égales au sens des
            # champs (deux jardinières, même heure) sans être la même.
            portees[next(i for i, q in enumerate(ordre) if q is p)].append(e)
    vs = [Visite(presence=p, echeances=tuple(sorted(portees[i],
                                                    key=lambda e: e["limite"])))
          for i, p in enumerate(ordre)]
    return vs, orphelines


def curseur(vs, maintenant) -> dict:
    """Où on en est. C'est tout ce que « maintenant » veut dire ici.

    Une visite est COURANTE entre le moment où il faut s'y mettre et le moment
    du repas ; passée ensuite. Le découpage se fait sur `debut`, pas sur
    `quand` : à 19 h 15 un dîner de 19 h 30 qui demande 98 min n'est pas « à
    venir », il est en retard d'une heure et demie.
    """
    passees, prochaines, courante = [], [], None
    for v in vs:
        if maintenant is not None and maintenant >= v.presence.quand:
            passees.append(v)
        elif maintenant is not None and maintenant >= v.debut and courante is None:
            courante = v
        else:
            prochaines.append(v)
    ratees = [e for v in passees for e in v.echeances
              if maintenant is not None and e["limite"] < maintenant]
    return {"passees": passees, "courante": courante, "prochaines": prochaines,
            "prochaine": (courante or (prochaines[0] if prochaines else None)),
            "ratees": ratees}
