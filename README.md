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

## Building the week by hand (`semaine_tui.py`) — the choosing prototype

```bash
python3 semaine_tui.py                            # 6 dinners from today
python3 semaine_tui.py --today 2026-08-11 --jours 3
```

`plan.py` prices a week somebody already decided, which is what prompted the
user's objection: *you chose the dishes for me, I want to choose.* So this
prototype answers the question that comes before both:

> When I build the week one dish at a time, what must the app show me after
> every choice, so that choosing feels informed rather than blind?

**The bet under test: the useful feedback is marginal, not total.** A 17-line
shopping list tells you nothing while you are still choosing. What tells you
something is *this dish adds 2 lines, that one adds 6, and this third adds 1
because Tuesday already cooked its base.* Every candidate is therefore priced
in **new shopping lines given everything already picked**, recomputed on every
keystroke — and, since the objective was corrected, scored on what it adds to
the week's coverage (see `equilibre` below, now the default sort).

The moment worth watching is Wednesday. Before lentils are placed anywhere, the
burgers read `+2 articles  ⚠ demande « lentilles-vertes-cuites »`. Put the
lentils on Tuesday and the same dish becomes `+1 article  ↪ base déjà cuite` —
the chaining stops being a footnote in a README and becomes the reason you pick
that dish tonight.

`semaine_model.py` is pure and holds all of it — `reduire(ctx, etat, action)`,
`calculer`, `offre`. The TUI is disposable; the model is the part that lifts
into the real app.

### A hand of cards, dealt from a deck that turns over

The user's own picture of the thing: *a card game, with a deck that varies and
cards of different categories.* That is a better interaction than a ranked list
of twenty-one dishes, and it fixes the original complaint properly — a hand is a
choice among a few, not a verdict.

- **Suits are derived, never hand-tagged.** A dish that emits a base *is* a
  `♠ SOUCHE`; one with an `accepts` edge *is* `♥ SUR UN RESTE`; under 25 minutes
  is `♦ EXPRESS`; freezable is `♣ SE CONGÈLE`. Category falls out of the recipe
  data that already existed.
- **The balance score becomes a draw weight, not a ranking.** What the week
  needs comes up more often without the app deciding. The floor is deliberately
  positive so an ill-fitting dish stays possible — a deck you can predict is not
  a deck.
- **The hand is composed, not top-N**: `main.garantir` in `equilibre.yaml`
  guarantees an express, a souche and a derivative in every hand, so you are
  never offered five 50-minute oven dishes on a Tuesday.
- **The deck turns over.** A dish cooked within `cooldown_jours` (from
  `historique.yaml`, which in the real app is the cooking log) leaves the paquet
  and is not dealt. Without this the hand converges on the same favourites,
  which is exactly what "un deck qui varie" is meant to prevent.
- **`[r]` redeals.** The hand is deterministic for a given (day, redeal count)
  so it does not reshuffle under you on every keystroke. Whether unlimited
  redealing quietly destroys the point — turning a hand back into a list you
  scroll — is the open question; a mulligan budget is the obvious lever if it
  does.

### Ranking by what the week still needs (`equilibre`, the default)

The first cut ranked candidates by cheapest marginal shopping list. The user
corrected the objective: *dishes that complete the intake correctly while
varying the pleasures, and that respect the chains if there are any.* That is a
different thing, and the shopping list is now a tiebreaker rather than the goal.

Each dish carries an `apports` block — `proteine`, `feculent`, `legumes`
(families), plus `profil` and `origine` for the *pleasures* axis. `couverture()`
reports what the week has and lacks; `_score()` ranks each candidate on what it
would fill, with the reasons printed under it (« apporte legumineuse, qui
manque · légumes nouveaux : racine, allium »). Targets and weights are data, in
`equilibre.yaml`.

**This is categorical coverage, not nutrition**, and `equilibre.yaml` says so at
the top: the frequency targets are unsourced prototype guesses. Real intake
needs ANSES **Ciqual** (Licence Ouverte, so compatible with the project's
content policy) and PNNS frequency guidance as the source of the targets.

### What driving it has already shown

- **Entering a repertoire, not a recipe, is the unlock.** The catalogue was
  stuck at six because every dish demanded steps, plan B, kid tasks and a baby
  set-aside before it could exist. But planning and shopping need only title,
  time, ingredients and apports — so `recipes/_repertoire.yaml` takes dishes in
  bulk at **plan level**, and the catalogue went to 21 in one sitting.
  `compile.py` refuses such a dish politely and says what is missing. Splitting
  *enter it* from *complete it* is the finding; the bulk file is just where it
  landed.
- **Chaining and balance pulled in opposite directions — resolved: caps are
  about the shopping trip, not the plate.** Placing the bolognese sauce used up
  a `viande-rouge` cap of one a week, so the dishes that consumed it sank to the
  bottom: the planner was refusing a portion already bought, cooked and frozen,
  which is just waste. A dish built on an `accepts` edge is now exempt from
  protein caps (it still counts toward the minimums — you did eat it). The same
  two dishes now lead the hand at +11.2 and +10.8, and say why: *« viande-rouge
  déjà pris cette semaine, mais celle-ci est déjà payée »*.
- **"Varying the pleasures" is about format, not nationality — settled.** The
  first cut capped `origine`, which in a household that mostly cooks French
  penalised nearly everything and floated exotic outliers up for no reason.
  The axis is now `profil` (mijoté / four / poêlé / soupe / cru / rapide), with
  a heavier weight. `origine` stays in the data and scores nothing.
- **The freezer is an output, not a bin.** The fridge is a countdown; the
  freezer is a *planned* output — a jarred or frozen portion is the emergency
  card you play on a night with no time. `portions_congelees()` counts what the
  week banks against the drawer budget (#29's binding constraint), and a card
  that pulls a portion back out is marked `❄` and scored for it.
- **Ordering matters even when the set is forced**, because of chaining. Place
  the burgers before the lentils and the offer says so, and names the fix.
- **`[p]` fills the week with the top-ranked dish everywhere.** It is in here to
  test the actual complaint: is the wanted interaction *choose from empty*, or
  *correct a proposal*? Those are different apps.

The repertoire in `_repertoire.yaml` is **an amorce to be corrected** — the
dishes #29 names (bolognaise, fajitas, gnocchis) plus plausible staples, with
invented quantities. It is scaffolding for testing the ranking, not a record of
how this household actually eats.

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
