#!/usr/bin/env python3
"""Export the catalogue and household to JSON for the visual prototype.

The visual proto lives in another repo (chapellu/flagship, apps/proto-shell) and
must not invent dishes. This dumps the real YAML so the cards on screen are the
cards the Python model deals.

  python3 export_json.py > /tmp/cuisine-data.json
"""

import json
import sys
from pathlib import Path

import yaml

import catalogue
import chainage as ch

HERE = Path(__file__).parent


def _qty(bloc):
    """`{'amount': 700, 'unit': 'g'}` ou `None` — la forme que le JS relira."""
    amount, unit = ch.quantite(bloc)
    return {"amount": amount, "unit": unit} if amount is not None else None


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

    # Tout ce que le foyer sait faire — l'union des capacités de ses outils et
    # des chaînes de dégradation. C'est ce qui décide si un bocal est une place
    # de placard ou seulement une boîte de frigo.
    capacites = set(rules.get("capabilities", {}))
    for eq in foyer.get("equipment", []):
        capacites |= set(eq.get("capabilities", []))

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
            "portions": r.get("yields", {}).get("portions_eq", 4),
            "apports": r.get("apports", {}),
            "ingredients": [
                {"id": i["id"], "nom": i["name"], "qty": i["qty"],
                 "unit": i["unit"], "base": bool(i.get("from_accepts"))}
                for i in r.get("ingredients", [])
            ],
            # `accepts` matches either one exact output (`type`) or a whole
            # class of them (`kind`) — the latter is what lets a single
            # « reste de la veille » eat any leftover dish. `qty` dit COMBIEN
            # l'arête réclame : sans elle le chaînage n'est qu'un jeton, et le
            # même bocal couvre autant de plats qu'on veut.
            "accepts": [
                {"type": a.get("type"), "kind": a.get("kind"),
                 "requis": bool(a.get("required")),
                 "qty": _qty(a),
                 "mere": a.get("fallback_recipe")}
                for a in r.get("accepts", [])
            ],
            "creneaux": r.get("creneaux") or ["dejeuner", "diner"],
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
                 "espace": ch.espace_de(e),
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
            "espaces": espaces,
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
        # Une seule table de libellés pour les deux modèles : le Python et sa
        # transcription JS ne peuvent pas diverger sur ce que « à cuisiner
        # d'avance » veut dire.
        "provenances": ch.ETIQUETTES,
        "horsCourses": list(ch.HORS_COURSES),
    }, sys.stdout, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
