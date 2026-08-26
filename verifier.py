#!/usr/bin/env python3
"""Catalogue integrity checks — run before trusting a newly entered recipe.

WHY THIS EXISTS. Entering the first ten Chioca recipes produced three silent
errors of the same kind: a `seasoning_gate` placed on a step that *creates* the
mixture as well as salting it, so the compiler printed the baby's set-aside
before the thing being set aside existed. Nothing failed — `compile.py` rendered
a plausible, wrong plan. At six recipes you catch that by reading the output. At
a hundred you do not.

Errors are things that will misrender or crash. Warnings are things that were
wrong every time so far but that a recipe could legitimately do — read them,
don't obey them blindly.

    python3 verifier.py            # whole catalogue
    python3 verifier.py <id> ...   # named recipes only
"""

import re
import sys
from pathlib import Path

import anticipation as an
import catalogue
import chainage as ch
import compile as rc  # shadows the builtin `compile` in this module only

HERE = Path(__file__).parent

BANDES = {"1-repas", "2-repas", "3-repas", "lunchbox"}
# Tout ce qu'une ligne d'ingrédient a le droit de porter. La liste est CLOSE
# exprès : c'est elle qui fait remonter les clés nées d'une virgule non quotée
# (voir le contrôle plus bas). Un nouveau champ s'ajoute ici en même temps que
# le code qui le lit.
CHAMPS_INGREDIENT = {"id", "name", "qty", "unit", "seasoning", "ref",
                     "from_accepts", "subs"}
MOTS_ASSAISONNEMENT = re.compile(r"\bsel\b|sal|poivr|assaisonn|rectifi", re.I)
# Une attente écrite DANS la phrase est invisible au modèle : c'est exactement
# la faute que `attente_min` répare, et elle a été commise huit fois avant
# d'être vue. Le contrôle la rend impossible à refaire en silence.
#
# Resserré une fois écrit, et pour la raison que ce fichier connaît déjà : une
# première version attrapait « tremper » et « la veille » n'importe où, donc le
# pain qu'on trempe 3 min et le plat « plus fade que la veille ». Trois faux
# positifs sur quatre — le seuil à partir duquel un contrôle apprend à être
# ignoré. Ne restent que les tournures qui annoncent VRAIMENT une attente.
MOTS_ATTENTE = re.compile(
    r"^\s*la veille\b|\ble lendemain\b|\btoute la nuit\b|\bune nuit\b"
    r"|\bd'avance\b|\bà l'avance\b|\d+\s*h\s*avant|\bà tremper\b|\btrempage\b"
    r"|\bdécongel", re.I)


def verifier(rid: str, r: dict, rayons: dict, rules: dict, cat: dict,
             capacites: set, foyer: dict) -> tuple:
    err, warn = [], []
    ids_connus = {i for v in rayons["rayons"].values() for i in v} | set(rayons["placard"])
    alias = rayons.get("aliases", {})

    etapes = r.get("steps", [])
    vus = []
    for i, s in enumerate(etapes):
        # `compile.py` lit `id` et `action` sans garde : une étape qui n'a ni
        # l'un ni l'autre le fait planter, pas échouer proprement.
        if not isinstance(s, dict) or "id" not in s or "action" not in s:
            err.append(f"étape n°{i + 1} sans `id:` ou `action:` — compile.py plantera dessus")
            continue
        if s["id"] in vus:
            err.append(f"étape en double : {s['id']}")
        for c in s.get("needs", []):
            if c not in capacites:
                err.append(f"étape {s['id']} : capacité « {c} » inconnue "
                           "(ni dans rules.yaml, ni fournie par un équipement du foyer)")
        p = s.get("parallel_with")
        if p and p not in vus:
            err.append(f"étape {s['id']} : parallel_with « {p} » ne précède pas cette étape")

        # L'attente, seconde horloge du modèle (cf. `anticipation.py`).
        att = s.get("attente_min")
        if att is not None and (not isinstance(att, int) or att <= 0):
            err.append(f"étape {s['id']} : `attente_min` doit être un entier de minutes "
                       "strictement positif")
        elif att and att >= an.COUPURE_MIN and not s.get("attente_raison"):
            warn.append(f"étape {s['id']} : {att} min d'attente coupent la recette en deux "
                        "séances, mais sans `attente_raison:` l'agenda ne saura pas dire "
                        "de quoi il s'agit")
        rat = s.get("rattrapage")
        if rat and not (rat.get("action") and rat.get("cout_min")):
            err.append(f"étape {s['id']} : `rattrapage` demande une `action` et un "
                       "`cout_min` — sans quoi il n'y a rien à proposer à qui a oublié")
        if not att and MOTS_ATTENTE.search(s.get("action", "")):
            warn.append(f"étape {s['id']} : l'action parle d'attente (« la veille », "
                        "« 2 h avant », trempage…) sans `attente_min:`. Écrite dans la "
                        "phrase, l'attente est invisible au modèle : le plat ne sera "
                        "jamais annoncé la veille et son coût sera facturé au repas.")
        vus.append(s["id"])

    # Ingrédients : tout id doit avoir un rayon, sinon il tombe en « NON CLASSÉ ».
    for ing in r.get("ingredients", []) + r.get("sans_reste", {}).get("ingredients", []):
        # UNE VIRGULE NON QUOTÉE COUPE LE NOM EN DEUX, EN SILENCE. Les lignes
        # d'ingrédient sont écrites en flow mapping — `{id: x, name: y, qty: 1}` —
        # où la virgule sépare les champs. Un nom qui en contient une sans être
        # entre guillemets s'arrête donc à la virgule, et ce qui suit devient une
        # CLÉ sans valeur, que personne ne lit. Rien ne casse : la recette se
        # charge, se vérifie et se compile, avec un nom amputé.
        #
        # Huit lignes du catalogue étaient dans ce cas, découvertes en saisissant
        # l'hiver. Ce qu'elles perdaient n'était pas de l'ornement — « sans peau
        # ni arêtes », « à température ambiante », « très froide » : des
        # instructions dont dépend la recette. Les clés inconnues sont donc une
        # erreur, jamais un avertissement.
        inconnues = set(ing) - CHAMPS_INGREDIENT
        if inconnues:
            err.append(
                f"ingrédient « {ing.get('id', '?')} » : champ(s) inconnu(s) "
                f"{sorted(inconnues)} — presque toujours une virgule non quotée "
                f"dans `name:`, qui a coupé le nom à « {ing.get('name')} » et "
                "transformé la suite en clés vides. Mettre le nom entre guillemets.")
        if ing.get("from_accepts"):
            continue
        cid = alias.get(ing["id"], ing["id"])
        if cid not in ids_connus:
            err.append(f"ingrédient « {cid} » sans rayon (à ajouter dans rayons.yaml)")

    # Chaînage. Un `accepts` demande soit un `type:` exact (« sauce-bolognaise »),
    # soit un `kind:`, c'est-à-dire une CLASSE de sorties (« n'importe quel
    # reste-plat »). Tous les lecteurs passent par `chainage.accepte`.
    for acc in r.get("accepts", []):
        libelle = ch.libelle_accepts(acc)
        if not acc.get("type") and not acc.get("kind"):
            err.append("accepts sans `type:` ni `kind:` — l'arête ne peut matcher "
                       "aucune sortie, et échoue en silence")
            continue
        if acc.get("required") and not r.get("sans_reste"):
            fb = acc.get("fallback_recipe")
            if fb and fb not in cat:
                err.append(f"fallback_recipe « {fb} » absent du catalogue")
            elif not fb and acc.get("type"):
                err.append(f"accepts « {acc['type']} » requis, sans sans_reste ni "
                           "fallback_recipe : le plat sera bloqué à chaque tirage")
            elif not fb:
                # Une arête par CLASSE n'a pas de recette de repli unique — c'est
                # tout l'intérêt : n'importe lequel des émetteurs la couvre. Ce
                # qu'il faut vérifier, c'est qu'il en existe au moins un.
                emis = any(e.get("kind") == acc["kind"]
                           for r2 in cat.values() for e in r2.get("emits", []))
                if not emis:
                    err.append(f"accepts « {libelle} » requis, mais aucune recette du "
                               "catalogue n'émet cette classe : le plat sera bloqué "
                               "à chaque tirage")
    for e in r.get("emits", []):
        if e.get("qty_band") not in BANDES:
            warn.append(f"emits « {e.get('type')} » : bande « {e.get('qty_band')} » hors vocabulaire {sorted(BANDES)}")
        amount, unit = ch.quantite(e)
        if e.get("qty") is not None and (amount is None or amount <= 0 or not unit):
            err.append(f"emits « {e.get('type')} » : `qty:` doit porter un `amount` "
                       "positif et une `unit`")
        # Une arête typée dont l'émetteur ne chiffre rien retombe sur le jeton :
        # elle se laisse consommer autant de fois qu'on veut. La bande ne suffit
        # pas — « 2-repas » ne se compare pas à « 700 g ».
        demandeurs = [(rid2, ch.quantite(a)) for rid2, r2 in cat.items()
                      for a in r2.get("accepts", [])
                      if a.get("type") and a["type"] == e.get("type")]
        for rid2, (besoin, u2) in demandeurs:
            if besoin is None:
                continue
            if amount is None:
                warn.append(f"emits « {e['type']} » sans `qty:` alors que « {rid2} » en "
                            f"réclame {besoin} {u2} : le chaînage ne saura pas s'il y en "
                            "a assez, et la sortie se consommera sans jamais baisser")
            elif unit != u2:
                err.append(f"emits « {e['type']} » chiffré en {unit}, mais « {rid2} » le "
                           f"réclame en {u2} : les deux faces d'une arête doivent se "
                           "mesurer dans la même unité")
            break

    # La vaisselle est une capacité finie, comme la mémoire d'un CPU de craft :
    # un lot qui n'entre pas dans le récipient ne se cuisine pas, quels que
    # soient les ingrédients. Zéro recette du catalogue est dans ce cas
    # aujourd'hui ; le contrôle existe pour que ça se voie le jour où une
    # recette pour 12 arrive dans un foyer qui n'a qu'une sauteuse.
    eq_max, f_max = ch.facteur_max_vaisselle(r, foyer)
    if f_max is not None:
        base = r["yields"]["portions_eq"]
        garde = any(e.get("keeps", {}).get("congelo") or e["kind"] == "reste-plat"
                    for e in r.get("emits", []))
        besoin = sum(e["portion_eq"] for e in foyer["eaters"] if e.get("diet") != "baby")
        f = ch.facteur_lot(r, 1.0 if (garde and besoin < base) else besoin / base)
        if f > f_max + 1e-9:
            lab = eq_max.get("label", eq_max["id"])
            err.append(f"le lot courant (×{f:.2g} de {base:g} parts) ne tient pas dans "
                       f"{lab} (×{f_max:.2g} au maximum) : la recette ne s'exécute pas "
                       "telle quelle chez ce foyer")

    # `drop:` est une CHAÎNE (l'id de l'étape), `swap:` est un mapping — asymétrie
    # de `compile.py`. Écrire `drop: {step: …}` ne lève rien : la comparaison
    # str/dict échoue en silence et le plan B ne s'applique jamais.
    for pb in r.get("plan_b", []):
        if "drop" in pb:
            if not isinstance(pb["drop"], str):
                err.append("plan_b : `drop:` doit être l'id de l'étape en clair, pas un mapping")
                continue
            cible = pb["drop"]
        elif "swap" in pb:
            cible = pb["swap"].get("step")
        else:
            err.append("entrée plan_b sans `drop:` ni `swap:`")
            continue
        if cible not in vus:
            err.append(f"plan_b vise l'étape « {cible} », qui n'existe pas")

    # `uses:` — le lien étape → ingrédient, et ses deux façons de mentir.
    #
    # Il est FACULTATIF par recette (la plupart du catalogue ne l'a pas encore)
    # mais TOTAL dès qu'une recette en déclare un seul : une couverture partielle
    # est pire que pas de couverture du tout, parce qu'un écran qui déroule la
    # recette geste par geste ne montre alors qu'une partie des quantités sans
    # rien signaler, et le cuisinier oublie ce qui manque en croyant tout voir.
    refs, doublons = {}, []
    for i in r.get("ingredients", []):
        cle = i.get("ref") or i["id"]
        if cle in refs:
            doublons.append(cle)
        refs[cle] = i
    if any("uses" in s for s in etapes if isinstance(s, dict)):
        # Une même ligne deux fois — l'huile de la pâte et celle de la farce —
        # n'est un problème QUE là : sans `uses:`, l'`id` commun est même ce
        # qu'on veut, c'est lui qui fusionne les deux lignes de courses.
        for cle in doublons:
            err.append(f"deux lignes d'ingrédient portent la même référence « {cle} » : "
                       "`uses:` ne peut pas les distinguer — donner un `ref:` à chacune")
        vises = set()
        for s in etapes:
            if not isinstance(s, dict) or "id" not in s:
                continue
            if "uses" not in s:
                err.append(f"étape « {s['id']} » sans `uses:` alors que d'autres étapes en ont : "
                           "la couverture doit être totale, sinon l'écran affiche une "
                           "partie des quantités en ayant l'air de toutes les afficher "
                           "— écrire `uses: []` si l'étape ne consomme rien")
                continue
            for u in s["uses"]:
                if u not in refs:
                    err.append(f"étape « {s['id']} » : `uses: {u}` ne correspond à aucun "
                               "ingrédient de la recette")
                else:
                    vises.add(u)
        # Un ingrédient qu'aucune étape ne réclame est acheté et jamais versé.
        # Les assaisonnements ne sont PAS dispensés : le sel oublié dans la
        # liste sans étape pour l'employer est justement la faute que
        # `seasoning_gate` a déjà attrapée une fois sur `omelette-courgettes`.
        for cle, i in refs.items():
            if cle not in vises:
                err.append(f"« {i['name']} » est dans la liste d'ingrédients mais aucune "
                           "étape ne l'emploie : il serait acheté et jamais versé")

    # Le prélèvement bébé et sa porte.
    portes = [s for s in etapes if s.get("seasoning_gate")]
    if r.get("baby_portion"):
        if not portes:
            # LE CONTRÔLE DATAIT D'AVANT `depuis:`, ET SON MESSAGE EST DEVENU
            # FAUX. `compile.py` cherche d'abord les étapes de `depuis:` et rend
            # le prélèvement après la dernière ; il ne retombe sur la porte que
            # si `depuis:` est vide. Un plat SANS SEL DU TOUT — le yaourt de
            # soja p. 159, la compotée de pommes de la p. 160 — a un
            # prélèvement parfaitement injectable et se voyait refuser au motif
            # qu'il « ne serait jamais injecté ».
            #
            # Le contrôle supposait que la seule raison de prélever tôt est le
            # salage. C'est vrai de la majorité du catalogue et faux en général :
            # ce qu'il faut, c'est savoir D'OÙ sort la portion, et `depuis:` le
            # dit mieux qu'une porte.
            if not r["baby_portion"].get("depuis"):
                err.append("baby_portion sans seasoning_gate ni `depuis:` : rien ne dit "
                           "où insérer le prélèvement, il ne sera jamais injecté")
        elif len(portes) > 1:
            err.append(f"{len(portes)} seasoning_gate : le prélèvement serait injecté plusieurs fois")
        else:
            g = portes[0]
            # L'erreur commise trois fois : une porte posée sur l'étape qui
            # FABRIQUE la chose à prélever, donc le prélèvement est rendu avant
            # qu'elle existe. La bonne question n'est pas « cette étape est-elle
            # trop longue pour ne faire que saler » — c'était une devinette, et
            # elle criait au loup sur quatre recettes correctes sur cinq. C'est
            # « ce qu'on prélève existe-t-il déjà à ce moment-là ». `depuis:`
            # répond en données : les étapes dont sort la portion bébé, ou `[]`
            # quand elle est prélevée sur un ingrédient (disponible d'emblée).
            depuis = r["baby_portion"].get("depuis")
            if depuis is None:
                if g.get("time_min", 0) > 2:
                    warn.append(f"seasoning_gate sur « {g['id']} » ({g['time_min']} min) sans `depuis:` sur "
                                "baby_portion : faute de savoir d'où sort la portion, on ne peut que deviner. "
                                "Une étape qui ne fait que saler est courte ; si celle-ci fabrique aussi ce "
                                "qu'on prélève, le prélèvement sera injecté AVANT que ça existe.")
            else:
                rang_porte = vus.index(g["id"]) if g["id"] in vus else len(vus)
                for sid in depuis:
                    if sid not in vus:
                        err.append(f"baby_portion `depuis: {sid}` — cette étape n'existe pas")
                    elif vus.index(sid) >= rang_porte:
                        err.append(f"baby_portion prélevée depuis « {sid} », qui ne précède pas la porte "
                                   f"« {g['id']} » : le prélèvement serait rendu avant que la chose à "
                                   "prélever existe. C'est exactement la faute passée trois fois.")
            if not MOTS_ASSAISONNEMENT.search(g.get("action", "")):
                warn.append(f"seasoning_gate sur « {g['id']} » : l'action ne parle pas d'assaisonnement")

    # Une source doit être RETROUVABLE, pas forcément paginée : un livre se cite
    # par sa page, un billet de blog par son URL.
    src = r.get("source")
    if src and not (src.get("page") or src.get("url")):
        warn.append("bloc source sans numéro de page ni URL : la recette n'est pas retrouvable")
    return err, warn


def verifier_foyer(foyer: dict, equilibre: dict, capacites: set) -> tuple:
    """Le foyer aussi se vérifie : espaces et contenants sont des données.

    Un contenant qui ne va nulle part, ou un espace sans contenant possible,
    sont des impasses silencieuses — la semaine se planifie et rien ne se range.
    """
    err, warn = [], []
    for c in foyer.get("contenants", []) or []:
        cid = c.get("id", "?")
        if not c.get("nombre") or not c.get("portions"):
            err.append(f"contenant « {cid} » : il faut un `nombre` et des `portions` "
                       "non nuls, sinon il n'offre aucune place")
        inconnus = set(c.get("espaces", [])) - set(ch.ESPACES)
        if inconnus:
            err.append(f"contenant « {cid} » : espace(s) inconnu(s) {sorted(inconnus)} "
                       f"— attendu parmi {list(ch.ESPACES)}")
        if not c.get("espaces"):
            err.append(f"contenant « {cid} » ne déclare aucun espace : il ne servira jamais")

    espaces = ch.capacites_stockage(foyer, equilibre)
    boites = ch.contenants_par_espace(foyer, capacites)
    for espace, cap in espaces.items():
        if not boites.get(espace):
            warn.append(f"espace « {espace} » : {cap:g} places d'étagère mais AUCUN "
                        "contenant utilisable — rien ne peut y être rangé")
    return err, warn


def main() -> int:
    rayons = rc.load(HERE / "rayons.yaml")
    rules = rc.load(HERE / "rules.yaml")
    foyer = rc.load(HERE / "household.yaml")["household"]
    cat = catalogue.charger_recettes(HERE / "recipes")

    # Une capacité est valide si une chaîne de repli la décrit (rules.yaml) OU si
    # un équipement du foyer la fournit directement — `boil` et `gratin-vessel`
    # n'existent que par la seconde voie.
    capacites = set(rules["capabilities"])
    for e in foyer["equipment"]:
        capacites |= set(e.get("capabilities", []))

    equilibre = rc.load(HERE / "equilibre.yaml")
    cibles = sys.argv[1:] or sorted(cat)
    n_err = n_warn = 0

    # Le foyer d'abord : si les espaces ou les contenants sont incohérents,
    # aucune recette ne se range, et le dire recette par recette serait 51 fois
    # le même message.
    if not sys.argv[1:]:
        err, warn = verifier_foyer(foyer, equilibre, capacites)
        n_err += len(err); n_warn += len(warn)
        if err or warn:
            print("\nhousehold.yaml")
            for e in err:
                print(f"  ✗ {e}")
            for w in warn:
                print(f"  ⚠ {w}")
    for rid in cibles:
        if rid not in cat:
            print(f"✗ {rid} : absent du catalogue")
            n_err += 1
            continue
        err, warn = verifier(rid, cat[rid], rayons, rules, cat, capacites, foyer)
        n_err += len(err)
        n_warn += len(warn)
        if err or warn:
            print(f"\n{rid}")
            for e in err:
                print(f"  ✗ {e}")
            for w in warn:
                print(f"  ⚠ {w}")

    plan = sum(1 for rid in cibles if rid in cat and not catalogue.est_cuisinable(cat[rid]))
    print(f"\n{len(cibles)} recettes · {len(cibles) - plan} cuisinables, {plan} au niveau plan "
          f"· {n_err} erreur(s), {n_warn} avertissement(s)")

    # Une ligne, pas un avertissement par recette : ce sont les portions bébé
    # encore contrôlées à la devinette faute de `depuis:`. C'est une dette, elle
    # se solde en lisant les recettes une par une, et elle mérite d'être visible
    # sans noyer les vraies trouvailles.
    sans_depuis = sorted(rid for rid in cibles
                         if rid in cat and cat[rid].get("baby_portion")
                         and cat[rid]["baby_portion"].get("depuis") is None)
    if sans_depuis:
        print(f"  ({len(sans_depuis)} baby_portion sans `depuis:` — porte contrôlée "
              f"par heuristique, pas par la structure)")
    return 1 if n_err else 0


if __name__ == "__main__":
    sys.exit(main())
