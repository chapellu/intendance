# Recipe-compilation grammar — prototype (ticket #31)

Answers map #26's second novel object: can a recipe stored as *data* be compiled
against a real household — its utensils, its eaters, tonight's chaos — instead of
being displayed as prose? Test material: a **real Marie Chioca recipe** (« Petits
burgers pour grands gourmands », Saines Gourmandises, 23/02/2012), re-worded and
structured per the licensing frame (dish and process are free; her prose and
photos are not reproduced), plus an authored household staple
(`lentilles-mijotees`) that *emits* the cooked-lentil base the burgers *accept* —
one live edge of the #30 chaining graph, chosen deliberately: Chioca herself
designed the recipe to consume a leftover.

## Run it

```bash
python3 compile.py burgers-de-lentilles              # normal night, reste in stock
python3 compile.py burgers-de-lentilles --no-stock   # reste missing → prelude points at mother recipe
python3 compile.py burgers-de-lentilles --time 20    # plan B compression + freezer-portion fallback advice
python3 compile.py burgers-de-lentilles --kids       # monthly kids session: toddler tasks surface
python3 compile.py lentilles-mijotees                # the emitting dish: cocotte + steamer-basket parallelism
```

Frozen sample outputs live in `demo/`.

## Planning a week and shopping for it (`plan.py`)

```bash
python3 plan.py                             # the week in semaine.yaml
python3 plan.py --today 2026-08-11          # plan from a given date
python3 plan.py lentilles-mijotees omelette-courgettes   # an ad-hoc list
```

`compile.py` answers *what do I cook tonight*; `plan.py` answers the question
that comes before it and that you cannot do in your head: **given a week of
dishes, what do I actually have to buy?**

The arithmetic is trivial; the chaining is not. Walking the days forward, a
dish that `emits` a base feeds a later dish that `accepts` it, so the accepted
item never reaches the list — Wednesday's burgers cost nothing because Tuesday
simmered the lentils. Beyond that it does three things a paper list cannot:
it **rounds countables up** at the end of the week (nobody buys 7.5 onions,
though 7.5 is the correct kitchen quantity), it separates **buy** from
**check the cupboard** (a list that says "buy salt" every week gets ignored),
and it reports what is **already in the fridge** — including a reste that has
aged out of the freshness window, which is exactly the thing you rediscover too
late.

Two findings from building it:

- **Ingredient ids drift immediately.** Two recipes authored a week apart
  already disagreed (`oignons` vs `oignon`), which would have split one
  shopping line into two. `rayons.yaml` carries an `aliases` map as a stand-in,
  but this is the typed ingredient vocabulary this README predicted would be
  needed at corpus scale, arriving at *six* recipes rather than a hundred.
- **The aisle table is per-shop, not per-recipe.** `rayons.yaml` is ordered to
  be walked, so the list comes out in the order you meet the shelves. That
  ordering is household data, not recipe data — another file the real app has
  to own.

## What a recipe must be stored as (the ticket's first question)

See `recipes/*.yaml`. The load-bearing fields, discovered by building:

- **Steps as data**: `action` (French, one imperative sentence), `needs`
  (capabilities, never tools), `time_min`, `attended`, `parallel_with`.
- **`needs` is the whole trick**: a step requires a *capability* (`chop-coarse`,
  `steam`); `rules.yaml` holds one global fallback chain per capability mapping it
  onto whatever the household owns, with a text `rewrite` and a `time_delta_min`.
  Chioca's food-processor step compiles to « au petit blender, en 2–3 fois, par
  impulsions courtes » because the household file says so — no per-recipe rule.
- **`accepts` / `emits`** (from #30): typed chaining outputs with coarse quantity
  bands. `accepts` checks stock (freshness window from the household file);
  missing → prelude pointing at `fallback_recipe`. `emits` renders as a
  "consigner dans le stock" footer — the cooking event *is* the stock event.
- **`seasoning_gate` + `baby_portion`**: one boolean on a step; the compiler
  injects the unsalted set-aside *before* it whenever an eater has `diet: baby`.
- **`plan_b`**: per-recipe list of `drop`/`swap` entries with honest `effect`
  labels, applied greedily until the time budget fits; if it still doesn't fit,
  the advice is the #30 fallback (« portion maison du congélo »), never a
  degraded mess.
- **`kid`**: per-step `age_min_months` + task, filtered against the eldest's age.

## Verdict on combinatorial explosion (the ticket's core worry)

**It doesn't explode.** The prototype is ~260 lines and the growth is linear:

| grows with… | cost |
|---|---|
| a new recipe | its own YAML (steps, plan_b, kid notes) — zero new rules |
| a new tool | amend a few capability chains in `rules.yaml` |
| a new eater/constraint | one line in `household.yaml` |

The only authored-per-recipe intelligence is `plan_b` and the kid annotations —
both cheap, both genuinely recipe-specific. Substitutions are currently a
per-ingredient table; at corpus scale (~100+ recipes) they should migrate to a
typed ingredient vocabulary shared with `accepts`/`emits`, which is needed anyway.

## What the prototype does NOT answer

- The **guided surface**: output is a text plan, not the phone-propped-in-the-
  kitchen step-by-step with live timers. The compiled structure (ordered steps,
  durations, parallelism, attended flags) is exactly what such a UI consumes, but
  the UX itself is unbuilt — that's app-building, beyond this map's mandate.
- Quantity intelligence beyond banded rounding (vessel-size checks — e.g. does
  the batch fit the 28 cm sauteuse — is representable via capabilities but not
  implemented).
- The full-batch-vs-scale decision is a single rule here (keep full batch when
  emits keep well); the real planner should weigh freezer-drawer budget (#30).
