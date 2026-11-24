"""Le fond mesuré MOIS PAR MOIS : ce que chaque ajout ouvre de dîners sur l'année,
et ce qu'il coûte.

usage : python3 sim/fond_annee.py [<references.json>] [--n 25] [--frais 2] [--exclure celeri,...]

`fond.py` compte les dîners d'un fond sans regarder le calendrier. Ici, un dîner
est « ouvert » un mois donné quand le sec est au stock et qu'il manque au plus
K denrées fraîches, TOUTES DE SAISON ce mois-là (`saisons.yaml`) — un dîner à
la courgette n'existe pas en février. Le score d'un fond est la somme, sur les
douze mois, des dîners ouverts (zéro achat compte double) ; le mois le plus
pauvre est dit à part, parce que c'est lui qu'on vit comme « toujours la même
chose ».

Le glouton part du fond actuel (`fond.yaml`, hebdo compris : le frais de la
semaine est acheté de toute façon) et ajoute la denrée de stock qui ouvre le
plus, à coût égal la moins chère (prix du relevé, une unité d'achat). Ce qui
contient un mot exclu (« celeri ») n'est jamais proposé, et une ligne qui ne
s'ouvre que par lui ne compte pas.
"""
import argparse
import collections
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fond import BESOINS, FOND, a, de_stock, nom, plats  # noqa: E402

cat = json.load(open("public/cuisine-data.json"))
SAISONS = {a(k): set(v) for k, v in ((cat.get("saisons") or {}).get("mois") or {}).items()}
SAISON_PLAT = {}
for p in plats:
    SAISON_PLAT[p["titre"].strip()] = p


def de_saison(i, m):
    return i not in SAISONS or m in SAISONS[i]


def ouverts(stock, k, m, exclus):
    zero = frais = 0
    sert = collections.Counter()
    for t, b in BESOINS.items():
        manque, ok, s = 0, True, set()
        for alts, stockables, base in b:
            alts = {x for x in alts if not any(e in x for e in exclus)}
            tenu = (stockables & stock) - {x for x in stockables if any(e in x for e in exclus)}
            if tenu:
                s |= tenu
                continue
            frais_ok = [x for x in alts if not de_stock(x) and de_saison(x, m)]
            if base or not frais_ok:
                ok = False
                break
            manque += 1
        if ok and manque <= k:
            frais += 1
            zero += manque == 0
            for x in s:
                sert[x] += 1
    return zero, frais, sert


def score(stock, k, exclus):
    par_mois = [ouverts(stock, k, m, exclus)[:2] for m in range(1, 13)]
    return sum(2 * z + f for z, f in par_mois), par_mois


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prix", nargs="?")
    ap.add_argument("--n", type=int, default=25)
    ap.add_argument("--frais", type=int, default=2)
    ap.add_argument("--exclure", default="celeri")
    o = ap.parse_args()
    exclus = [e for e in o.exclure.split(",") if e]
    prix = {}
    if o.prix:
        from cout import prix_au_gramme  # noqa: E402
        for k, v in json.load(open(o.prix))["articles"].items():
            if v.get("prix"):
                prix[a(k)] = v["prix"]

    stock = set(FOND)
    s0, pm0 = score(stock, o.frais, exclus)
    print(f"{len(BESOINS)} dîners. Fond actuel ({len(stock)} denrées) :")
    print("  par mois (≤%d frais de saison) : " % o.frais + " ".join(f"{f:3}" for _, f in pm0)
          + f"   · mois le plus pauvre {min(f for _, f in pm0)}")
    print("  zéro achat par mois          : " + " ".join(f"{z:3}" for z, _ in pm0))
    cands = sorted({x for b in BESOINS.values() for _, st, _ in b for x in st} - stock)
    cands = [x for x in cands if not any(e in x for e in exclus)]
    print(f"\n{'':4}{'ajout':<30}{'€':>6}  gain  {'min/mois':>8}  {'moy/mois':>8}  sert")
    total = 0.0
    for n in range(o.n):
        base = score(stock, o.frais, exclus)[0]
        gains = []
        for x in cands:
            if x in stock:
                continue
            g = score(stock | {x}, o.frais, exclus)[0] - base
            if g > 0:
                gains.append((g, -prix.get(x, 5), x))
        if not gains:
            break
        g, _, x = max(gains)
        stock.add(x)
        s, pm = score(stock, o.frais, exclus)
        u = sum(ouverts(stock, o.frais, m, exclus)[2][x] for m in range(1, 13)) / 12
        total += prix.get(x, 0)
        print(f"{n + 1:3} +{nom(x):<30}{prix.get(x, float('nan')):6.2f}  {g:4}  {min(f for _, f in pm):8}  "
              f"{sum(f for _, f in pm) / 12:8.1f}  {u:4.1f}")
    print(f"\nsomme des prix unitaires ajoutés : {total:.0f} €")


if __name__ == "__main__":
    main()
