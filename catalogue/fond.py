"""Le fond de roulement, la garde des denrées et le calendrier des saisons.

Trois fichiers nés le même jour (2026-10-18), d'une seule demande : que l'app
puisse un jour proposer un dîner plus sain AVEC CE QU'IL Y A DÉJÀ.

- `fond.yaml` — ce qu'on veut toujours avoir, et combien au moins ;
- `conservation.yaml:familles` — combien ça tient, et comment le ranger ;
- `saisons.yaml` — quand un légume est de saison autour de Lyon.

Ce module les charge, les exporte et les vérifie. Il ne décide RIEN : aucun
score ne lit ces données ici, et c'est délibéré — le moteur de suggestion est
un autre chantier, et lui donner un poids caché dans l'export serait le
réglage mort de T48 à l'envers.
"""

from pathlib import Path

import yaml

import chainage as ch
import garde_manger as gm


# ───────────────────────────────────────────────────────────── chargement

def charger_fond(chemin: Path) -> dict:
    """`{'date': str|None, 'denrees': [...], 'diners': [...]}` — jamais `None`.

    `date` FORCÉE EN TEXTE, pour la raison que `garde_manger.charger` donne
    déjà : PyYAML lit `2026-10-18` en `datetime.date`, que `json.dumps` refuse,
    et tout le reste du modèle manipule des dates en chaîne.
    """
    data = yaml.safe_load(chemin.read_text()) or {}
    d = data.get("date")
    return {
        "date": d.isoformat() if hasattr(d, "isoformat") else (d or None),
        "denrees": data.get("denrees") or [],
        "diners": data.get("diners") or [],
    }


def charger_saisons(chemin: Path) -> dict:
    data = yaml.safe_load(chemin.read_text()) or {}
    return {"region": data.get("region"), "mois": data.get("mois") or {}}


def familles(conserv: dict) -> list:
    return conserv.get("familles") or []


def famille_par_id(conserv: dict) -> dict:
    """Ingrédient → sa famille de garde. UN SEUL GAGNANT PAR ID : le
    vérificateur interdit les doublons, donc l'ordre n'a pas à départager."""
    return {i: f for f in familles(conserv) for i in f.get("ids") or []}


def disponibles_du_fond(fond: dict, rayons: dict) -> set:
    """Ce qu'on a TOUJOURS : le fond, plus le placard qu'on ne compte pas.

    C'est l'ensemble contre lequel « faisable sans courses » se mesure. Les
    alias sont résolus des deux côtés — `oignons` est `oignon`.
    """
    alias = rayons.get("aliases") or {}
    return ({alias.get(d["ingredient"], d["ingredient"]) for d in fond["denrees"]}
            | set(rayons.get("placard") or []))


def manques(recette: dict, disponibles: set, rayons: dict) -> list:
    """Les ingrédients d'une recette qui ne sont PAS dans `disponibles`.

    UNE BASE CHAÎNÉE SE REMPLACE PAR SON `sans_reste` : la salade de lentilles
    à la feta prend des lentilles cuites hier, et sans elles des lentilles
    sèches — c'est ce second chemin qui dit si le fond suffit, puisque le fond
    ne contient aucun reste. Les accompagnements (`avec:`) ne comptent pas :
    ce sont des suggestions de service, pas le plat.
    """
    alias = rayons.get("aliases") or {}
    lignes = [i for i in recette.get("ingredients") or [] if not i.get("from_accepts")]
    if any(i.get("from_accepts") for i in recette.get("ingredients") or []):
        lignes += (recette.get("sans_reste") or {}).get("ingredients") or []
    return sorted({alias.get(i["id"], i["id"]) for i in lignes} - disponibles)


# ──────────────────────────────────────────────────────────────── export

def exporter_familles(conserv: dict) -> list:
    """La garde, telle que l'app la lit. `fenetreJours` pour comparer,
    `fenetre` pour afficher — les deux formes de T55, pour la même raison."""
    return [{
        "id": f["id"], "label": f["label"], "fond": bool(f.get("fond")),
        "entameSeFinit": bool(f.get("entame_se_finit")),
        "espace": f["espace"], "rangement": f["rangement"],
        "methode": f.get("methode"),
        "fenetreJours": gm.fenetre_jours(f.get("fenetre")),
        "fenetre": gm._fenetre(f.get("fenetre")),
        "source": f["source"], "conseil": f["conseil"],
        "ids": list(f.get("ids") or []),
    } for f in familles(conserv)]


def exporter_fond(fond: dict) -> dict:
    return {
        "date": fond["date"],
        # `jusqua` et `hebdo` (T142) sortent toujours, `None`/`False` par
        # défaut : le type côté app n'a pas de champ optionnel de plus.
        "denrees": [{"ingredient": d["ingredient"], "minimum": d["minimum"],
                     "jusqua": d.get("jusqua"), "hebdo": bool(d.get("hebdo")),
                     "unite": d["unite"]} for d in fond["denrees"]],
        "diners": [{"plat": d["plat"], "titre": d["titre"]} for d in fond["diners"]],
    }


# ─────────────────────────────────────────────────────────── vérification

def verifier_familles(conserv: dict, rayons: dict) -> tuple:
    """Une famille de garde est un fait affiché à quelqu'un devant son placard :
    tout ce qui la rendrait muette ou contradictoire est une erreur."""
    err, warn = [], []
    connus = gm.vocabulaire(rayons)
    methodes = {m["id"] for m in conserv.get("methodes") or []}
    vus, ids_famille = {}, set()
    for f in familles(conserv):
        fid = f.get("id", "?")
        ou = f"famille « {fid} »"
        if fid in ids_famille:
            err.append(f"{ou} déclarée deux fois")
        ids_famille.add(fid)
        if f.get("espace") not in ch.ESPACES:
            err.append(f"{ou} : espace « {f.get('espace')} » inconnu — attendu parmi {list(ch.ESPACES)}")
        if not isinstance(f.get("fond"), bool):
            err.append(f"{ou} : `fond:` doit dire oui ou non — c'est lui qui décide du plancher")
        if not isinstance(f.get("entame_se_finit", False), bool):
            err.append(f"{ou} : `entame_se_finit:` doit dire oui ou non — c'est lui qui "
                       "décide de la boîte entière (T140)")
        # UNE FENÊTRE QU'ON NE SAIT PAS CONVERTIR EST UNE FENÊTRE ABSENTE, et
        # `fenetre_jours` le dit en rendant `None` : l'app n'aurait rien à
        # comparer, et retomberait en silence sur un défaut.
        if gm.fenetre_jours(f.get("fenetre")) is None:
            err.append(f"{ou} : fenêtre illisible {f.get('fenetre')!r} — attendu "
                       f"{{unite: {'|'.join(gm._EN_JOURS)}, valeur: N}}")
        if f.get("methode") is not None and f["methode"] not in methodes:
            err.append(f"{ou} : méthode « {f['methode']} » absente de `methodes`")
        for cle in ("label", "rangement", "conseil", "source"):
            if not (isinstance(f.get(cle), str) and f[cle].strip()):
                err.append(f"{ou} : `{cle}:` manquant — "
                           + ("une fenêtre sans source se lit comme une mesure"
                              if cle == "source" else "l'écran n'aurait rien à dire"))
        if not f.get("ids"):
            err.append(f"{ou} : aucune denrée")
        for i in f.get("ids") or []:
            if i not in connus:
                err.append(f"{ou} : « {i} » sans rayon (à ajouter dans rayons.yaml)")
            if i in vus:
                err.append(f"« {i} » est dans deux familles (« {vus[i]} » et « {fid} ») : "
                           "deux fenêtres pour la même denrée, et l'écran choisirait")
            vus[i] = fid
    return err, warn


def verifier_fond(fond: dict, conserv: dict, rayons: dict, cat: dict) -> tuple:
    """Le fond tient deux promesses, et les deux se vérifient.

    1. CE QU'IL LISTE SE GARDE. Chaque denrée appartient à une famille
       `fond: true` — sinon c'est du frais fragile qu'on prétend avoir
       toujours, et le plancher réclamerait une salade tous les samedis.
    2. SES DIX DÎNERS SE FONT SANS COURSES. Chacun se cuisine avec le fond et
       le placard seuls. Le jour où une recette gagne un ingrédient de plus,
       la promesse du brouillon devient fausse : c'est ici qu'elle rougit.
    """
    err, warn = [], []
    connus = gm.vocabulaire(rayons)
    alias = rayons.get("aliases") or {}
    par_id = famille_par_id(conserv)
    vus = set()
    for d in fond["denrees"]:
        iid = d.get("ingredient", "?")
        ou = f"fond « {iid} »"
        cid = alias.get(iid, iid)
        if cid != iid:
            err.append(f"{ou} : écrire l'id canonique « {cid} » — un alias dans le fond "
                       "ferait deux planchers pour une seule denrée")
        if cid not in connus:
            err.append(f"{ou} : ingrédient sans rayon (à ajouter dans rayons.yaml)")
        if cid in vus:
            err.append(f"{ou} : listé deux fois")
        vus.add(cid)
        m = d.get("minimum")
        if not isinstance(m, int) or isinstance(m, bool) or m < 1:
            err.append(f"{ou} : `minimum` doit être un entier ≥ 1, en unités d'achat (lu : {m!r})")
        j = d.get("jusqua")
        if j is not None and (not isinstance(j, int) or isinstance(j, bool)
                              or not isinstance(m, int) or j <= m):
            err.append(f"{ou} : `jusqua` doit être un entier au-dessus du minimum (lu : {j!r}) — "
                       "c'est jusqu'où l'on remonte en rachetant")
        if not isinstance(d.get("hebdo", False), bool):
            err.append(f"{ou} : `hebdo:` doit dire oui ou non")
        if not (isinstance(d.get("unite"), str) and d["unite"].strip()):
            err.append(f"{ou} : `unite` manquante — « 2 » ne se vérifie pas sans savoir deux quoi")
        f = par_id.get(cid)
        if f is None:
            err.append(f"{ou} : aucune famille de garde dans conservation.yaml — "
                       "sans fenêtre ni conseil, l'app ne sait ni combien ça tient ni où le ranger")
        elif not f.get("fond") and not d.get("hebdo"):
            err.append(f"{ou} : sa famille « {f['id']} » est du frais fragile (`fond: false`) — "
                       "il ne peut pas être « toujours là » (sauf frais de la semaine, `hebdo: true`)")

    dispo = disponibles_du_fond(fond, rayons)
    for d in fond["diners"]:
        rid = d.get("plat", "?")
        r = cat.get(rid)
        if r is None:
            err.append(f"dîner du fond « {rid} » absent du catalogue")
            continue
        if r.get("role", "plat") != "plat":
            err.append(f"dîner du fond « {rid} » : rôle « {r.get('role')} », pas un plat")
        m = manques(r, dispo, rayons)
        if m:
            err.append(f"dîner du fond « {rid} » demande {', '.join(m)}, hors du fond et du "
                       "placard : la promesse « sans courses » est fausse")
    return err, warn


def verifier_routines(creneaux: dict, cat: dict) -> tuple:
    """T142 — une routine se rejoue chaque jour : tout ce qu'elle nomme doit exister.

    Une `recette` absente ne retirerait rien, en silence ; un type `du_depot`
    qu'aucune recette n'émet ne serait jamais trouvé au congélateur.
    """
    err, warn = [], []
    r = creneaux.get("routines")
    if not r:
        return err, warn
    if r.get("depuis") is None:
        err.append("routines : `depuis` manquant — sans date, le rejeu viderait le placard depuis toujours")
    emis = {e.get("type") for x in cat.values() for e in x.get("emits") or []}
    repas = creneaux.get("repas") or {}
    for rid, cfg in r.items():
        if rid == "depuis":
            continue
        ou = f"routine « {rid} »"
        if (repas.get(rid) or {}).get("nature") != "routine":
            err.append(f"{ou} : le repas n'est pas de nature `routine` dans `repas`")
        rec = cat.get((cfg or {}).get("recette"))
        if rec is None:
            err.append(f"{ou} : recette « {(cfg or {}).get('recette')} » absente du catalogue")
        elif rec.get("source"):
            err.append(f"{ou} : la ration est une recette DU FOYER, pas celle d'un livre")
        dd = (cfg or {}).get("du_depot") or {}
        for t in dd.get("types") or []:
            if t not in emis:
                err.append(f"{ou} : type « {t} » qu'aucune recette n'émet")
        p = dd.get("parts", 1)
        if not isinstance(p, (int, float)) or isinstance(p, bool) or p <= 0:
            err.append(f"{ou} : `du_depot.parts` doit être un nombre > 0")
    return err, warn


def verifier_saisons(saisons: dict, rayons: dict) -> tuple:
    err, warn = [], []
    connus = gm.vocabulaire(rayons)
    for iid, mois in (saisons.get("mois") or {}).items():
        ou = f"saison « {iid} »"
        if iid not in connus:
            err.append(f"{ou} : ingrédient sans rayon (à ajouter dans rayons.yaml)")
        if not isinstance(mois, list) or not mois:
            err.append(f"{ou} : une liste de mois non vide est attendue")
            continue
        if any(not isinstance(x, int) or isinstance(x, bool) or not 1 <= x <= 12 for x in mois):
            err.append(f"{ou} : des mois de 1 à 12, lu {mois!r}")
        if len(set(mois)) != len(mois):
            err.append(f"{ou} : mois en double {mois!r}")
    return err, warn


def mesure(cat: dict, fond: dict, rayons: dict) -> dict:
    """Combien de dîners le fond permet — le chiffre qui justifie ce fichier.

    Un dîner : un `plat` qu'on peut proposer le soir (créneau `diner`, ou pas
    de créneau du tout, ce qui vaut déjeuner et dîner). Rendu en trois
    grandeurs, parce que « à un ingrédient près » est la vraie question du
    samedi : c'est elle qui dit quel frais acheter.
    """
    dispo = disponibles_du_fond(fond, rayons)
    diners = [r for r in cat.values() if r.get("role", "plat") == "plat"
              and "diner" in (r.get("creneaux") or ["dejeuner", "diner"])]
    par = [len(manques(r, dispo, rayons)) for r in diners]
    return {"diners": len(diners), "zero": par.count(0), "un": par.count(1)}
