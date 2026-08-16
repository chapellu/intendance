#!/usr/bin/env python3
"""Week builder — throwaway TUI over semaine_model.py (ticket #31).

Drive the week by hand, one dish at a time, and watch what each choice does to
the shopping list. The logic lives in `semaine_model.py`; everything here is
disposable terminal plumbing.

  python3 semaine_tui.py
  python3 semaine_tui.py --today 2026-08-11 --jours 7
  python3 semaine_tui.py --agenda --maintenant 2026-08-10T18:00 \
      --placer 3:panzanella-toscana 5:roti-bouillon-herbes
"""

import argparse
import datetime as dt
import sys
from pathlib import Path

import yaml

import agenda as AG
import anticipation as A
import catalogue
import semaine_model as M

HERE = Path(__file__).parent
JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

B, D, R = "\x1b[1m", "\x1b[2m", "\x1b[0m"
V, J, C = "\x1b[32m", "\x1b[33m", "\x1b[36m"


def charger(today, n_jours, maintenant=None):
    cat = catalogue.charger_recettes(HERE / "recipes")
    foyer = yaml.safe_load((HERE / "household.yaml").read_text())["household"]
    stock = yaml.safe_load((HERE / "stock.yaml").read_text())
    rayons = yaml.safe_load((HERE / "rayons.yaml").read_text())
    equilibre = yaml.safe_load((HERE / "equilibre.yaml").read_text())
    conserv = yaml.safe_load((HERE / "conservation.yaml").read_text())
    histo = yaml.safe_load((HERE / "historique.yaml").read_text())
    cren = yaml.safe_load((HERE / "creneaux.yaml").read_text())
    rules = yaml.safe_load((HERE / "rules.yaml").read_text())
    jours = tuple(JOURS[(today.weekday() + i) % 7] for i in range(n_jours))

    # L'expansion de la semaine en créneaux est partie dans le modèle : elle
    # portait un invariant (l'ordre chronologique) que deux mécaniques du
    # modèle supposaient et que cette fonction cassait discrètement.
    creneaux = M.construire_creneaux(cren, jours)

    ctx = M.Contexte(catalogue=cat, foyer=foyer, stock=stock, rayons=rayons,
                     equilibre=equilibre, conservation=conserv,
                     today=today, jours=jours, creneaux=creneaux,
                     repas=cren["repas"], rules=rules, maintenant=maintenant,
                     equilibre_sur=tuple(cren.get("equilibre_sur",
                                                  ("dejeuner", "diner"))))
    return ctx, histo


SUITS = {"souche": "♠ SOUCHE", "derive": "♥ SUR UN RESTE", "express": "♦ EXPRESS",
         "congelable": "♣ SE CONGÈLE", "complet": "● PLAT"}


W = 78          # total card width
INNER = W - 4   # room between "│ " and " │"


def _coupe(txt, n):
    return txt if len(txt) <= n else txt[:n - 1] + "…"


def carte(ctx, l, k):
    """One dish, drawn as a card. Category is the suit."""
    suit = SUITS.get(l.get("categorie", "complet"), "● PLAT")
    a = l.get("apports", {})

    entete = f"┌─ {k} {suit} "
    out = [f"┌─ {B}{k}{R} {C}{suit}{R} " + "─" * (W - len(entete) - 1) + "┐"]

    titre = _coupe(l["titre"], INNER - 22)
    cout = f"{l['minutes']:>3} min   +{l['marginal']} art."
    pad = INNER - len(titre) - len(cout)
    out.append(f"│ {B}{titre}{R}{' ' * pad}{D}{cout}{R} │")

    detail = []
    if a.get("proteine") and a["proteine"] != "aucune":
        detail.append(a["proteine"])
    if a.get("profil"):
        detail.append(a["profil"])
    if l["chaine"]:
        src = ctx.catalogue[l["depuis"]]["title"] if l["depuis"] else "le frigo"
        detail.append(f"↪ base déjà cuite ({_coupe(src, 24)})")
    if l.get("congelo"):
        detail.append("❄ portion du congélo")
    if l.get("plein"):
        detail.append("plein tarif : sans le reste")
    # L'anticipation s'annonce sur la carte, pas au moment de cuisiner : c'est
    # la seule façon qu'elle serve à quelque chose.
    if l.get("retard"):
        e = l["retard"][0]
        detail.append(f"⏳ {e['raison']} : c'était {e['dit'].replace('au plus tard ', '')}")
    elif l.get("avant"):
        e = l["avant"][0]
        detail.append(f"⏳ {e['raison']} à lancer {e['dit'].replace('au plus tard ', '')}")
    if l["manque"]:
        detail.append(f"⚠ demande {l['manque']['type']}")
    if l["emits"]:
        detail.append("→ laisse " + _coupe(", ".join(l["emits"]), 30))
    ligne = _coupe(" · ".join(detail), INNER)
    out.append(f"│ {D}{ligne}{' ' * (INNER - len(ligne))}{R} │")

    if l.get("pourquoi"):
        pq = _coupe(" · ".join(l["pourquoi"]), INNER)
        out.append(f"│ {V}{pq}{' ' * (INNER - len(pq))}{R} │")

    # What can be done with what this dish leaves behind.
    if l["emits"]:
        opts = M.conservations(ctx, ctx.catalogue[l["id"]])
        libres = [f"{o['label']} {o['duree']}" for o in opts if o["dispo"]]
        verrous = [o for o in opts if not o["dispo"] and o["manque"]]
        txt = "conserver : " + " · ".join(libres)
        if verrous:
            txt += f"   🔒 {len(verrous)} à débloquer"
        txt = _coupe(txt, INNER)
        out.append(f"│ {C}{txt}{' ' * (INNER - len(txt))}{R} │")

    out.append("└" + "─" * (W - 2) + "┘")
    return out


def carte_malediction(ctx, m):
    """The curse: not a dish, a deadline. Two ways out, both of them a choice."""
    tete = "┌─ ✖ MALÉDICTION "
    out = [f"┌─ {J}✖ MALÉDICTION{R} " + "─" * (W - len(tete) - 1) + "┐"]

    titre = _coupe(f"{m['type']} ({m['band']})", INNER - 24)
    if m["perdu"]:
        clock = f"périmé depuis {-m['reste']} j"
    elif m["reste"] == 0:
        clock = "dernier jour"
    else:
        clock = f"encore {m['reste']} j"
    pad = INNER - len(titre) - len(clock)
    out.append(f"│ {B}{titre}{R}{' ' * pad}{J}{clock}{R} │")

    if m["candidats"]:
        noms = ", ".join(c["titre"] for c in m["candidats"][:3])
        ligne = _coupe(f"le sauve : {noms}", INNER)
    else:
        ligne = _coupe("plus aucun plat ne peut le rattraper à temps", INNER)
    out.append(f"│ {D}{ligne}{' ' * (INNER - len(ligne))}{R} │")

    act = "[!] le cuisiner    [d] le jeter" if m["candidats"] else "[d] le jeter"
    out.append(f"│ {C}{act}{R}{' ' * (INNER - len(act))} │")
    out.append("└" + "─" * (W - 2) + "┘")
    return out


def _geste(e, coul, marque, largeur=58):
    suite = ""
    if marque == "✗":
        rattr = e.get("rattrapage")
        suite = (f" — rattrapage : {rattr['action'][:60]} (+{rattr['cout_min']} min)"
                 if rattr else " — sans rattrapage : c'est un autre plat ce soir")
    return (f"{coul}{marque}{R} {e['geste'][:largeur]} "
            f"{D}({e['minutes']} min, {e['raison']}) → {e['pour']}{R}"
            + (f"{coul}{suite}{R}" if suite else ""))


def bloc_agenda(ctx, etat, n_a_venir=4):
    """L'agenda par VISITE plutôt que par geste.

    La liste à plat se lisait comme une liste de courses de gestes : trois
    lignes qui disent trois fois « lundi dîner » sans jamais dire ce que lundi
    soir coûte en tout. Or c'est un seul passage dans la cuisine, et la seule
    question qu'on se pose devant est « j'y suis à quelle heure ».
    """
    vs, orph = M.visites(ctx, etat)
    cur = AG.curseur(vs, ctx.instant)
    porteuses = [v for v in vs if v.echeances]
    if not porteuses and not orph:
        return []

    # Ce qu'un rendez-vous manqué coûte AU REPAS qu'il servait. Le rattrapage
    # est un choix, donc il ne rentre pas dans `charge_min` — mais annoncer 22
    # min pour un soir dont la seule issue en coûte 82 refait exactement le
    # mensonge qu'on vient de corriger d'un cran plus bas.
    rattrapage = {}
    for l in M.agenda(ctx, etat):
        if l["retard"] and l.get("rattrapage"):
            rattrapage[l["creneau"]] = (rattrapage.get(l["creneau"], 0)
                                        + int(l["rattrapage"].get("cout_min", 0)))

    out = [f"{B}AGENDA{R} {D}— la cuisine visite par visite · maintenant : "
           f"{ctx.instant.strftime('%d/%m %Hh%M')}{R}"]

    for e in cur["ratees"]:
        out.append(f"       {_geste(e, J, '✗')}")

    def ligne_visite(v, tete, coul):
        heure = v.debut.strftime("%Hh%M")
        emprunt = (f" {D}(dont {v.emprunte} pour plus tard){R}" if v.emprunte else "")
        rat = rattrapage.get(v.presence.cle, 0)
        if rat:
            emprunt += f" {J}+ {rat} min de rattrapage{R}"
        out.append(f"  {coul}{tete}{R} {B}{v.presence.label}{R} {D}—{R} "
                   f"{coul}y être à {heure}{R} {D}·{R} {v.charge_min} min{emprunt}")
        for e in v.echeances:
            out.append(f"        {_geste(e, C, '⏳')}")

    if cur["courante"] is not None:
        ligne_visite(cur["courante"], "▶", J)
    # La toute prochaine visite s'affiche même si elle ne porte rien d'autre
    # que son propre repas : « on est ici » fait partie de l'agenda, et une
    # soirée sans rien à anticiper est une information, pas un vide.
    a_venir = [v for i, v in enumerate(cur["prochaines"])
               if v.echeances or (i == 0 and cur["courante"] is None)][:n_a_venir]
    for v in a_venir:
        ligne_visite(v, "·", C)

    for e in orph:
        # Ne pas savoir quand le dire est une réponse ; se taire n'en est pas une.
        out.append(f"       {J}? {e['geste'][:58]}{R} {D}({e['minutes']} min) → "
                   f"{e['pour']} — aucun passage dans la cuisine avant {e['dit']}{R}")
    return out


def _court(phrase, n=46):
    if len(phrase) <= n:
        return phrase
    coupe = phrase[:n].rsplit(" ", 1)[0]
    return coupe + "…"


def annonce(ctx, etat):
    """La seule phrase qu'une notification aurait le droit d'afficher.

    C'est le bout qui manquait — l'agenda était calculé et jamais *délivré*.
    Le délivrer n'ajoute pas de mécanique : il suffisait d'avoir un objet dont
    l'annonce soit la description. Une visite en est un ; un geste n'en était
    pas un, parce que trois gestes au même endroit font trois notifications
    pour un seul déplacement, et qu'on coupe les notifications qui font ça.

    Ce qui est encore un mensonge de prototype : personne ne la déclenche. Un
    vrai rappel se pose à `visite.debut`, et c'est le shell qui le pose, pas la
    cuisine — d'autres facettes ont des visites au même moment.
    """
    vs, _ = M.visites(ctx, etat)
    cur = AG.curseur(vs, ctx.instant)
    v = cur["prochaine"]
    if v is None:
        return "Rien à préparer d'ici la fin de la semaine."
    quoi = [f"{ctx.catalogue[etat.choix[v.presence.cle]]['title'].lower()}"] \
        if etat.choix[v.presence.cle] else []
    # Coupé court, et la coupure est un constat : `action` est de la prose de
    # recette (« détailler l'oignon en petits cubes, émincer les carottes, le
    # céleri et le poireau »), pas un intitulé. Une notification a besoin d'un
    # libellé court par étape, que le format de recette ne porte pas encore.
    quoi += [_court(e["geste"][0].lower() + e["geste"][1:]) for e in v.echeances]
    tete = ("Tu y es" if v is cur["courante"]
            else f"{v.presence.label}, à {v.debut.strftime('%Hh%M')}")
    return f"{tete} — {v.charge_min} min : " + " ; ".join(quoi) + "."


def frame(ctx, etat, histo, vue="main", message=""):
    out = ["\x1b[2J\x1b[H"]
    d0, d1 = ctx.today, ctx.today + dt.timedelta(days=len(ctx.jours) - 1)
    out.append(f"{B}CONSTRUCTION DE LA SEMAINE{R}  "
               f"{D}{d0.strftime('%d/%m')} → {d1.strftime('%d/%m/%Y')} · "
               f"{ctx.foyer['name']} · {M._portions_foyer(ctx.foyer):g} parts{R}")
    out.append("")

    calc = M.calculer(ctx, etat.choix)
    arts = M.articles(calc["panier"])
    ancree = M.charge_ancree(ctx, etat)

    # ---- the week, now days containing slots rather than days containing a dish
    jour_courant = None
    for i, cr in enumerate(ctx.creneaux):
        if cr.jour != jour_courant:
            jour_courant = cr.jour
            date = (ctx.today + dt.timedelta(days=cr.jour)).strftime("%d/%m")
            out.append(f"  {B}{ctx.jours[cr.jour]}{R} {D}{date}{R}")
        sel = f"{C}▸{R}" if i == etat.jour else " "
        lab = ctx.repas.get(cr.repas, {}).get("label", cr.repas)
        if cr.emporte:
            lab += " 🥡"
        routine = ctx.nature(i) == "routine"
        rid = etat.choix[i]

        if rid:
            r = ctx.catalogue[rid]
            marks = []
            if any(c["creneau"] == i for c in calc["chaine"]):
                src = next(c["depuis"] for c in calc["chaine"] if c["creneau"] == i)
                marks.append(f"{V}↪ part du reste"
                             f"{' de ' + ctx.catalogue[src]['title'] if src else ' du frigo'}{R}")
            if any(p["creneau"] == i for p in calc["problemes"]):
                marks.append(f"{J}⚠ reste manquant{R}")
            if r.get("emits"):
                marks.append(f"{D}→ {', '.join(e['type'] for e in r['emits'])}{R}")
            bud = etat.budgets[i]
            # Les minutes DU CRÉNEAU : celles du plat, plus celles que d'autres
            # repas lui ont accrochées. Le budget d'un soir n'a pas à payer un
            # trempage lancé la veille — mais le soir OÙ ON LE LANCE, si.
            sur_place = A.minutes_sur_place(r)
            due = sur_place + ancree.get(i, 0)
            temps = f"{due} min"
            if ancree.get(i):
                temps += f" {D}(dont {ancree[i]} pour plus tard){R}"
            if A.anticipations(r):
                temps += " ⏳"
            if bud and due > bud:
                temps = f"{J}{due} min > {bud}{R}"
            out.append(f" {sel} {B}{i+1:>2}{R} {D}{lab:<11}{R} "
                       f"{r['title']:<40} {D}⏱{R} {temps}  " + "  ".join(marks))
        else:
            # Un créneau sans plat n'est pas un créneau sans travail : c'est
            # souvent là qu'on sort une portion du congélateur.
            pour_plus_tard = (f"  {C}⏳ {ancree[i]} min pour plus tard{R}"
                              if ancree.get(i) else "")
            if routine:
                corps = f"{D}— routine, pas une carte à jouer —{R}"
            else:
                bud = f"{D}(budget {etat.budgets[i]} min){R}" if etat.budgets[i] else ""
                corps = f"{D}— vide —{R} {bud}"
            out.append(f" {sel} {B}{i+1:>2}{R} {D}{lab:<11}{R} {corps}{pour_plus_tard}")
    out.append("")

    # ---- live totals: the whole point is that these move when you choose
    n_plats = sum(1 for c in etat.choix if c)
    out.append(f"{B}LISTE{R}  {C}{len(arts)} articles{R} à acheter · "
               f"{len(calc['placard'])} à vérifier au placard · "
               f"{D}{n_plats} plats, {M.minutes_semaine(ctx, etat.choix)} min de cuisine{R}")
    if calc["chaine"]:
        for c in calc["chaine"]:
            src = ctx.catalogue[c["depuis"]]["title"] if c["depuis"] else "le frigo"
            out.append(f"       {V}↪ {ctx.label(c['creneau'])} part de « {c['type']} » "
                       f"venu de {src} — zéro achat pour cette base{R}")
    for t in calc.get("trop_tard", []):
        ecart = (f"{t['ecart_h']:.0f} h plus tôt" if t["ecart_h"] is not None
                 else "on ne sait pas quand")
        out.append(f"       {J}⏳ {ctx.label(t['creneau'])} : « {t['titre']} » veut "
                   f"« {t['type'] } » sous {t['delai_max_h']:g} h — il est cuisiné {ecart}. "
                   f"Cette base ne se garde pas, elle s'enchaîne.{R}")
    for p in calc["problemes"]:
        out.append(f"       {J}⚠ {ctx.label(p['creneau'])} : « {p['titre']} » attend le reste "
                   f"« {p['type']} » que rien ne produit avant — placer "
                   f"« {p['fix']} » plus tôt{R}")
    for f in calc["frigo"]:
        etiq = f"{J}périmé (J-{f['age']}, fenêtre {ctx.foyer['fridge_window_days']} j){R}" \
            if f["perime"] else f"{D}J-{f['age']}, encore bon et non utilisé{R}"
        out.append(f"       {D}frigo :{R} {f['type']} — {etiq}")

    # ---- what the week covers, and what it still lacks
    cov = M.couverture(ctx, etat.choix)
    prot = ", ".join(f"{k}×{v}" for k, v in sorted(cov["proteine"].items())) or "—"
    out.append(f"{B}APPORTS{R} protéines : {prot}   {D}·{R}   "
               f"légumes : {len(cov['familles'])} familles "
               f"{D}({', '.join(sorted(cov['familles'])) or '—'}){R}")
    besoins = []
    for p, n in cov["manques"].items():
        besoins.append(f"{p} ×{n}")
    if cov["familles_manquantes"]:
        besoins.append(f"{cov['familles_manquantes']} famille(s) de légumes")
    if besoins:
        out.append(f"        {J}manque encore : {' · '.join(besoins)}{R}")
    elif any(etat.choix):
        out.append(f"        {V}cibles de la semaine atteintes{R}")

    cong = M.bilan_congelo(ctx, etat)
    mouvement = (f"{cong['debut']}"
                 + (f" −{cong['sortie']}" if cong["sortie"] else "")
                 + (f" +{cong['banque']}" if cong["banque"] else "")
                 + f" = {B}{cong['fin']}{R}")
    if cong["sous_plancher"]:
        etiq = (f"{J}sous le plancher de {cong['plancher']} — "
                f"il manque un plat à mettre de côté{R}")
    elif cong["deborde"]:
        etiq = f"{J}déborde les {cong['capacite']} places de tiroir{R}"
    else:
        etiq = f"{V}au-dessus du plancher de {cong['plancher']}{R}"
    out.append(f"{B}CONGÉLO{R} {mouvement} portion(s) d'urgence   {etiq}")

    for p in M.gaspillage(ctx, etat):
        out.append(f"       {J}✗ jeté : {p['type']} ({p['band']}) — "
                   f"la semaine ne peut plus compter dessus{R}")

    out += bloc_agenda(ctx, etat)
    out.append("")

    if vue == "main":
        mal = M.malediction(ctx, etat)
        if mal:
            out += carte_malediction(ctx, mal)
        hand = M.main_du_soir(ctx, etat, histo)
        n_deck = len(M.deck(ctx, etat, histo))
        out.append(f"{B}LA MAIN — {ctx.label(etat.jour).upper()}{R}  "
                   f"{D}{len(hand)} cartes tirées d'un paquet de {n_deck} · "
                   f"repioche {etat.mulligans[etat.jour]}×{R}")
        if not hand:
            out.append(f"  {D}paquet vide — tout est placé ou en repos{R}")
        for k, l in enumerate(hand, 1):
            out += carte(ctx, l, k)
        out.append("")
    elif vue == "conservation":
        out.append(f"{B}CONSERVATION — ce qui est acquis, ce qui reste à débloquer{R}")
        out.append(f"{D}Une méthode absente n'est pas une fonctionnalité manquante :{R}")
        out.append(f"{D}c'est un nœud verrouillé par le kit, au sens de #10.{R}")
        out.append("")
        opts = M.conservations(ctx, {"emits": [{}]})
        for o in opts:
            if o["dispo"]:
                etat_txt = f"{V}✓ acquis{R}"
            elif o["interdit"]:
                etat_txt = f"{J}✗ {o['interdit']}{R}"
            else:
                etat_txt = f"{D}🔒 demande : {o['manque']}{R}"
            out.append(f"  {B}{o['label']:<24}{R} {o['duree']:<10} {etat_txt}")
            if o["noeud"] and not o["dispo"]:
                out.append(f"      {D}nœud : {o['noeud']}{R}")
            if o["securite"]:
                out.append(f"      {J}⚠ {o['securite'][:110]}{R}")
        out.append("")
    elif vue == "courses":
        out.append(f"{B}LISTE DE COURSES{R}")
        for rayon, items in M.par_rayon(ctx, calc["panier"]):
            out.append(f"  {B}{rayon.upper()}{R}")
            for a in items:
                extra = f" {D}({a['plats']} plats){R}" if a["plats"] > 1 else ""
                out.append(f"    ☐ {a['qty']} {a['unit']} — {a['nom']}{extra}")
        if calc["placard"]:
            out.append(f"  {D}placard : {' · '.join(sorted(calc['placard'].values()))}{R}")
        out.append("")
    else:
        # ---- the offer for the selected day
        o = M.offre(ctx, etat)
        out.append(f"{B}POUR {ctx.label(etat.jour).upper()}{R} — "
                   f"{D}classé par {R}{C}{etat.mode}{R}"
                   f"{D} (m pour changer : {' → '.join(M.MODES)}){R}")
        if not o:
            out.append(f"  {D}plus rien au catalogue — tout est déjà placé{R}")
        for k, l in enumerate(o, 1):
            cout = (f"{V}+0 article{R}" if l["marginal"] == 0
                    else f"+{l['marginal']} article" + ("s" if l["marginal"] > 1 else ""))
            why = []
            if l["chaine"]:
                src = ctx.catalogue[l["depuis"]]["title"] if l["depuis"] else "le frigo"
                why.append(f"{V}↪ base déjà cuite ({src}){R}")
            if l["ecoule"]:
                why.append(f"{V}♻ écoule le frigo{R}")
            if l["manque"]:
                why.append(f"{J}⚠ demande « {l['manque']['type']} » — "
                           f"placer « {l['manque']['fix']} » avant{R}")
            if l["hors_budget"]:
                why.append(f"{J}hors budget{R}")
            if l.get("retard"):
                why.append(f"{J}⏳ {l['retard'][0]['raison']} : l'heure est passée{R}")
            elif l.get("avant"):
                e = l["avant"][0]
                why.append(f"{C}⏳ {e['raison']} "
                           f"{e['dit'].replace('au plus tard ', 'avant ')}{R}")
            if l["emits"]:
                why.append(f"{D}→ laisse {', '.join(l['emits'])}{R}")
            tete = (f"  {B}{k:>2}{R}. {l['titre']:<40} {D}⏱{R} {l['minutes']:>2} min  "
                    f"{cout:<22} ")
            if etat.mode == "equilibre":
                tete += f"{C}{l['score']:>5}{R}  "
            out.append(tete + "  ".join(why))
            if etat.mode == "equilibre" and l["pourquoi"]:
                out.append(f"        {D}{' · '.join(l['pourquoi'])}{R}")
        out.append("")

    if message:
        out.append(f"{J}{message}{R}")
        out.append("")
    out.append(f"{D}[1-9] jouer la carte  ·  [r] repiocher la main  ·  [a] tout le paquet"
               f"  ·  [j N] aller au jour N  ·  [x] vider le jour{R}")
    out.append(f"{D}[t N] budget minutes  ·  [m] tri ({etat.mode})  ·  [l] courses"
               f"  ·  [c] conservation  ·  [p] l'app remplit  ·  [z] effacer  ·  [q] quitter{R}")
    out.append(f"{D}[!] cuisiner le reste condamné  ·  [d] le jeter{R}")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=None)
    ap.add_argument("--jours", type=int, default=6)
    # « Maintenant » ne servait à rien tant que le modèle ne savait pas ce
    # qu'il fallait avoir lancé ; il décide désormais de ce qui est encore
    # rattrapable. 8 h du matin par défaut — on planifie devant son café.
    ap.add_argument("--maintenant", default=None,
                    help="ISO 2026-08-10T18:30 — l'instant d'où on regarde la semaine")
    ap.add_argument("--agenda", action="store_true",
                    help="affiche l'agenda et sort — sans boucle")
    ap.add_argument("--placer", nargs="*", default=None, metavar="N:recette",
                    help="pose des plats sur des créneaux numérotés (défaut : [p])")
    args = ap.parse_args()

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    maintenant = dt.datetime.fromisoformat(args.maintenant) if args.maintenant else None
    ctx, histo = charger(today, args.jours, maintenant)
    etat = M.etat_initial(ctx)

    if args.placer:
        for spec in args.placer:
            n, rid = spec.split(":", 1)
            etat = M.reduire(ctx, M.reduire(ctx, etat, ("jour", int(n) - 1)),
                             ("choisir", rid))

    if args.agenda:
        if not args.placer:
            etat = M.reduire(ctx, etat, ("remplir",))
        print(f"{B}À FAIRE MAINTENANT{R}  {D}(ce qu'une notification dirait){R}")
        print(f"  {C}{annonce(ctx, etat)}{R}\n")
        print("\n".join(bloc_agenda(ctx, etat, n_a_venir=6)))
        return 0
    vue, message = "main", ""

    while True:
        print(frame(ctx, etat, histo, vue, message))
        message = ""
        try:
            cmd = input("> ").strip()
        except EOFError:
            break
        if not cmd:
            continue
        tete, *reste = cmd.split()

        if tete in ("q", "quit"):
            break
        elif tete == "l":
            vue = "main" if vue == "courses" else "courses"
        elif tete == "a":
            vue = "main" if vue == "tous" else "tous"
        elif tete == "c":
            vue = "main" if vue == "conservation" else "conservation"
        elif tete == "r":
            etat = M.reduire(ctx, etat, ("repiocher",))
        elif tete == "!":
            avant = etat.choix
            etat = M.reduire(ctx, etat, ("conjurer",))
            message = ("Malédiction conjurée : le reste est placé au plus tôt."
                       if etat.choix != avant
                       else "Rien ne peut plus le rattraper — reste [d] le jeter.")
        elif tete == "d":
            m = M.malediction(ctx, etat)
            etat = M.reduire(ctx, etat, ("jeter",))
            if m:
                message = (f"Jeté : {m['type']}. C'est un choix, pas un oubli — "
                           f"la semaine en tient compte.")
        elif tete == "m":
            i = M.MODES.index(etat.mode)
            etat = M.reduire(ctx, etat, ("mode", M.MODES[(i + 1) % len(M.MODES)]))
        elif tete == "x":
            etat = M.reduire(ctx, etat, ("vider",))
        elif tete == "z":
            etat = M.reduire(ctx, etat, ("vider-tout",))
        elif tete == "p":
            etat = M.reduire(ctx, etat, ("remplir",))
            message = ("Rempli par l'app. Compare avec tes propres choix — "
                       "c'est la question : veux-tu choisir, ou corriger ?")
        elif tete == "j" and reste and reste[0].isdigit():
            etat = M.reduire(ctx, etat, ("jour", int(reste[0]) - 1))
        elif tete == "t" and reste and reste[0].isdigit():
            etat = M.reduire(ctx, etat, ("budget", int(reste[0])))
        elif tete.isdigit():
            o = M.main_du_soir(ctx, etat, histo) if vue == "main" else M.offre(ctx, etat)
            k = int(tete) - 1
            if 0 <= k < len(o):
                etat = M.reduire(ctx, etat, ("choisir", o[k]["id"]))
            else:
                message = "Pas de carte à ce numéro."
        else:
            message = f"Commande inconnue : {cmd}"

    calc = M.calculer(ctx, etat.choix)
    print("\x1b[2J\x1b[H" + frame(ctx, etat, histo, "courses").split("\x1b[2J\x1b[H")[1])
    print(f"{D}{len(M.articles(calc['panier']))} articles — bonnes courses.{R}")


if __name__ == "__main__":
    sys.exit(main())
