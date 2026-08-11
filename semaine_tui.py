#!/usr/bin/env python3
"""Week builder — throwaway TUI over semaine_model.py (ticket #31).

Drive the week by hand, one dish at a time, and watch what each choice does to
the shopping list. The logic lives in `semaine_model.py`; everything here is
disposable terminal plumbing.

  python3 semaine_tui.py
  python3 semaine_tui.py --today 2026-08-11 --jours 7
"""

import argparse
import datetime as dt
import sys
from pathlib import Path

import yaml

import catalogue
import semaine_model as M

HERE = Path(__file__).parent
JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

B, D, R = "\x1b[1m", "\x1b[2m", "\x1b[0m"
V, J, C = "\x1b[32m", "\x1b[33m", "\x1b[36m"


def charger(today, n_jours):
    cat = catalogue.charger_recettes(HERE / "recipes")
    foyer = yaml.safe_load((HERE / "household.yaml").read_text())["household"]
    stock = yaml.safe_load((HERE / "stock.yaml").read_text())
    rayons = yaml.safe_load((HERE / "rayons.yaml").read_text())
    equilibre = yaml.safe_load((HERE / "equilibre.yaml").read_text())
    conserv = yaml.safe_load((HERE / "conservation.yaml").read_text())
    histo = yaml.safe_load((HERE / "historique.yaml").read_text())
    jours = tuple(JOURS[(today.weekday() + i) % 7] for i in range(n_jours))
    ctx = M.Contexte(catalogue=cat, foyer=foyer, stock=stock, rayons=rayons,
                     equilibre=equilibre, conservation=conserv,
                     today=today, jours=jours)
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


def frame(ctx, etat, histo, vue="main", message=""):
    out = ["\x1b[2J\x1b[H"]
    d0, d1 = ctx.today, ctx.today + dt.timedelta(days=len(ctx.jours) - 1)
    out.append(f"{B}CONSTRUCTION DE LA SEMAINE{R}  "
               f"{D}{d0.strftime('%d/%m')} → {d1.strftime('%d/%m/%Y')} · "
               f"{ctx.foyer['name']} · {M._portions_foyer(ctx.foyer):g} parts{R}")
    out.append("")

    calc = M.calculer(ctx, etat.choix)
    arts = M.articles(calc["panier"])

    # ---- the week
    for i, jour in enumerate(ctx.jours):
        sel = "▸" if i == etat.jour else " "
        date = (ctx.today + dt.timedelta(days=i)).strftime("%d/%m")
        rid = etat.choix[i]
        if rid:
            r = ctx.catalogue[rid]
            marks = []
            if any(c["jour"] == i for c in calc["chaine"]):
                src = next(c["depuis"] for c in calc["chaine"] if c["jour"] == i)
                marks.append(f"{V}↪ part du reste"
                             f"{' de ' + ctx.catalogue[src]['title'] if src else ' du frigo'}{R}")
            if any(p["jour"] == i for p in calc["problemes"]):
                marks.append(f"{J}⚠ reste manquant{R}")
            if r.get("emits"):
                marks.append(f"{D}→ {', '.join(e['type'] for e in r['emits'])}{R}")
            bud = etat.budgets[i]
            temps = f"{r.get('time_min_total')} min"
            if bud and r.get("time_min_total", 0) > bud:
                temps = f"{J}{temps} > {bud}{R}"
            out.append(f" {sel} {B}{i+1}{R} {jour:<9} {D}{date}{R}  "
                       f"{r['title']:<42} {D}⏱{R} {temps}  " + "  ".join(marks))
        else:
            bud = f"{D}(budget {etat.budgets[i]} min){R}" if etat.budgets[i] else ""
            out.append(f" {sel} {B}{i+1}{R} {jour:<9} {D}{date}{R}  "
                       f"{D}— vide —{R} {bud}")
    out.append("")

    # ---- live totals: the whole point is that these move when you choose
    n_plats = sum(1 for c in etat.choix if c)
    out.append(f"{B}LISTE{R}  {C}{len(arts)} articles{R} à acheter · "
               f"{len(calc['placard'])} à vérifier au placard · "
               f"{D}{n_plats} plats, {M.minutes_semaine(ctx, etat.choix)} min de cuisine{R}")
    if calc["chaine"]:
        for c in calc["chaine"]:
            src = ctx.catalogue[c["depuis"]]["title"] if c["depuis"] else "le frigo"
            out.append(f"       {V}↪ {ctx.jours[c['jour']]} part de « {c['type']} » "
                       f"venu de {src} — zéro achat pour cette base{R}")
    for p in calc["problemes"]:
        out.append(f"       {J}⚠ {ctx.jours[p['jour']]} : « {p['titre']} » attend le reste "
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

    cong = M.portions_congelees(ctx, etat.choix)
    if cong["portions"]:
        etiq = f"{J}déborde les {cong['capacite']} portions de tiroir{R}" if cong["deborde"] \
            else f"{D}sur {cong['capacite']} places{R}"
        out.append(f"{B}CONGÉLO{R} {cong['portions']} portion(s) mises de côté "
                   f"cette semaine {etiq}")
    out.append("")

    if vue == "main":
        hand = M.main_du_soir(ctx, etat, histo)
        n_deck = len(M.deck(ctx, etat, histo))
        out.append(f"{B}LA MAIN DE {ctx.jours[etat.jour].upper()}{R}  "
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
        out.append(f"{B}POUR {ctx.jours[etat.jour].upper()}{R} — "
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
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=None)
    ap.add_argument("--jours", type=int, default=6)
    args = ap.parse_args()

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    ctx, histo = charger(today, args.jours)
    etat = M.etat_initial(ctx)
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
