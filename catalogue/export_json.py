#!/usr/bin/env python3
"""Fabrique `public/cuisine-data.json`, le catalogue que l'app lit.

L'app ne possède pas les recettes : elle lit ce vidage. C'est ce qui garantit
que les cartes à l'écran sont exactement celles que le modèle Python distribue,
et qu'aucun plat n'est inventé côté interface.

  npm run catalogue            # depuis la racine du dépôt
  npm run catalogue:verifie    # vérifie le corpus PUIS que le JSON commité est à jour

CE DOCSTRING A MENTI PENDANT DEUX SEMAINES. Il annonçait « the visual proto
lives in another repo (chapellu/flagship, apps/proto-shell) » — l'app a
déménagé, deux fois, et personne n'a corrigé la ligne. Pendant ce temps le JSON
commité restait à 51 plats quand le corpus en portait 86, et le créneau
`dessert` n'a jamais atteint l'écran. Un export manuel dont la doc pointe
ailleurs est un export qui ne se fait pas : d'où `catalogue:verifie`, joué en
CI, qui échoue si le fichier commité diverge du corpus.
"""

import json
import sys
from pathlib import Path

import yaml

import anticipation as an
import catalogue
import chainage as ch
import compile as rc  # masque le `compile` natif dans ce module seulement
import garde_manger as gm
import saisons as sa

HERE = Path(__file__).parent


def _qty(bloc):
    """`{'amount': 700, 'unit': 'g'}` ou `None` — la forme que le JS relira."""
    amount, unit = ch.quantite(bloc)
    return {"amount": amount, "unit": unit} if amount is not None else None


def _bebe_apres(r):
    """L'id de l'étape après laquelle le prélèvement bébé se fait, ou `None`
    quand la recette ne dit pas d'où il sort — auquel cas l'écran retombe sur
    la porte d'assaisonnement, en devinant comme le fait `compile.py`."""
    bp = r.get("baby_portion") or {}
    depuis = set(bp.get("depuis") or [])
    rangs = [i for i, s in enumerate(r.get("steps", [])) if s.get("id") in depuis]
    return r["steps"][max(rangs)]["id"] if rangs else None


def _ouvert(contenant, espace, capacites):
    """Ce contenant compte-t-il dans cet espace, vu ce que le foyer sait faire ?"""
    besoin = (contenant.get("needs_pour") or {}).get(espace)
    return not besoin or besoin in capacites


def main():
    cat = catalogue.charger_recettes(HERE / "recipes")
    foyer = yaml.safe_load((HERE / "household.yaml").read_text())["household"]
    rayons = yaml.safe_load((HERE / "rayons.yaml").read_text())
    equilibre = yaml.safe_load((HERE / "equilibre.yaml").read_text())
    conserv = yaml.safe_load((HERE / "conservation.yaml").read_text())
    stock = yaml.safe_load((HERE / "stock.yaml").read_text())
    creneaux = yaml.safe_load((HERE / "creneaux.yaml").read_text())
    rules = yaml.safe_load((HERE / "rules.yaml").read_text())
    pantry = gm.charger(HERE / "garde-manger.yaml")
    sais = sa.charger(HERE / "saisons.yaml")
    _zones = {z["id"]: z for z in pantry["zones"]}

    # Tout ce que le foyer sait faire — l'union des capacités de ses outils et
    # des chaînes de dégradation. C'est ce qui décide si un bocal est une place
    # de placard ou seulement une boîte de frigo.
    capacites = set(rules.get("capabilities", {}))
    for eq in foyer.get("equipment", []):
        capacites |= set(eq.get("capabilities", []))

    # CHAQUE CAPACITÉ, RÉSOLUE UNE FOIS SUR L'OUTIL QUE CE FOYER POSSÈDE.
    # `needs:` est en capacités et jamais en outils — c'est le pari anti-explosion
    # de #31, et il tient. Mais du coup l'écran ne pouvait pas nommer la poêle :
    # il lisait « pan-fry ». Or au moment de démarrer le geste, ce qu'on veut lire
    # c'est « sauteuse 28 cm », et pour `chop-coarse` c'est la RÉÉCRITURE qui est
    # la vraie instruction — « au couteau, sur une planche ». La table se calcule
    # ici parce qu'elle ne dépend que du foyer, qui est statique côté proto.
    outils = {}
    for cap in sorted({c for r in cat.values() for s in r.get("steps", [])
                       for c in s.get("needs", [])}):
        label, reecrit, delta = rc.resolve_capability(cap, foyer, rules)
        outils[cap] = {"label": label, "reecrit": reecrit, "deltaMin": delta}

    plats = []
    for rid, r in cat.items():
        # La contenance du récipient le plus contraignant, précalculée : elle ne
        # dépend que du catalogue et du foyer, tous deux statiques ici. Le JS
        # n'a pas à refaire la résolution capacité -> outil pour l'afficher.
        vaisselle, fmax = ch.facteur_max_vaisselle(r, foyer)
        plats.append({
            "id": rid,
            "titre": r["title"],
            "minutes": r.get("time_min_total", 0),
            # Ce que le plat coûte À L'HEURE DU REPAS, et de combien il faut
            # s'y prendre à l'avance. Deux grandeurs, deux décisions : la
            # première dit si on a le temps ce soir, la seconde si c'est encore
            # possible du tout.
            "minutesSurPlace": an.minutes_sur_place(r),
            "avanceMin": an.duree_totale(r),
            "anticipations": [
                {"gestes": [e.get("id") for e in s.etapes],
                 "minutes": s.gestes_min, "attente": s.attente_min,
                 "avantMin": s.debut_avant_min, "raison": s.raison}
                for s in an.anticipations(r)
            ],
            "portions": r.get("yields", {}).get("portions_eq", 4),
            "apports": r.get("apports", {}),
            "ingredients": [
                # `ref` est la clé de LIGNE (défaut : l'id), celle que `uses:`
                # vise. L'`id` reste la clé d'ACHAT, commune aux deux lignes
                # d'huile d'olive d'une même recette — deux clés parce que ce
                # sont deux questions.
                {"id": i["id"], "ref": i.get("ref") or i["id"],
                 "nom": i["name"], "qty": i["qty"],
                 "unit": i["unit"], "base": bool(i.get("from_accepts")),
                 "assaisonnement": bool(i.get("seasoning"))}
                for i in r.get("ingredients", [])
            ],
            # Les étapes, pour que l'écran puisse montrer la recette et pas
            # seulement la carte. `needs` reste en CAPACITÉS : c'est l'outil du
            # foyer qui s'y branche, jamais l'inverse.
            "steps": [
                {"id": s.get("id"), "action": s.get("action"),
                 "minutes": s.get("time_min"), "needs": s.get("needs", []),
                 "surveille": s.get("attended", True),
                 # Ce que CETTE étape réclame, en références de ligne. Sans ce
                 # lien un écran de cuisson guidée ne peut pas montrer les
                 # quantités au moment où elles servent : il renvoie à la liste
                 # complète à chaque geste, ce qui est précisément ce qu'un
                 # déroulé pas-à-pas existe pour éviter. `null` (et non `[]`)
                 # quand la recette n'a pas encore le lien — l'écran doit
                 # pouvoir distinguer « rien à verser ici » de « on ne sait pas ».
                 "uses": s.get("uses"),
                 # L'étape qu'on mène EN MÊME TEMPS qu'une autre. La pâte se
                 # pétrit pendant que la poêlée refroidit : deux gestes, une
                 # seule tranche de temps, et le déroulé doit les présenter
                 # ensemble au lieu de les mettre à la queue leu leu.
                 "enParallele": s.get("parallel_with"),
                 # L'attente : la seconde horloge. Sans elle l'écran ne peut
                 # pas dire à quelle heure s'y mettre, ni ce qui se lance la
                 # veille — cf. `anticipation.py`.
                 "attente": s.get("attente_min"),
                 "attenteRaison": s.get("attente_raison"),
                 "attenteSouple": s.get("attente_souple", True),
                 "rattrapage": s.get("rattrapage"),
                 "enfant": (s.get("kid") or {}).get("task"),
                 "enfantDes": (s.get("kid") or {}).get("age_min_months"),
                 "porteAssaisonnement": bool(s.get("seasoning_gate"))}
                for s in r.get("steps", [])
            ],
            "bebe": (r.get("baby_portion") or {}).get("take"),
            "bebePrep": (r.get("baby_portion") or {}).get("prep"),
            # APRÈS QUELLE ÉTAPE prélever, et c'est rarement la porte de sel.
            # `depuis:` nomme les étapes d'où sort la portion ; la dernière est
            # le plus tard où il reste du nature à prendre. Faute de ce champ
            # l'écran n'avait que « avant d'assaisonner », ce qui sur la tourte
            # place le prélèvement APRÈS les 100 g de parmesan — salant, et
            # qu'aucun champ ne déclare assaisonnement. Voir `compile.py`.
            "bebeApres": _bebe_apres(r),
            "actifMin": r.get("active_min"),
            # `accepts` matches either one exact output (`type`) or a whole
            # class of them (`kind`) — the latter is what lets a single
            # « reste de la veille » eat any leftover dish. `qty` dit COMBIEN
            # l'arête réclame : sans elle le chaînage n'est qu'un jeton, et le
            # même bocal couvre autant de plats qu'on veut.
            "accepts": [
                {"type": a.get("type"), "kind": a.get("kind"),
                 "requis": bool(a.get("required")),
                 "qty": _qty(a),
                 # L'autre bout de l'axe du temps : « pas plus de N heures
                 # après », pour une base qui ne se garde pas (la mousse encore
                 # tiède qu'on coule dans le gâteau).
                 "delaiMaxH": an.delai_max_h(a),
                 "mere": a.get("fallback_recipe")}
                for a in r.get("accepts", [])
            ],
            "creneaux": r.get("creneaux") or ["dejeuner", "diner"],
            # UNE BRIQUE QU'ON POSE À CÔTÉ, JAMAIS UN PLAT QU'ON PIOCHE. Sans ce
            # drapeau, faire entrer « riz nature » au corpus reviendrait à
            # proposer un bol de riz nature en dîner — la faute que T26 vient de
            # corriger, refaite par l'autre bout. Voir `_accompagnements.yaml`.
            "accompagnement": bool(r.get("accompagnement")),
            "transportable": r.get("transportable", True),
            "sansReste": (
                {"minutes": r["sans_reste"].get("temps_min", 0),
                 "ingredients": [
                     {"id": i["id"], "nom": i["name"], "qty": i["qty"],
                      "unit": i["unit"]}
                     for i in r["sans_reste"].get("ingredients", [])]}
                if r.get("sans_reste") else None
            ),
            "emits": [
                {"type": e["type"], "kind": e.get("kind"),
                 "qty": _qty(e), "band": e.get("qty_band"),
                 "espace": ch.espace_de(e), "note": e.get("note"),
                 "gardeFrigo": (e.get("keeps") or {}).get("frigo_days"),
                 "congelo": bool(e.get("keeps", {}).get("congelo"))}
                for e in r.get("emits", [])
            ],
            # Un lot qui ne se coupe pas en deux : « faire 0,42 poulet rôti »
            # n'est pas une quantité. `calibre` dit jusqu'où le même lot unique
            # peut être pris plus gros avant qu'il faille en faire deux.
            "lotEntier": bool(r.get("lot_entier")),
            "calibreMax": (r.get("lot_calibre") or {}).get("facteur_max"),
            "vaisselle": ({"id": vaisselle["id"],
                           "label": vaisselle.get("label") or vaisselle["id"],
                           "facteurMax": round(fmax, 3)}
                          if vaisselle else None),
            "gainChainage": ch.gain_du_chainage(r),
            "cuisinable": catalogue.est_cuisinable(r),
        })

    # Preservation methods, with what the household can actually do today.
    caps = {c for eq in foyer["equipment"] for c in eq.get("capabilities", [])}
    methodes = []
    for m in conserv["methodes"]:
        need = m.get("needs")
        noeud = m.get("noeud_competence") or {}
        methodes.append({
            "id": m["id"], "label": m["label"],
            "acquis": need is None or need in caps,
            "manque": noeud.get("kit_manquant") or need,
            "noeud": noeud.get("titre"),
            "acideSeulement": m.get("exige_acidite") == "haute",
        })

    # La cuisine est FINIE. Deux plafonds par espace, tous deux réels : les
    # étagères et les boîtes. Le plus bas commande, et savoir lequel change le
    # geste — dégager une étagère, ou laver des boîtes.
    places = ch.capacites_stockage(foyer, equilibre)
    boites = ch.contenants_par_espace(foyer, capacites)
    espaces = {}
    for e in ch.ESPACES:
        cap = places.get(e)
        if not cap:
            continue
        pool = boites.get(e) or 0
        espaces[e] = {
            "places": cap,
            "contenants": pool or None,
            "limite": pool if pool and pool < cap else cap,
            "cause": "contenant" if pool and pool < cap else "place",
        }

    json.dump({
        "foyer": {
            "nom": foyer["name"],
            "parts": sum(e["portion_eq"] for e in foyer["eaters"]
                         if e.get("diet") != "baby"),
            "fenetreFrigo": foyer["fridge_window_days"],
            "tiroirs": foyer["freezer_drawers"],
            # De quoi les parts sont faites. Le bébé compte pour 0 dans le
            # total : sa portion est PRÉLEVÉE sur le plat avant salage, elle ne
            # s'ajoute pas au dimensionnement.
            "mangeurs": [
                {"id": e["id"], "genre": e["kind"], "parts": e["portion_eq"],
                 "bebe": e.get("diet") == "baby"}
                for e in foyer["eaters"]
            ],
            "espaces": espaces,
            "outils": outils,
            "contenants": [
                {"id": c["id"], "label": c.get("label") or c["id"],
                 "nombre": c.get("nombre", 0), "portions": c.get("portions", 0),
                 # Un bocal ne devient une place de placard que si la
                 # stérilisation est acquise ; sinon il reste une boîte de
                 # frigo, ce qui est exactement la vérité physique.
                 "espaces": [esp for esp in c.get("espaces", [])
                             if _ouvert(c, esp, capacites)],
                 "consommable": c.get("reutilisable") is False}
                for c in foyer.get("contenants", [])
            ],
            "vaisselle": [
                {"id": eq["id"], "label": eq.get("label") or eq["id"],
                 "contenance": eq["contenance"],
                 "exemplaires": eq.get("exemplaires", 1)}
                for eq in foyer.get("equipment", []) if eq.get("contenance")
            ],
        },
        "plats": plats,
        "creneaux": creneaux,
        "rayons": rayons,
        "equilibre": equilibre,
        "conservation": methodes,
        "stock": stock.get("outputs", []),
        # LE GARDE-MANGER, ET SES DEUX GRANDEURS DÉRIVÉES ICI.
        # `volumeL` et `poidsG` se calculent des dimensions et des quantités —
        # jamais saisis, donc jamais divergents. L'app les affiche sans refaire
        # l'arithmétique, comme elle le fait déjà de `facteurMax`.
        "gardeManger": {
            "zones": [
                {"id": z["id"], "label": z.get("label") or z["id"],
                 "espace": z["espace"],
                 "niveaux": z.get("niveaux", 1),
                 "dimensions": z.get("dimensions") or {},
                 "forme": z.get("forme", "rectangle"),
                 "volumeL": gm.volume_litres(z),
                 "exposition": z["exposition"],
                 "hygrometrie": z["hygrometrie"],
                 "chaleur": bool(z.get("chaleur")),
                 "note": z.get("note")}
                for z in pantry["zones"]
            ],
            "denrees": [
                {"ingredient": d["ingredient"], "zone": d["zone"],
                 "unites": d.get("unites", 1),
                 "parUnite": d.get("par_unite"),
                 "poidsG": gm.poids_g(d),
                 "etat": d["etat"],
                 "sensible": d.get("sensible") or [],
                 "incompatibles": d.get("incompatibles") or [],
                 # L'urgence dépend de la denrée ET de sa zone : le même sachet
                 # de pignons est « basse » dans un placard fermé et « haute »
                 # sur l'étagère au soleil. Elle se calcule donc ici, où les deux
                 # sont sous la main, et pas dans le YAML où seule la denrée est.
                 "urgence": gm.urgence(d, _zones[d["zone"]]),
                 "nature": d.get("nature", "autre"),
                 # CE QU'ON PEUT EN FAIRE POUR ARRÊTER SON HORLOGE — la seconde
                 # réponse au gaspillage, celle que `conservation.yaml` porte
                 # depuis le prototype. Les méthodes verrouillées sont incluses :
                 # un nœud de compétence qu'on ne possède pas n'est pas une
                 # erreur à taire, c'est ce qu'il faudrait acquérir.
                 "conservations": gm.conservations(d, conserv["methodes"], capacites),
                 "note": d.get("note")}
                for d in pantry["denrees"]
            ],
            # SEULEMENT LES ERREURS DE RANGEMENT. Le vérificateur en signale
            # d'autres — un tiroir non coté, par exemple — mais celles-là parlent
            # du fichier, et l'app n'a rien à en faire : elle s'adresse à qui
            # habite la cuisine, pas à qui tient le corpus.
            #
            # Calculées ici, jamais recopiées du YAML : une alerte figée dans les
            # données mentirait le jour où on déplace le sachet sans l'effacer.
            "alertes": gm.alertes_rangement(pantry),
        },
        # Une seule table de libellés pour les deux modèles : le Python et sa
        # transcription JS ne peuvent pas diverger sur ce que « à cuisiner
        # d'avance » veut dire.
        # LA SAISONNALITÉ, PAR INGRÉDIENT. Le modèle TS n'a pas à relire le
        # calendrier : il reçoit la fenêtre de récolte, et la règle qui va avec
        # est écrite dans `saisons.py` — on pénalise le hors-saison AVÉRÉ, on ne
        # récompense jamais l'en-saison, parce que la source couvre 27
        # ingrédients sur 57 et qu'un bonus refléterait ses trous.
        "saisons": {
            "source": sais["source"],
            "recoltes": {k: v["mois"] for k, v in sorted(sais["recoltes"].items())},
            # CE QUI SURVIT À SA RÉCOLTE n'est jamais pénalisé : l'oignon se
            # récolte l'été et se mange en février. Sa fenêtre reste juste et
            # l'écran peut la dire — c'est le SCORE qui se tait.
            "seGarde": sorted(k for k, v in sais["recoltes"].items() if v.get("se_garde")),
            # Nommés plutôt que subis : ce sont les ingrédients que le modèle ne
            # pénalisera jamais, et l'écran doit pouvoir le dire.
            "sansSource": sorted({c for ids in sais["sans_source"].values() for c in ids}),
        },
        "provenances": ch.ETIQUETTES,
        "horsCourses": list(ch.HORS_COURSES),
    }, sys.stdout, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
