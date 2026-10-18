import json, collections, sys, re
S=sys.argv[1]  # dossier contenant run/ (année 1) et run2/ (persona)
def load(d): return [json.loads(l) for l in open(f"{S}/{d}/jours.jsonl")]
cat=json.load(open("/home/ubuntu/intendance-wt/integration/public/cuisine-data.json"))
plats={p["titre"].strip():p for p in cat["plats"]}
def leg(t):
    p=plats.get(t) or {}; a=p.get("apports") or {}
    return a.get("proteine")=="legumineuse" or a.get("feculent")=="legumineuse"
for d in ("run","run2"):
    J=load(d); E=json.load(open(f"{S}/{d}/etat.json"))["compte"]
    diners=collections.Counter()
    for j in J:
        x=j.get("diner") or "-"
        if x.startswith("repli") or x.startswith("pâtes"): k="pasta fallback"
        elif x in ("dehors","rien"): k=x
        elif x.startswith("reste") or "reste" in x: k="leftover"
        else: k="other:"+x[:0]
        diners[k]+=1
    cuits=[c["titre"] for j in J for c in j.get("cuits",[])]
    freq=collections.Counter(cuits)
    taps=sum(j.get("taps",0) for j in J); sec=sum(j.get("secondes",0) for j in J)
    q=sum(j.get("questions",0) for j in J); art=sum(j.get("articles",0) for j in J)
    manques=sum(len(j.get("manques",[])) for j in J)
    jete=sum(len(j.get("jetesApp",[])) for j in J)
    raisons=collections.Counter()
    for j in J:
        for r in (j.get("repliRaisons") or "").split(" ; "):
            for m in re.findall(r"(articles à acheter un jour sans courses|pas prêt pour 18 h|mangé il y a moins de 3 jours)", r): raisons[m]+=1
    der=[(j["j"],len([l for l in j["inventaire"]["app"] if "mangé par la semaine" not in l]),len(j["inventaire"]["reel"])) for j in J if j.get("inventaire")]
    print("=====",d,len(J),"days")
    print("compte",E)
    print("diners",diners.most_common())
    print("cooked",len(cuits),"distinct",len(freq),"legume dishes",sum(leg(t) for t in cuits), "top",freq.most_common(8))
    print("taps",taps,"min",round(sec/60),"questions",q,"articles bought",art,"box shortages lines",manques,"jetés-app",jete)
    print("repli reasons",raisons.most_common())
    print("drift sample",der[::8])
    print("diner sample",collections.Counter(j.get("diner","-")[:40] for j in J).most_common(12))
