"""Le fond de roulement, mesuré au catalogue : combien de dîners il rend possibles,
et ce qu'il risque de laisser se perdre.

usage : python3 sim/fond.py [--max N] [--frais K] [--json]

Le modèle, volontairement simple — c'est la simulation qui tranche ensuite :

- une denrée est « de stock » si elle tient au moins 21 jours (familles de
  `garde`, sinon son rayon) ; sinon elle est « fraîche » et s'achète le jour
  de courses, pour un dîner dans les jours qui suivent ;
- un dîner (`role: plat`) demande ses ingrédients ni facultatifs, ni
  assaisonnements, ni « toujours là » (`rayons.placard`) ; un ingrédient est
  tenu si lui OU un de ses remplaçants est au stock ;
- un ingrédient « base » (un reste chaîné : bouillon, poulet cuit…) n'est
  jamais au stock — sauf remplaçant : le dîner qui l'exige dépend d'un autre ;
- « zéro achat » : tout est au stock ; « ≤ K frais » : le sec est au stock et il
  manque au plus K denrées fraîches.

Le glouton ajoute, une à une, la denrée de stock qui ouvre le plus de dîners
(zéro achat compte double). Une denrée du stock qui ne sert qu'à un ou deux
dîners ouverts est un risque de perte : elle est signalée.
"""
import argparse
import collections
import json
import os
import re

ICI = os.path.dirname(os.path.abspath(__file__))
cat = json.load(open("public/cuisine-data.json"))  # le catalogue du dépôt où l'on se tient
ALIAS = cat["rayons"].get("aliases", {})
a = lambda i: ALIAS.get(i, i)
TOUJOURS = {a(i) for i in cat["rayons"]["placard"]}
RAYON = {a(i): r for r, ids in (cat["rayons"].get("rayons") or {}).items() for i in ids}
GARDE = {a(i): g["fenetreJours"] for g in cat.get("garde", []) for i in g["ids"]}
FOND = {a(d["ingredient"]): d for d in cat["fond"]["denrees"]}
NOMS = cat["rayons"].get("noms", {})
SAISONS = {a(k): v for k, v in ((cat.get("saisons") or {}).get("mois") or {}).items()}


def tenue(i):
    if i in GARDE:
        return GARDE[i]
    r = RAYON.get(i, "")
    if i in SAISONS and len(set(SAISONS[i])) < 12:
        return 7  # un produit de saison : frais, par définition
    if re.search(r"primeur", r, re.I):
        return 7
    if re.search(r"surgel", r, re.I):
        return 240
    if re.search(r"boucher|poisson|traiteur", r, re.I):
        return 2
    if re.search(r"fruit|legume|légume|herbe", r, re.I):
        return 7
    if re.search(r"frais|cr.merie|laitier|fromage", r, re.I):
        return 14
    return 180  # épicerie, conserves, placard


def de_stock(i):
    return tenue(i) >= 21


plats = [p for p in cat["plats"] if p.get("role", "plat") == "plat" and "diner" in (p.get("creneaux") or [])]
BESOINS = {}  # titre -> liste de (alternatives, frais?, base?)
for p in plats:
    b = []
    for i in p["ingredients"]:
        if i.get("facultatif") or i.get("assaisonnement") or not (i.get("qty") or 0):
            continue
        alts = {a(i["id"])} | {a(r["id"]) for r in i.get("remplacants") or []}
        if alts & TOUJOURS:
            continue
        base = bool(i.get("base"))
        stockables = {x for x in alts if de_stock(x) and not (base and x == a(i["id"]))}
        b.append((frozenset(alts), frozenset(stockables), base))
    BESOINS[p["titre"].strip()] = b


def mesure(stock, k_frais):
    """(zéro achat, ≤ k frais, usages de chaque denrée du stock)."""
    zero = frais_k = 0
    usage = collections.Counter()
    ouverts = []
    for t, b in BESOINS.items():
        manque_frais = 0
        ok = True
        sert = set()
        for alts, stockables, base in b:
            tenu = stockables & stock
            if tenu:
                sert |= tenu
                continue
            if base or not any(not de_stock(x) for x in alts):
                ok = False  # un sec absent, ou un reste chaîné : pas ce soir
                break
            manque_frais += 1
        if not ok or manque_frais > k_frais:
            continue
        frais_k += 1
        if manque_frais == 0:
            zero += 1
        ouverts.append(t)
        for x in sert:
            usage[x] += 1
    return zero, frais_k, usage, ouverts


def nom(i):
    return NOMS.get(i, i.replace("-", " "))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=45)
    ap.add_argument("--frais", type=int, default=2)
    ap.add_argument("--json", action="store_true")
    o = ap.parse_args()

    candidats = sorted({x for b in BESOINS.values() for _, st, _ in b for x in st})
    actuel = {x for x, d in FOND.items() if not d.get("hebdo")}
    z, f, u, _ = mesure(actuel, o.frais)
    out = {"plats": len(BESOINS), "candidats": len(candidats)}
    out["actuel"] = {
        "n": len(actuel), "zeroAchat": z, f"auPlus{o.frais}Frais": f,
        "peuServies": sorted([(nom(x), u[x]) for x in actuel if u[x] <= 2], key=lambda t: t[1]),
    }

    stock, courbe = set(), []
    score = lambda s: (lambda m: 2 * m[0] + m[1])(mesure(s, o.frais))
    while len(stock) < o.max:
        base = score(stock)
        best = max(candidats, key=lambda x: (score(stock | {x}) - base, -tenue(x) if x not in stock else -1e9)) if candidats else None
        if best is None or best in stock or score(stock | {best}) <= base:
            break
        stock.add(best)
        z, f, _, _ = mesure(stock, o.frais)
        courbe.append({"n": len(stock), "ajout": nom(best), "dansFond": best in actuel, "zeroAchat": z, f"auPlus{o.frais}Frais": f})
    z, f, u, _ = mesure(stock, o.frais)
    out["glouton"] = courbe
    out["proposeHorsFond"] = [nom(x) for x in stock if x not in actuel]
    out["fondHorsPropose"] = [nom(x) for x in actuel if x not in stock]
    out["peuServiesPropose"] = sorted([(nom(x), u[x]) for x in stock if u[x] <= 2], key=lambda t: t[1])

    if o.json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return
    A = out["actuel"]
    print(f"{out['plats']} dîners au catalogue, {out['candidats']} denrées de stock candidates\n")
    print(f"FOND ACTUEL ({A['n']} denrées hors hebdo) : {A['zeroAchat']} dîners sans rien acheter, "
          f"{A[f'auPlus{o.frais}Frais']} avec ≤ {o.frais} frais")
    print("  peu servies (≤ 2 dîners ouverts) :", ", ".join(f"{n} ({k})" for n, k in A["peuServies"]) or "—")
    print("\nGLOUTON (ce que chaque ajout ouvre) :")
    for c in courbe:
        print(f"  {c['n']:3}  +{c['ajout']:<28}{'' if c['dansFond'] else ' [hors fond]':<12} "
              f"zéro achat {c['zeroAchat']:4}   ≤{o.frais} frais {c[f'auPlus{o.frais}Frais']:4}")
    print("\nau glouton mais pas au fond :", ", ".join(out["proposeHorsFond"]) or "—")
    print("au fond mais pas au glouton :", ", ".join(out["fondHorsPropose"]) or "—")


if __name__ == "__main__":
    main()
