"""Le garde-manger : les rangements physiques, et la matière première dedans.

UN OBJET DE PLUS, PARCE QUE LES DEUX QUI EXISTAIENT NE POUVAIENT PAS LE PORTER.

- `stock.yaml` porte les sorties de CUISINE, indexées sur les types que les
  recettes émettent. Une conserve de maïs n'en est pas une, et lui donner
  `kind: base` la ferait entrer dans le graphe de chaînage.
- `rayons.placard` marque ce qu'on possède TOUJOURS — sel, huile, poivre. C'est
  une appartenance, sans quantité ni endroit : elle dit qu'on a du sel, jamais
  qu'on a quatre boîtes de maïs de 285 g.

Ce module lit le troisième, le valide, et dérive de ses dimensions les deux
seules grandeurs qu'on ne veut pas voir saisies à la main : le volume d'une zone
et le poids qu'elle porte. Une donnée saisie deux fois diverge ; ces deux-là se
calculent.

CE QUE LE MODÈLE NE FAIT PAS. Rien ne décrémente une denrée quand on cuisine, et
le garde-manger reste donc DESCRIPTIF : `provenance()` continue de lire
`rayons.placard`, pas ce fichier. Brancher les deux demande un modèle de
consommation qui n'existe pas encore — c'est au backlog.
"""

from pathlib import Path

import yaml

import chainage as ch

# Ce qui peut abîmer une denrée, et l'attribut de zone qui le contredit. La
# table EST la règle : ajouter une sensibilité, c'est ajouter une ligne ici, et
# le vérificateur la joue sans rien savoir de plus.
AGRESSIONS = {
    "lumiere": ("exposition", "jour", "à la lumière du jour"),
    "humidite": ("hygrometrie", "humide", "dans un endroit humide"),
    "chaleur": ("chaleur", True, "près d'une source de chaleur"),
}

EXPOSITIONS = ("jour", "sombre")
HYGROMETRIES = ("sec", "humide")

# LA FORME CORRIGE LE VOLUME, ET L'ÉCART N'EST PAS ANECDOTIQUE. Les deux plateaux
# d'angle sont des demi-disques : leur surface vaut π/4 de celle du rectangle qui
# les contient, soit 21 % de moins. Les compter en boîte donnait 67 L pour un
# plateau qui en porte 53, et un budget de rangement faux d'un cinquième est un
# budget qui déborde sans prévenir.
FORMES = {"rectangle": 1.0, "demi-lune": 0.785}

# L'état dit COMMENT c'est conditionné, ce qui décide de la barrière que ça
# oppose au monde. Un sachet entamé et une conserve ne se conservent pas pareil,
# et ce n'est pas la denrée qui change — c'est son emballage.
ETATS = ("conserve", "bocal", "sec", "entame", "frais")


# Un id se lit à l'écran, et « pignons-pin » n'est pas du français. Le
# dé-tiretisage vit ici parce que l'alerte est écrite ici : elle doit sortir
# lisible du modèle, pas être recousue par l'interface.
def _nom(ingredient: str) -> str:
    return ingredient.replace("-", " ")


def _label(zone: dict) -> str:
    return zone.get("label") or zone["id"]


def charger(chemin: Path) -> dict:
    """`{'zones': [...], 'denrees': [...]}`, jamais `None` sur un fichier vide."""
    data = yaml.safe_load(chemin.read_text()) or {}
    return {"zones": data.get("zones") or [], "denrees": data.get("denrees") or []}


def volume_litres(zone: dict):
    """Le volume utile d'une zone, en litres, ou `None`.

    `None` DÈS QU'UNE COTE MANQUE, et c'est voulu : le tiroir à épices n'a pas
    été mesuré, et lui inventer un volume en supposant une cote le ferait entrer
    dans un total qui serait faux sans le dire. Une zone à hauteur libre (le
    dessus de l'étagère) n'a pas de volume non plus — c'est une surface.
    """
    d = zone.get("dimensions") or {}
    cotes = [d.get("largeur_cm"), d.get("profondeur_cm"), d.get("hauteur_cm")]
    if any(c is None for c in cotes):
        return None
    coef = FORMES.get(zone.get("forme", "rectangle"), 1.0)
    return round(cotes[0] * cotes[1] * cotes[2] * zone.get("niveaux", 1) * coef / 1000, 1)


def poids_g(denree: dict):
    """La matière d'une ligne, en grammes, ou `None` si elle n'est pas pesée.

    On ne convertit pas : une ligne en `ml` ou en `pièce` ne s'additionne pas à
    des grammes, et faire semblant produirait un total qui a l'air d'un poids.
    """
    q = denree.get("par_unite")
    if not q or q.get("unit") != "g" or q.get("amount") is None:
        return None
    return q["amount"] * denree.get("unites", 1)


def vocabulaire(rayons: dict) -> set:
    """Tous les ids d'ingrédients connus — les rayons ET le placard."""
    return {i for v in rayons["rayons"].values() for i in v} | set(rayons.get("placard") or [])


def alertes_rangement(gm: dict) -> list:
    """Les erreurs de RANGEMENT — et rien d'autre.

    DEUX NATURES D'AVERTISSEMENT COHABITAIENT, ET LES MÉLANGER LES ABÎMAIT TOUTES
    LES DEUX. « Le tiroir à épices n'a pas de cotes » parle du fichier et
    s'adresse à qui le tient ; « les pignons de pin sont à la lumière » parle de
    la cuisine et s'adresse à qui l'habite. Envoyées ensemble à l'écran, les
    secondes se noyaient dans les premières — et l'app affichait « à déplacer »
    au-dessus d'une remarque qu'aucun geste dans la cuisine ne peut résoudre.

    Cette fonction ne rend que ce qui se corrige en déplaçant quelque chose.
    `verifier_garde_manger` rend tout, parce que le vérificateur, lui, sert à
    tenir le fichier.
    """
    zones = {z["id"]: z for z in gm["zones"]}
    alertes = []

    par_zone = {}
    for d in gm["denrees"]:
        if d.get("zone") in zones:
            par_zone.setdefault(d["zone"], []).append(d)

    # UNE ALERTE PAR GESTE, ET C'EST CE QUI DÉCIDE DU REGROUPEMENT.
    #
    # Une ligne par (denrée × agression) donnait sept alertes pour trois
    # problèmes : les pignons de pin comptaient double — la lumière ET la
    # bouilloire — alors qu'un seul déplacement les règle, et le sous-évier
    # répétait quatre fois « dans un endroit humide » sous quatre légumes qu'on
    # sortira du même mouvement. Sept lignes ne se lisent pas ; trois, si.
    #
    # On groupe donc par zone ET par diagnostic identique : ce qui se corrige
    # ensemble se dit ensemble.
    for zid, dedans in par_zone.items():
        z = zones[zid]
        groupes = {}
        for d in dedans:
            dits = tuple(AGRESSIONS[s][2] for s in d.get("sensible") or []
                         if s in AGRESSIONS and z.get(AGRESSIONS[s][0]) == AGRESSIONS[s][1])
            if dits:
                groupes.setdefault(dits, []).append(_nom(d["ingredient"]))
        for dits, noms in groupes.items():
            alertes.append(f"{', '.join(noms)} — {' et '.join(dits)} ({_label(z)})")

        presents = {d["ingredient"] for d in dedans}
        for d in dedans:
            fautifs = sorted(_nom(f) for f in presents & set(d.get("incompatibles") or []))
            if fautifs:
                alertes.append(f"{_nom(d['ingredient'])} — ne devrait pas voisiner "
                               f"avec {', '.join(fautifs)} ({_label(z)})")
    return alertes


def verifier_garde_manger(gm: dict, rayons: dict) -> tuple:
    """Erreurs et avertissements du garde-manger, pour le vérificateur.

    LES ERREURS SONT DES INCOHÉRENCES DE DONNÉES : une zone en double, un espace
    inconnu, une denrée rattachée à un rangement qui n'existe pas, un ingrédient
    hors vocabulaire. Toutes se corrigent en éditant le fichier.

    LES AVERTISSEMENTS MÊLENT LES DEUX MONDES, et c'est voulu ICI : qui lance le
    vérificateur veut tout voir, la donnée incomplète comme le sachet mal rangé.
    C'est l'EXPORT qui trie — voir `alertes_rangement`.
    """
    err, warn = [], []
    zones = {}

    for z in gm["zones"]:
        zid = z.get("id", "?")
        if zid in zones:
            err.append(f"zone « {zid} » déclarée deux fois")
        zones[zid] = z
        if z.get("espace") not in ch.ESPACES:
            err.append(f"zone « {zid} » : espace « {z.get('espace')} » inconnu "
                       f"— attendu parmi {list(ch.ESPACES)}")
        if z.get("exposition") not in EXPOSITIONS:
            err.append(f"zone « {zid} » : exposition « {z.get('exposition')} » inconnue "
                       f"— attendu parmi {list(EXPOSITIONS)}")
        if z.get("hygrometrie") not in HYGROMETRIES:
            err.append(f"zone « {zid} » : hygrométrie « {z.get('hygrometrie')} » inconnue "
                       f"— attendu parmi {list(HYGROMETRIES)}")
        if not z.get("niveaux"):
            err.append(f"zone « {zid} » : il faut au moins un niveau")
        if z.get("forme", "rectangle") not in FORMES:
            err.append(f"zone « {zid} » : forme « {z.get('forme')} » inconnue "
                       f"— attendu parmi {sorted(FORMES)}")
        if volume_litres(z) is None:
            warn.append(f"zone « {zid} » : dimensions incomplètes, elle ne compte "
                        "dans aucun total de volume")

    connus = vocabulaire(rayons)
    # Qui est rangé où : c'est cette table qui permet de voir deux denrées
    # incompatibles partager une étagère, ce qu'aucune ligne ne dit toute seule.
    par_zone = {}

    for i, d in enumerate(gm["denrees"]):
        cid = d.get("ingredient", "?")
        ou = f"denrée « {cid} »"
        zid = d.get("zone")
        if zid not in zones:
            err.append(f"{ou} : zone « {zid} » inconnue")
        else:
            par_zone.setdefault(zid, []).append(d)
        if cid not in connus:
            err.append(f"{ou} : ingrédient sans rayon (à ajouter dans rayons.yaml)")
        if not d.get("unites"):
            err.append(f"{ou} : `unites` doit valoir au moins 1 — une denrée qu'on "
                       "n'a pas ne se range pas, elle s'efface")
        if d.get("etat") not in ETATS:
            err.append(f"{ou} : état « {d.get('etat')} » inconnu — attendu parmi {list(ETATS)}")
        for s in d.get("sensible") or []:
            if s not in AGRESSIONS:
                err.append(f"{ou} : sensibilité « {s} » inconnue "
                           f"— attendu parmi {sorted(AGRESSIONS)}")

    # Puis les erreurs de rangement, calculées au même endroit que celles que
    # l'export publie : deux implémentations de « craint la lumière » finiraient
    # par ne plus dire la même chose.
    warn += alertes_rangement(gm)
    return err, warn
