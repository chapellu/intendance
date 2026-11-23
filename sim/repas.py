"""Les cinq repas d'une ou plusieurs années simulées, côte à côte.

usage : python3 sim/repas.py <OUT> [<OUT> ...]

Lit `jours.jsonl` et `etat.json` de chaque passage (`annee.mjs`, PERSONA=moi)
et dit, par repas, ce qui a été servi comme prévu — les jours à la maison.

  petit-déj  complet = la routine des enfants ET le pain maison ;
             « sans pain maison » = porridge des adultes ; manque = la routine
             n'a pas pu se faire (yaourt, banane, flocons…) ;
  midi       reste, cuisiné (l'app l'a proposé) ou omelette hors app ;
             « rien de chaud » = ni reste ni œufs ;
  goûter     fournée = une part de la fournée + yaourt et fruit ;
  dîner      plat de l'app, repli (pâtes) ou RIEN ;
  dessert    servi, ou manque (yaourt, fruit) — un soir sur deux environ.
"""
import collections
import json
import os
import sys


def lire(out):
    jours = [json.loads(l) for l in open(os.path.join(out, "jours.jsonl"))]
    etat = json.load(open(os.path.join(out, "etat.json")))
    return jours, etat


def classe(repas, v):
    v = v or ""
    if repas == "pdj":
        return "manque" if v.startswith("manque") else ("complet" if v == "complet" else "sans pain")
    if repas == "midi":
        if v.startswith("cuisiné"):
            return "cuisiné"
        if "rien de chaud" in v:
            return "rien de chaud"
        if v.startswith("reste") and "omelette" not in v:
            return "reste"
        return "omelette"
    if repas == "gouter":
        return "manque" if v.startswith("manque") else ("fournée" if v.startswith("fournée") else "sans fournée")
    if repas == "dessert":
        return "manque" if v.startswith("manque") else ("aucun" if v == "pas de dessert" else "servi")
    if repas == "apero":
        return "manque" if v.startswith("rien") else "servi"
    return v


def resume(out):
    jours, etat = lire(out)
    maison = [j for j in jours if not j.get("absent")]
    r = {"jours": len(jours), "maison": len(maison)}
    for repas in ("pdj", "midi", "gouter", "dessert", "apero"):
        c = collections.Counter(classe(repas, (j.get("repas") or {}).get(repas)) for j in maison if repas in (j.get("repas") or {}))
        r[repas] = dict(c)
    din = collections.Counter()
    for j in maison:
        d = str(j.get("diner") or "")
        din["RIEN" if "RIEN" in d else "repli" if d.startswith(("repli", "malade")) else "dehors" if d == "dehors" else "plat"] += 1
    r["diner"] = dict(din)
    manques = collections.Counter()
    for j in maison:
        for m in j.get("manquesRepas") or []:
            manques[m] += 1
    r["manques"] = manques.most_common(8)
    c = etat["compte"]
    r["gaspilleKg"] = round(c.get("gaspilleG", 0) / 1000, 1)
    r["jetesParId"] = sorted((c.get("jetesParId") or {}).items(), key=lambda x: -x[1])[:6]
    r["restesJetes"] = c.get("jetes", 0)
    r["fournees"] = c.get("fournees", 0)
    r["midisCuisines"] = c.get("midisCuisines", 0)
    r["depense"] = c.get("depense")
    r["fondInitial"] = c.get("fondInitial")
    r["depenseParId"] = sorted((c.get("depenseParId") or {}).items(), key=lambda x: -x[1])[:8]
    r["aperos"] = (c.get("aperos", 0), c.get("aperosCuisines", 0))
    r["dejaNotes"] = c.get("dejaNotes", 0)
    r["tapsParJour"] = round(sum(j.get("taps", 0) for j in jours) / max(1, len(jours)), 1)
    r["distincts"] = len({j["diner"] for j in maison if isinstance(j.get("diner"), str) and not j["diner"].startswith(("repli", "malade", "dehors", "rien"))})
    return r


def taux(d, bons):
    n = sum(d.values())
    return f"{100 * sum(d.get(b, 0) for b in bons) / n:5.1f} %" if n else "   —  "


def main():
    outs = sys.argv[1:]
    rs = {os.path.basename(os.path.dirname(o.rstrip("/"))) or o: resume(o) for o in outs}
    noms = list(rs)
    w = max(12, *(len(n) for n in noms))
    ligne = lambda titre, f: print(f"{titre:<34}" + "".join(f"{f(rs[n]):>{w + 2}}" for n in noms))
    print(f"{'':<34}" + "".join(f"{n:>{w + 2}}" for n in noms))
    ligne("jours (à la maison)", lambda r: f"{r['jours']} ({r['maison']})")
    ligne("petit-déj complet", lambda r: taux(r["pdj"], ["complet"]))
    ligne("petit-déj routine faite", lambda r: taux(r["pdj"], ["complet", "sans pain"]))
    ligne("midi chaud (reste, cuisiné, omelette)", lambda r: taux(r["midi"], ["reste", "cuisiné", "omelette"]))
    ligne("midi sur un reste ou cuisiné", lambda r: taux(r["midi"], ["reste", "cuisiné"]))
    ligne("goûter avec la fournée", lambda r: taux(r["gouter"], ["fournée"]))
    ligne("goûter routine faite", lambda r: taux(r["gouter"], ["fournée", "sans fournée"]))
    ligne("dîner : un plat", lambda r: taux(r["diner"], ["plat", "dehors"]))
    ligne("dîner : repli pâtes", lambda r: str(r["diner"].get("repli", 0)))
    ligne("dîner : RIEN", lambda r: str(r["diner"].get("RIEN", 0)))
    ligne("dessert servi (quand voulu)", lambda r: taux({k: v for k, v in r["dessert"].items() if k != "aucun"}, ["servi"]))
    ligne("apéro servi (quand voulu)", lambda r: taux(r["apero"], ["servi"]))
    ligne("dîners distincts", lambda r: str(r["distincts"]))
    ligne("fournées / midis cuisinés", lambda r: f"{r['fournees']} / {r['midisCuisines']}")
    ligne("gaspillage (kg) / restes jetés", lambda r: f"{r['gaspilleKg']} / {r['restesJetes']}")
    ligne("taps par jour", lambda r: str(r["tapsParJour"]))
    ligne("apéros (dont cuisinés)", lambda r: f"{r['aperos'][0]} ({r['aperos'][1]})")
    ligne("« Déjà noté » à la sortie", lambda r: str(r["dejaNotes"]))
    ligne("fond de départ (€)", lambda r: "—" if r["fondInitial"] is None else f"{r['fondInitial']:.0f}")
    ligne("dépense (€) / par semaine", lambda r: "—" if r["depense"] is None else f"{r['depense']:.0f} / {7 * r['depense'] / max(1, r['jours']):.0f}")
    for n in noms:
        print(f"\n{n} — manques : " + ", ".join(f"{k} ×{v}" for k, v in rs[n]["manques"]))
        if rs[n]["depenseParId"]:
            print(f"{n} — dépense : " + ", ".join(f"{k} {v:.0f} €" for k, v in rs[n]["depenseParId"]))
        print(f"{n} — jeté : " + ", ".join(f"{k} {v} g" for k, v in rs[n]["jetesParId"]))


if __name__ == "__main__":
    main()
