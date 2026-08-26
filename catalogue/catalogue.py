"""Recipe loading — the one place that knows where recipes live.

Two entry formats, on purpose:

- `recipes/<id>.yaml` with a top-level `recipe:` — a fully authored dish, with
  steps, plan B, kid tasks and the baby set-aside. What `compile.py` needs to
  actually cook it.
- `recipes/_*.yaml` with a top-level `recipes:` list — bulk entry at *plan
  level*: title, time, ingredients, apports. Enough to plan a week and shop for
  it; not enough to cook from.

The split is the finding, not an accident. Requiring a complete recipe before a
dish may enter the catalogue is what keeps a repertoire stuck at six, and a
planner with six dishes cannot pose the choosing question at all.
"""

from pathlib import Path

import yaml


def charger_recettes(dossier: Path) -> dict:
    """recipe_id -> recipe dict, from both entry formats."""
    catalogue = {}
    for p in sorted(dossier.glob("*.yaml")):
        data = yaml.safe_load(p.read_text())
        if not data:
            continue
        if "recipe" in data:
            r = data["recipe"]
            catalogue[r["id"]] = r
        elif "recipes" in data:
            for r in data["recipes"]:
                catalogue[r["id"]] = r
    return catalogue


def est_cuisinable(recipe: dict) -> bool:
    """A plan-level entry has no steps: it can be planned, not cooked."""
    return bool(recipe.get("steps"))
