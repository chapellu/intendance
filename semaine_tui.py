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

import semaine_model as M

HERE = Path(__file__).parent
JOURS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")

B, D, R = "\x1b[1m", "\x1b[2m", "\x1b[0m"
V, J, C = "\x1b[32m", "\x1b[33m", "\x1b[36m"


def charger(today, n_jours):
    catalogue = {}
    for p in sorted((HERE / "recipes").glob("*.yaml")):
        r = yaml.safe_load(p.read_text())["recipe"]
        catalogue[r["id"]] = r
    foyer = yaml.safe_load((HERE / "household.yaml").read_text())["household"]
    stock = yaml.safe_load((HERE / "stock.yaml").read_text())
    rayons = yaml.safe_load((HERE / "rayons.yaml").read_text())
    jours = tuple(JOURS[(today.weekday() + i) % 7] for i in range(n_jours))
    return M.Contexte(catalogue=catalogue, foyer=foyer, stock=stock,
                      rayons=rayons, today=today, jours=jours)


def frame(ctx, etat, vue_liste=False, message=""):
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
    out.append("")

    if vue_liste:
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
            out.append(f"  {B}{k}{R}. {l['titre']:<42} {D}⏱{R} {l['minutes']:>2} min  "
                       f"{cout:<22} " + "  ".join(why))
        out.append("")

    if message:
        out.append(f"{J}{message}{R}")
        out.append("")
    out.append(f"{D}[1-9] choisir dans la liste  ·  [j N] aller au jour N  ·  [x] vider le jour"
               f"  ·  [t N] budget minutes{R}")
    out.append(f"{D}[m] mode de tri  ·  [l] liste de courses  ·  [p] laisser l'app remplir"
               f"  ·  [z] tout effacer  ·  [q] quitter{R}")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--today", default=None)
    ap.add_argument("--jours", type=int, default=6)
    args = ap.parse_args()

    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    ctx = charger(today, args.jours)
    etat = M.etat_initial(ctx)
    vue_liste, message = False, ""

    while True:
        print(frame(ctx, etat, vue_liste, message))
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
            vue_liste = not vue_liste
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
            o = M.offre(ctx, etat)
            k = int(tete) - 1
            if 0 <= k < len(o):
                etat = M.reduire(ctx, etat, ("choisir", o[k]["id"]))
            else:
                message = "Pas de plat à ce numéro."
        else:
            message = f"Commande inconnue : {cmd}"

    calc = M.calculer(ctx, etat.choix)
    print("\x1b[2J\x1b[H" + frame(ctx, etat, True).split("\x1b[2J\x1b[H")[1])
    print(f"{D}{len(M.articles(calc['panier']))} articles — bonnes courses.{R}")


if __name__ == "__main__":
    sys.exit(main())
