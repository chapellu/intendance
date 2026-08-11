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

HERE = Path(__file__).parent


def main():
    cat = catalogue.charger_recettes(HERE / "recipes")
    foyer = yaml.safe_load((HERE / "household.yaml").read_text())["household"]
    rayons = yaml.safe_load((HERE / "rayons.yaml").read_text())
    equilibre = yaml.safe_load((HERE / "equilibre.yaml").read_text())
    conserv = yaml.safe_load((HERE / "conservation.yaml").read_text())
    stock = yaml.safe_load((HERE / "stock.yaml").read_text())

    plats = []
    for rid, r in cat.items():
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
            "accepts": [
                {"type": a["type"], "requis": bool(a.get("required")),
                 "mere": a.get("fallback_recipe")}
                for a in r.get("accepts", [])
            ],
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
                 "congelo": bool(e.get("keeps", {}).get("congelo"))}
                for e in r.get("emits", [])
            ],
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

    json.dump({
        "foyer": {
            "nom": foyer["name"],
            "parts": sum(e["portion_eq"] for e in foyer["eaters"]
                         if e.get("diet") != "baby"),
            "fenetreFrigo": foyer["fridge_window_days"],
            "tiroirs": foyer["freezer_drawers"],
        },
        "plats": plats,
        "rayons": rayons,
        "equilibre": equilibre,
        "conservation": methodes,
        "stock": stock.get("outputs", []),
    }, sys.stdout, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    main()
