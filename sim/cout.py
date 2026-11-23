"""Ce que coûtent le fond et les dîners, au prix d'un relevé de magasin.

usage : python3 sim/cout.py <references.json> [--parts 2.75] [--json]

LE RELEVÉ N'EST PAS DANS LE DÉPÔT : les prix du foyer vivent hors de git. On
lui passe son chemin. Chaque article y dit un conditionnement (« filet 1,5 kg »,
« 4 × 125 g », « pièce ») et un prix ; on en tire un prix par gramme, par
millilitre ou par pièce, et on chiffre :
  — le fond (`fond.yaml`) : ce que coûte le placard tenu à ses minimums ;
  — chaque dîner du catalogue, pour les parts du foyer, au prorata de ce que
    la recette prend (une pincée de sel ne coûte rien : `rayons.placard`) ;
  — ce qui reste sans prix, pour savoir ce que le chiffre ignore.
"""
import argparse
import json
import os
import re
import statistics

ICI = os.path.dirname(os.path.abspath(__file__))
cat = json.load(open("public/cuisine-data.json"))  # le catalogue du dépôt où l'on se tient
ALIAS = cat["rayons"].get("aliases", {})
a = lambda i: ALIAS.get(i, i)
TOUJOURS = {a(i) for i in cat["rayons"]["placard"]}
HERBES = {"basilic", "persil", "ciboulette", "menthe", "coriandre", "sarriette", "estragon-frais", "thym-frais", "aneth", "cerfeuil", "herbes-fraiches"}
MASSE = {"g": 1, "kg": 1000, "ml": 1, "cl": 10, "l": 1000}
PIECE = {"poireau": 200, "oignon": 120, "oignon-rouge": 120, "carottes": 100, "pommes": 150, "poires": 150,
         "banane": 120, "pomme-de-terre": 150, "potimarron": 1200, "courgettes": 200,
         "tomates": 120, "citron": 100, "oeufs": 55, "echalote": 30, "navets": 120, "panais": 150,
         "brocoli": 400, "chou-fleur": 800, "yaourt-nature": 125, "aubergine": 300, "poivron": 180,
         "basilic": 1, "menthe": 1, "persil": 1, "coriandre": 1, "sauge": 1, "olives-noires": 4, "olives-vertes": 4, "jambon": 40, "jambon-cru": 17, "poulet": 1500, "tomates-cerises": 15, "champignons": 20, "noix": 5, "gousse": 6,
         # poids ajoutés (grammes par pièce, tranche, sachet ou cube, selon l'usage du catalogue)
         "courge": 1000, "concombre": 300, "avocat": 200, "salade-verte": 300, "pomelo": 400,
         "anchois": 4, "cornichons": 8, "radis": 15, "radis-long": 250, "ail": 6, "ail-noir": 40,
         "champignons-paris": 20, "pruneaux": 10, "tomates-cerises-confites": 6, "sardines-boite": 25,
         "sardines": 60, "saumon": 130, "saucisse-fumee": 250, "saucisses": 100, "dinde": 3500,
         "chevre-demi-sec": 60, "petits-suisses": 60, "pate-feuilletee": 230, "pate-brisee": 230,
         "feuilles-brick": 17, "biscottes": 8, "pain-levain": 40, "coppa": 15, "seitan": 30,
         "betterave": 20, "poudre-a-lever": 11, "levure-boulangere": 25, "bouillon-legumes": 10,
         "bouillon-volaille": 10, "sucre-vanille": 7.5, "gousse-vanille": 3, "banane": 120,
         "celeri-branche": 40, "cebette": 20, "tomates-roma": 80, "fenouil": 250, "chou-frise": 800,
         "chou-chinois": 800, "chou-romanesco": 600, "ail-des-ours": 2, "oseille": 2, "orties": 2,
         "navet-primeur": 80, "navets-roses": 80, "topinambours": 60, "patate-douce": 300,
         "patidou": 500, "gingembre": 30, "piment-frais": 10, "tortillas": 40, "pains-burger": 60,
         "galettes-sarrasin": 50, "galettes-riz": 10, "crevettes": 15, "poisson-entier": 400,
         "canette": 1800, "caissettes": 0, "huile-essentielle-orange": 0.03, "safran": 0.1}
CUILLERE = {"c. à s.": 15, "c. à c.": 5, "grosse c. à s.": 20, "pincée": 0.5, "brin": 2, "gousse": 6,
            "petit bouquet": 20, "bouquet": 40, "poignée": 30, "tête": 60, "botte": 250, "pot": 125,
            "grosse poignée": 50, "tasse": 150, "côte": 40}
# poids nets d'un conditionnement que le relevé ne chiffre pas (« paquet »)
PAQUET = {"biscottes": 300}


def en_grammes(id_, qty, unit):
    """Une quantité de recette en grammes (ou ml), à l'ordre de grandeur."""
    u = (unit or "").strip().lower()
    if u in MASSE:
        return qty * MASSE[u]
    if u in CUILLERE:
        return qty * CUILLERE[u]
    return qty * PIECE.get(id_, 100)  # pièce, unité, tranche…


def prix_au_gramme(art, id_):
    c = (art.get("conditionnement") or "").replace(",", ".")
    m = re.search(r"(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b", c, re.I)
    if m:
        g = float(m[1]) * float(m[2]) * MASSE[m[3].lower()]
    elif (m := re.search(r"(\d+(?:\.\d+)?)\s*(kg|g|l|cl|ml)\b", c, re.I)):
        g = float(m[1]) * MASSE[m[2].lower()]
    elif c.strip().lower() == "kg":
        g = 1000
    elif "botte" in c.lower():
        g = 30 if id_ in HERBES else 500
    elif (m := re.search(r"(\d+)\s*(cubes|sachets|pièces|feuilles|tranches)\b", c, re.I)) \
            or (m := re.search(r"\bde\s+(\d+)\b", c, re.I)) or (m := re.search(r"[×x]\s*(\d+)\s*$", c)):
        g = int(m[1]) * PIECE.get(id_, 100)  # « boîte de 10 », « 18 cubes », « × 2 » : un compte de pièces
    elif id_ in PAQUET:
        g = PAQUET[id_]
    else:
        g = PIECE.get(id_, 100)
    return art["prix"] / g if g else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prix")
    ap.add_argument("--parts", type=float, default=cat["foyer"].get("parts", 2.5))
    ap.add_argument("--json", action="store_true")
    o = ap.parse_args()
    refs = json.load(open(o.prix))["articles"]
    pg = {a(k): prix_au_gramme(v, a(k)) for k, v in refs.items() if v.get("prix")}

    # ── le fond, à ses minimums
    fond, sans = 0.0, []
    for d in cat["fond"]["denrees"]:
        id_ = a(d["ingredient"])
        if id_ not in pg or pg[id_] is None:
            sans.append(id_)
            continue
        u = d.get("unite") or "pièce"
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)\b", u)
        n = re.search(r"de (\d+)\b", u)
        g = float(m[1].replace(",", ".")) * MASSE[m[2].lower()] if m else (int(n[1]) * PIECE.get(id_, 100) if n else PIECE.get(id_, 100))
        fond += d["minimum"] * g * pg[id_]

    # ── les dîners, pour les parts du foyer
    diners = [p for p in cat["plats"] if p.get("role", "plat") == "plat" and "diner" in (p.get("creneaux") or [])]
    couts, manquants = [], {}
    for p in diners:
        f = o.parts / (p.get("portions") or 4)
        tot, inconnu = 0.0, 0
        for i in p["ingredients"]:
            id_ = a(i["id"])
            if i.get("base") or i.get("facultatif") or id_ in TOUJOURS or not (i.get("qty") or 0):
                continue
            if pg.get(id_) is None:
                inconnu += 1
                manquants[id_] = manquants.get(id_, 0) + 1
                continue
            tot += en_grammes(id_, i["qty"], i.get("unit")) * f * pg[id_]
        couts.append((round(tot, 2), inconnu, p["titre"]))
    complets = sorted(c for c in couts if c[1] == 0)
    vals = [c[0] for c in complets]
    out = {
        "fondAuMinimum": round(fond, 0), "fondSansPrix": sans,
        "diners": len(diners), "dinersChiffresComplets": len(complets),
        "parRepas": {"mediane": round(statistics.median(vals), 2) if vals else None,
                     "q1": round(statistics.quantiles(vals, n=4)[0], 2) if len(vals) > 3 else None,
                     "q3": round(statistics.quantiles(vals, n=4)[2], 2) if len(vals) > 3 else None},
        "moinsChers": complets[:8], "plusChers": complets[-8:],
        "sansPrixLesPlusDemandes": sorted(manquants.items(), key=lambda x: -x[1])[:12],
    }
    if o.json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return
    print(f"Fond tenu à ses minimums : ~{out['fondAuMinimum']:.0f} €  (sans prix : {', '.join(sans) or '—'})")
    print(f"{len(diners)} dîners, {len(complets)} entièrement chiffrés, pour {o.parts} parts :")
    print(f"  médiane {out['parRepas']['mediane']} € · quartiles {out['parRepas']['q1']} – {out['parRepas']['q3']} €")
    print("  les moins chers :", " · ".join(f"{t} {c:.2f} €" for c, _, t in complets[:6]))
    print("  les plus chers  :", " · ".join(f"{t} {c:.2f} €" for c, _, t in complets[-6:]))
    print("  sans prix, les plus demandés :", ", ".join(f"{k} ({n})" for k, n in out["sansPrixLesPlusDemandes"]))


if __name__ == "__main__":
    main()
