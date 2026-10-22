"""Les années simulées, côte à côte.

usage : python3 sim/compare.py <dossier> [run run2 run3 ...]

<dossier> contient un sous-dossier par passage (jours.jsonl + etat.json) :
  run  — année 1, la persona qui planifie, sur l'ancien main ;
  run2 — la persona « moi » sur la pile des six correctifs (le fil, une passe) ;
  run3 — la persona « moi » sur `cuisine/a-la-pause` (cockpit + « Ce soir »).

Tout ce qui se lit dans le catalogue (légumineuses, format, saison, fond seul)
se lit dans CELUI DE CE DÉPÔT, pour les trois passages : on compare ce que la
famille a mangé, mesuré à la même aune.
"""
import collections
import json
import os
import re
import sys
from datetime import date

S = sys.argv[1]
RUNS = sys.argv[2:] or ["run", "run2", "run3"]
ICI = os.path.dirname(os.path.abspath(__file__))
cat = json.load(open(os.path.join(ICI, "..", "public", "cuisine-data.json")))
plats = {p["titre"].strip(): p for p in cat["plats"]}
ALIAS = cat["rayons"].get("aliases", {})
SAISONS = (cat.get("saisons") or {}).get("mois", {})
FOND = {d["ingredient"] for d in (cat.get("fond") or {}).get("denrees", [])} | set(cat["rayons"]["placard"])
PANNES = {"2027-01-08": "Congé", "2027-10-04": "Frigo"}
JOURS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"]
NON_PLAT = ("repli", "pâtes", "dehors", "rien")


def a(i):
    return ALIAS.get(i, i)


def leg(p):
    x = (p or {}).get("apports") or {}
    return x.get("proteine") == "legumineuse" or x.get("feculent") == "legumineuse"


def saison(p, mois):
    """Comme `saisonDuPlat` : seuls comptent les ingrédients à vraie saison (< 12 mois)."""
    ids = {a(i["id"]) for i in (p or {}).get("ingredients", []) if not i.get("base")}
    ids |= {a(i["id"]) for i in (p or {}).get("avec", [])}
    de = hors = 0
    for i in ids:
        m = SAISONS.get(i)
        if not m or len(set(m)) >= 12:
            continue
        if mois in m:
            de += 1
        else:
            hors += 1
    return "hors" if hors else "de-saison" if de else "neutre"


def fond_seul(p):
    """Un dîner qui se fait avec le fond (fond.yaml) et le placard, sans rien d'autre."""
    return bool(p) and all(i.get("base") or a(i["id"]) in FOND or i["id"] in FOND for i in p.get("ingredients", []))


def age(x):
    return (date.fromisoformat(x["jete"]) - date.fromisoformat(x["le"])).days


def un_run(d):
    J = [json.loads(l) for l in open(f"{S}/{d}/jours.jsonl")]
    E = json.load(open(f"{S}/{d}/etat.json"))
    r = collections.OrderedDict()
    maison = [j for j in J if not j.get("absent") and j.get("diner")]
    diners = [j for j in maison if not j["diner"].startswith(NON_PLAT)]
    titres = [j["diner"] for j in diners]
    P = [plats.get(t) for t in titres]
    r["jours journalisés"] = len(J)
    r["dîners à la maison"] = len(maison)
    r["dîners cuisinés via l'app"] = len(diners)
    r["replis pâtes/gnocchis"] = sum(j["diner"].startswith(("repli", "pâtes")) for j in maison)
    r["  dont malade (hors app)"] = sum(j["diner"].startswith("pâtes") for j in maison)
    r["dîners aux légumineuses"] = sum(leg(p) for p in P)
    r["dîners du fond seul"] = sum(fond_seul(p) for p in P)
    r["plats distincts (dîner)"] = len(set(titres))
    fmt = collections.Counter((p or {}).get("format") or "?" for p in P)
    r["quiche / soupe / gratin"] = f"{fmt['quiche']} / {fmt['soupe']} / {fmt['gratin']}"
    sai = collections.Counter(saison(p, int(j["j"][5:7])) for p, j in zip(P, diners))
    avec = sai["de-saison"] + sai["hors"]
    r["de saison / à légume saisonnier"] = f"{sai['de-saison']}/{avec}" + (f" ({100 * sai['de-saison'] // avec} %)" if avec else "")
    # Les restes, recomptés sur le registre du monde réel. Une panne ne tue que
    # ce qui était encore là — le premier passage tuait aussi les restes mangés.
    restes = E["restes"]
    panne = [x for x in restes if x.get("jete") in PANNES and x["ou"].startswith(PANNES[x["jete"]])
             and x.get("portions", 0) > 0 and not x.get("mangeLe") and age(x) <= x.get("garde", 0)]
    ids_panne = {id(x) for x in panne}
    perimes = [x for x in restes if x.get("jete") and id(x) not in ids_panne and x.get("portions", 0) > 0 and age(x) > x.get("garde", 0)]
    r["restes jetés (périmés)"] = len(perimes)
    r["restes perdus dans une panne"] = len(panne)
    congel = [x for x in restes if x["ou"].startswith("Congé")]
    mange = [x for x in congel if x.get("mangeLe") or (x.get("portions", 0) <= 0)]
    perdu = [x for x in congel if x.get("jete") and x not in mange]
    r["congélo : faits/mangés/perdus/là"] = f"{len(congel)}/{len(mange)}/{len(perdu)}/{len(congel) - len(mange) - len(perdu)}"
    inv = [j for j in J if j.get("inventaire")]
    if inv:
        def app(j):
            return len([l for l in j["inventaire"]["app"] if "mangé par la semaine" not in l])
        f = inv[-1]
        r["dérive app vs réel (fin)"] = f"{app(f)} vs {len(f['inventaire']['reel'])}"
        r["dérive app−réel (moy. dim.)"] = round(sum(app(j) - len(j["inventaire"]["reel"]) for j in inv) / len(inv), 1)
    r["minutes d'app"] = round(sum(j.get("secondes", 0) for j in J) / 60)
    r["taps"] = sum(j.get("taps", 0) for j in J)
    r["questions"] = sum(j.get("questions", 0) for j in J)
    # Les lignes achetées. `articles` est écrasé par chaque passage en caisse :
    # on recompose matin + 15 h + hors app selon ce que chaque passage journalise.
    art = 0
    for j in J:
        if "carte" in j or "courses15h" in j or "achatsHorsApp" in j or "refus" in j:
            art += j.get("coursesDuMatin", 0) + j.get("courses15h", 0) + len(j.get("achatsHorsApp", []))
        elif j.get("persona"):
            art += j.get("coursesDuMatin", 0) + (j.get("articles", 0) if j.get("passePoses") else 0)
        else:
            art += j.get("articles", 0) + j.get("petitesCourses", 0)
    r["articles achetés (lignes)"] = art
    r["  dont hors app"] = sum(len(j.get("achatsHorsApp", [])) for j in J)
    r["« il manque N boîtes »"] = sum(len(j.get("manques", [])) for j in J)
    pos = collections.Counter(f"{j['carte']['par']} #{j['carte']['pos']}" for j in J if j.get("carte"))
    r["carte prise"] = ", ".join(f"{k}: {v}" for k, v in sorted(pos.items(), key=lambda x: -x[1])) or "—"
    jours = collections.Counter(j["dow"] for j in diners)
    r["cuisiné par jour (lun→dim)"] = " ".join(f"{jours[k]}" for k in [1, 2, 3, 4, 5, 6, 0])
    # T142 — les trois autres repas.
    if any("midiSource" in j for j in J):
        src = collections.Counter(j.get("midiSource") for j in J if j.get("midiSource"))
        r["midi : reste prévu / reste / Chioca / sandwich"] = f"{src['reste-prevu']} / {src['reste']} / {src['chioca']} / {src['sandwich']}"
        r["midi non pris faute de boîtes"] = sum(1 for j in J if j.get("midiPrevu") == "boîtes pleines")
        r["petits-déj / goûters avec un manque"] = f"{sum(1 for j in J if j.get('manquePetitDej'))} / {sum(1 for j in J if j.get('manqueGouter'))}"
        r["goûters de la fournée"] = sum(1 for j in J if j.get("gouter") and j["gouter"] != "fruit et yaourt")
        r["fournées faites / proposées"] = f"{sum(1 for j in J if j.get('fournee'))} / {sum(1 for j in J if j.get('fourneeProposee'))}"
        r["articles industriels achetés"] = len(E.get("industriels", []))
    r["_top"] = collections.Counter(titres).most_common(10)
    refus = collections.Counter()
    for j in J:
        for x in j.get("refus") or []:
            for m in x["pourquoi"]:
                refus[re.sub(r"^\d+ articles", "N articles", m)] += 1
        for m in re.findall(r"(\d+ articles à acheter un jour sans courses|pas prêt pour 18 h|mangé ces trois derniers jours|pas un repas|demande le four)", j.get("repliRaisons") or ""):
            refus[re.sub(r"^\d+ articles", "N articles", m)] += 1
    r["_refus"] = refus
    return r


R = {d: un_run(d) for d in RUNS if os.path.exists(f"{S}/{d}/jours.jsonl")}
cles = [k for k in next(iter(R.values())) if not k.startswith("_")]
w = max(len(k) for k in cles)
print("| " + " | ".join(["mesure"] + list(R)) + " |")
print("|" + "---|" * (len(R) + 1))
for k in cles:
    print("| " + " | ".join([k.strip()] + [str(R[d].get(k, "—")) for d in R]) + " |")
for d, r in R.items():
    print(f"\n== {d} — les dîners les plus fréquents")
    for t, n in r["_top"]:
        p = plats.get(t)
        print(f"  {n:3}  {t}{'  [légumineuses]' if leg(p) else ''}{'  [fond seul]' if fond_seul(p) else ''}{'  [' + p['format'] + ']' if p and p.get('format') else ''}")
    if r["_refus"]:
        print(f"   refus : {dict(r['_refus'].most_common(6))}")
