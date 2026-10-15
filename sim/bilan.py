"""Le bilan d'une année simulée : lit jours.jsonl, notes.jsonl, etat.json et
imprime les agrégats (JSON) dont la revue a besoin.

usage : python3 sim/bilan.py <dossier de sortie>
"""
import json, sys, re, collections
from datetime import date

out = sys.argv[1]
jours = [json.loads(l) for l in open(f"{out}/jours.jsonl")]
notes = [json.loads(l) for l in open(f"{out}/notes.jsonl")] if __import__("os").path.exists(f"{out}/notes.jsonl") else []
etat = json.load(open(f"{out}/etat.json"))
cat = json.load(open("public/cuisine-data.json"))
plats = {p["titre"].strip(): p for p in cat["plats"]}

mois = collections.OrderedDict()
def m(j): return j["j"][:7]
for j in jours:
    k = m(j)
    a = mois.setdefault(k, collections.Counter())
    a["jours"] += 1
    a["absent"] += 1 if j.get("absent") else 0
    a["taps"] += j.get("taps", 0)
    a["secondes"] += j.get("secondes", 0)
    a["cuits"] += len(j.get("cuits", []))
    a["passes"] += 1 if j.get("planifie") else 0
    a["questions"] += j.get("questions", 0)
    a["cartes"] += j.get("cartesVues", 0)
    a["desserts"] += j.get("dessertsProposes", 0)
    a["entames"] += j.get("entameProposes", 0)
    a["repioches"] += j.get("repioches", 0)
    a["compromis"] += len(j.get("compromis", []))
    a["articles"] += j.get("articles", 0)
    a["restesPoses"] += j.get("restesPoses", 0)
    a["gamelles"] += 1 if j.get("gamelle") else 0
    a["gamellesPartielles"] += 1 if j.get("gamellePartielle") else 0
    a["perimes"] += j.get("restesPerimes", 0)
    a["erreurs"] += len(j.get("erreurs", []))
    a["dinersHorsApp"] += 1 if j.get("diner") in ("pâtes, hors app", "dehors", "rien") else 0
    a["autrement"] += sum(1 for c in j.get("cuits", []) if c["reponse"] == "autrement")

# La dérive : lots de l'app contre restes réels, chaque dimanche.
derive = []
for j in jours:
    inv = j.get("inventaire")
    if not inv: continue
    app = inv["app"]
    vivants = [l for l in app if "mangé par la semaine" not in l]
    derive.append({
        "j": j["j"],
        "app": len(vivants),
        "appFrigo": sum(1 for l in vivants if "| Frigo" in l),
        "appCongelo": sum(1 for l in vivants if "| Congélo" in l),
        "reel": len(inv["reel"]),
        "reelFrigo": sum(1 for l in inv["reel"] if "| Frigo" in l),
        "reelCongelo": sum(1 for l in inv["reel"] if "| Congélo" in l),
        "plafonds": j.get("stockEcran", {}).get("plafonds", ""),
        "planchers": j.get("stockEcran", {}).get("planchers", ""),
        "horloge": sum(1 for l in vivants if re.search(r"congel[ée] depuis|forfait|qualit", l)),
    })

# Ce qui a été cuisiné : répétitions, saisons, durée.
cuits = [(j["j"], c["titre"]) for j in jours for c in j.get("cuits", [])]
freq = collections.Counter(t for _, t in cuits)
SAISONS = {"hiver": [12, 1, 2], "printemps": [3, 4, 5], "été": [6, 7, 8], "ete": [6, 7, 8], "automne": [9, 10, 11]}
hors_saison = []
for d, t in cuits:
    p = plats.get(t)
    s = ((p or {}).get("source") or {}).get("saison")
    if not s: continue
    mo = int(d[5:7])
    ok = any(mo in SAISONS.get(w.strip().lower(), []) for w in re.split(r"[,/ ]+", str(s)) if w)
    if not ok and any(w.strip().lower() in SAISONS for w in re.split(r"[,/ ]+", str(s))):
        hors_saison.append((d, t, s))

poses = [p for j in jours for p in j.get("poses", [])]
notes_par = collections.Counter(n["type"] for n in notes)
exemples = collections.defaultdict(list)
for n in notes:
    if len(exemples[n["type"]]) < 4: exemples[n["type"]].append(f'{n["j"]} — {n["texte"]}')

erreurs = collections.Counter(e for j in jours for e in j.get("erreurs", []))
cockpit = collections.Counter(re.sub(r"\d+", "N", j.get("cockpit", ""))[:120] for j in jours if not j.get("absent"))
facette = [(j["j"], j.get("cuisineFacette", "")) for j in jours][::30]

json.dump({
    "jours": len(jours),
    "compte": etat["compte"],
    "mois": mois,
    "derive": derive,
    "cuits": len(cuits),
    "distincts": len(freq),
    "top": freq.most_common(15),
    "horsSaison": {"n": len(hors_saison), "avecSaison": sum(1 for d, t in cuits if ((plats.get(t) or {}).get("source") or {}).get("saison")), "exemples": hors_saison[:12]},
    "notes": notes_par,
    "exemples": exemples,
    "erreurs": erreurs.most_common(10),
    "cockpit": cockpit.most_common(12),
    "facette": facette,
    "compromis": [c for j in jours for c in j.get("compromis", [])][:8],
    "gaspilleKg": round(etat["compte"]["gaspilleG"] / 1000, 1),
}, sys.stdout, ensure_ascii=False, indent=1, default=list)
