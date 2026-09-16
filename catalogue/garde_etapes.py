#!/usr/bin/env python3
"""Ce qu'un recoupage d'étapes n'a pas le droit de perdre.

POURQUOI CE FICHIER EXISTE. Couper une étape en deux est une transformation
d'apparence anodine et de fond dangereuse : les minutes doivent se répartir sans
que la somme bouge, le `uses:` doit suivre le geste qui verse vraiment, et
`parallel_with`, `plan_b`, `baby_portion.depuis` et `seasoning_gate` désignent
des étapes PAR LEUR ID — une étape renommée casse une référence en silence.
`verifier.py` attrape la référence morte ; il ne peut rien dire d'un `uses:`
tombé en route ou de dix minutes disparues, parce qu'il ne connaît pas l'état
d'avant.

Ce garde-là compare le corpus du disque à celui d'une RÉFÉRENCE GIT, recette par
recette, et n'autorise que les changements qui ne perdent rien.

    python3 catalogue/garde_etapes.py [ref]     # défaut : HEAD

Ce qu'il NE contrôle pas : le nombre d'étapes, leur ordre, leur prose. C'est ce
qu'on est en train de changer — le garde tient les invariants, pas la forme.
"""

import subprocess
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).parent
RECETTES = HERE / "recipes"


# DEUX FORMES DE FICHIER, et les deux comptent : `recipe:` pour une recette
# encodée depuis un ouvrage (124 fichiers), `recipes:` pour la liste du
# répertoire du foyer (1 fichier, 15 plats). Ne lire que la seconde, c'est ce
# que faisait la première version de ce garde — il annonçait fièrement
# « 15 recettes · 0 casse » sur un corpus de 138.
def _charger(texte: str) -> dict:
    d = yaml.safe_load(texte) or {}
    lot = list(d.get("recipes", []))
    if isinstance(d.get("recipe"), dict):
        lot.append(d["recipe"])
    return {r["id"]: r for r in lot if isinstance(r, dict) and "id" in r}


def corpus_disque() -> dict:
    out = {}
    for f in sorted(RECETTES.glob("*.yaml")):
        out.update(_charger(f.read_text(encoding="utf8")))
    return out


def corpus_git(ref: str) -> dict:
    fichiers = subprocess.run(
        ["git", "ls-tree", "--name-only", f"{ref}:catalogue/recipes"],
        capture_output=True, text=True, check=True).stdout.split()
    out = {}
    for f in sorted(fichiers):
        if not f.endswith(".yaml"):
            continue
        texte = subprocess.run(["git", "show", f"{ref}:catalogue/recipes/{f}"],
                               capture_output=True, text=True, check=True).stdout
        out.update(_charger(texte))
    return out


def _steps(r: dict) -> list:
    return [s for s in r.get("steps", []) if isinstance(s, dict)]


def empreinte(r: dict) -> dict:
    """Ce qui doit survivre à un recoupage. Des grandeurs et des ensembles —
    jamais un nombre d'étapes, qui est précisément ce qu'on fait varier."""
    ss = _steps(r)
    return {
        "minutes": sum(s.get("time_min", 0) or 0 for s in ss),
        # Les minutes NON SURVEILLÉES à part : elles décident si une journée
        # tient, et les noyer dans le total masquerait qu'une cuisson sans
        # surveillance est devenue un geste devant la casserole.
        "minutes_libres": sum(s.get("time_min", 0) or 0 for s in ss
                              if s.get("attended") is False),
        "attente": sum(s.get("attente_min", 0) or 0 for s in ss),
        "uses": {u for s in ss for u in (s.get("uses") or [])},
        "needs": {n for s in ss for n in (s.get("needs") or [])},
        "portes": sum(1 for s in ss if s.get("seasoning_gate")),
        "rattrapages": sum(1 for s in ss if s.get("rattrapage")),
        "enfants": sum(1 for s in ss if s.get("kid")),
        "total_declare": r.get("time_min_total"),
    }


def references_mortes(r: dict) -> list:
    """Tout id d'étape cité ailleurs dans la recette, et qui doit exister."""
    ids = {s.get("id") for s in _steps(r)}
    morts = []
    for s in _steps(r):
        p = s.get("parallel_with")
        if p and p not in ids:
            morts.append(f"parallel_with « {p} » (sur {s.get('id')})")
    for pb in r.get("plan_b", []) or []:
        if "drop" in pb and pb["drop"] not in ids:
            morts.append(f"plan_b.drop « {pb['drop']} »")
        if "swap" in pb and pb["swap"].get("step") not in ids:
            morts.append(f"plan_b.swap.step « {pb['swap'].get('step')} »")
    for d in (r.get("baby_portion") or {}).get("depuis", []) or []:
        if d not in ids:
            morts.append(f"baby_portion.depuis « {d} »")
    return morts


def main() -> int:
    ref = sys.argv[1] if len(sys.argv) > 1 else "HEAD"
    avant, apres = corpus_git(ref), corpus_disque()

    casses, gagne, touchees = [], [], 0
    for rid, r in sorted(apres.items()):
        morts = references_mortes(r)
        if morts:
            casses.append(f"{rid} : référence morte — {', '.join(morts)}")
        # Un id d'étape en double rendrait `parallel_with` ambigu sans que rien
        # ne lève : `verifier.py` le dit déjà, on le redit ici parce qu'un
        # recoupage est exactement le geste qui le produit.
        ids = [s.get("id") for s in _steps(r)]
        if len(ids) != len(set(ids)):
            casses.append(f"{rid} : id d'étape en double")
        if rid not in avant:
            continue
        a, b = empreinte(avant[rid]), empreinte(r)
        if a == b:
            continue
        touchees += 1
        for cle in a:
            if a[cle] == b[cle]:
                continue
            if cle in ("uses", "needs"):
                perdu = a[cle] - b[cle]
                if perdu:
                    casses.append(f"{rid} : {cle} perdu(s) — {sorted(perdu)}")
                # En gagner est licite : un geste isolé peut enfin déclarer ce
                # qu'il verse. C'est même l'un des buts du recoupage.
            elif cle == "minutes_libres":
                # ELLES NE PEUVENT QUE BAISSER, ET C'EST LE BUT. Recouper une
                # cuisson isole le geste qui la lance — verser, porter à
                # frémissement — et rend ces minutes-là surveillées, ce qui est
                # la vérité de la cuisine. L'inverse serait une promesse neuve :
                # dire « sans surveiller » d'un geste qui n'était pas déclaré
                # libre, c'est inventer du temps de repos qu'on n'a pas mesuré.
                if b[cle] > a[cle]:
                    casses.append(f"{rid} : minutes sans surveillance en hausse "
                                  f"{a[cle]} → {b[cle]} — personne n'a mesuré ce repos")
                else:
                    gagne.append(f"{rid} : {a[cle] - b[cle]} min rendues à la surveillance")
            else:
                casses.append(f"{rid} : {cle} {a[cle]} → {b[cle]}")

    nouvelles = sorted(set(apres) - set(avant))
    disparues = sorted(set(avant) - set(apres))
    print(f"{len(apres)} recettes · {touchees} dont les étapes ont bougé "
          f"depuis {ref} · {len(casses)} casse(s)")
    if nouvelles:
        print(f"  + {len(nouvelles)} nouvelle(s) : {', '.join(nouvelles)}")
    if disparues:
        print(f"  − {len(disparues)} disparue(s) : {', '.join(disparues)}")
    for g in gagne:
        print(f"  · {g}")
    for c in casses:
        print(f"  ✗ {c}")
    return 1 if casses else 0


if __name__ == "__main__":
    sys.exit(main())
