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

### Chaining is a discount, not a gate (7 Wonders)

See [MECANIQUES.md](MECANIQUES.md) for the full survey of game mechanics against
this domain — what maps, what is next, and what is rejected on purpose. It runs
in two waves: card games first, then everything else (colony sims, factory
builders, farming games), which turned out to be the richer half. Three findings
were clear enough to build immediately — this one, plus the two below.

In 7 Wonders a chain symbol lets you build a card **for free** if you built its
predecessor; you could always have built it anyway by paying. This prototype had
it backwards: `accepts: {required: true}` made a derived dish *impossible*
without its base, so the offer showed a hard error. But you can obviously make
pasta bolognese without last night's sauce — you buy mince and spend 45 more
minutes. That is a price, in the two currencies the app already speaks.

Recipes therefore carry `sans_reste` — what to buy, and how much longer it takes,
when the base is missing. The same dish now shows two prices depending on the
week around it: *Petits burgers* costs 30 min and +1 article the day after the
lentils are simmered, and 65 min and +3 articles on its own. Hard errors are gone
from the offer, and the *value* of cooking a souche becomes legible, because it
is exactly the discount it unlocks later.

`required: true` now means "no `sans_reste` exists" — genuinely impossible
without the base — rather than "blocked".

**Known duplication:** `plan.py` still carries its own copy of the basket
aggregation and does not know about `sans_reste`, so it would still report a hard
error on an unchained week. The two must collapse into `semaine_model.py`; it has
not happened yet because `plan.py` is the path that has actually been used for
shopping.

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

### Three meals a day, not one (`creneaux.yaml`)

The prototype handled **one dish per day** — the dinner — while quoting « 21 meal
slots » from #29 in its own docs. #29 is explicit and says the opposite:

> 100% remote + parental leave → **all three meals planned, ~21 meal slots/week**.
> Coworking days need **lunchbox** outputs. Weekends nomadic → the batch slot is a
> weekday (both adults home at midday); kids session likewise a weekday **goûter**.

So `choix` is no longer indexed by day. It is indexed by **slot** — a `Creneau`
of `(jour, repas)` — expanded from `creneaux.yaml`. Seven days now yield 22 slots
(21 + the Wednesday goûter). Slots are kept chronological, and that ordering is
load-bearing: lunch on day 3 is reduced *before* dinner on day 3, so it can only
ever see what day 2 left behind.

Meals are **not symmetric**. Breakfast and goûter are `nature: routine` — counted
in the shopping list and the balance view, never dealt as a hand. Nobody wants to
draw a card at 7 a.m., and #29 asks for breakfasts « with a weekly intake-balance
view », not a daily choice.

**What this unlocked, and it is the real point.** Nine dishes in the repertoire
emit a `reste-plat` — chili, gratin, lasagnes, quiche, ratatouille, velouté,
burgers, curry — and **not one of them had a consumer**. Every leftover portion
was emitted into the void, because there was no meal to put it in. The chains that
worked were all `base` chains (a sauce, cooked lentils, a carcass); « a portion of
the finished dish » had nowhere to go.

Lunch creates the outlet. Rather than write nine near-identical reheat recipes,
`accepts` now matches either an exact `type:` or a whole **`kind:`** class, so one
card — `reste-de-la-veille` — eats any leftover dish. Same indirection as
capability/tool, applied to leftovers:

```
AVANT tout dîner  → Reste réchauffé   score=-8.0   manque: un reste-plat
APRÈS le gratin   → Reste réchauffé   score=+4.0   +0 article   ↪ gratin-de-pates-tomates
```

Coworking lunches carry `emporte` and a dish that travels badly is scored down,
never forbidden — the same 7 Wonders rule as chaining: a price, not a gate.

Balance targets are measured on `equilibre_sur: [dejeuner, diner]` only. The
protein caps were posed by eye against six dinners; spreading them over 21 slots
would have silently halved them without anyone deciding to.

**Left undone, deliberately:** the visual prototype (`proto.chapellu.fr`) still
shows the old one-dish-per-day model — `semaine.js` has not been ported to slots.
And the catalogue contains **no breakfast and no goûter item**, so those slots are
correctly marked routine but have nothing behind them yet. Both are data/porting
gaps, not model gaps.

### The curse card: the leftover with a clock (`[!]` / `[d]`)

Borrowed from Slay the Spire, where a curse is a card forced into your hand that
you did not choose. The fridge has exactly one, and it used to be a grey line
under the week that was easy to scroll past. It is now dealt **above** the hand,
with its deadline printed on it and two exits: `[!]` cooks it — placing the best
dish that eats it on the earliest day that still catches it — or `[d]` throws it
away.

The discard is the point. It is recorded, the item stops being available, and
everything downstream reprices: cook the doomed lentils and the burgers cost 30
min and 2 articles; discard them and the same dish costs 65 min and 3, because it
now pays full `sans_reste` price. Waste stops being free and silent.

The very first frame it rendered said *périmé depuis 2 j — plus aucun plat ne
peut le rattraper*, offering only `[d]`. That is the old passive line's failure
mode stated out loud, and it is itself a finding.

### The freezer as a level with a floor (RimWorld's standing bill)

RimWorld does not ask you to queue meals; you set a bill — *cook until you have
20* — and it re-triggers when stock drops through the threshold. Not everything
in a kitchen is a choice: what to eat Tuesday is, but *whether there are portions
behind you if Tuesday collapses* is a level, and levels want a floor.

So the freezer line now moves across the week — `2 −1 +3 = 4 portions d'urgence`
— against `congelateur.plancher` in `equilibre.yaml`. Below the floor, `_score`
rewards any dish that banks portions and the card says so. This replaced a
counter that only ever measured what the week *added*, so a week that emptied the
freezer looked identical to one that never opened it.

### Conservation as a transformation, not a property (`[c]`)

The user's framing: *jarring is also a skill and equipment that can be worked;
sous-vide is easy today; same logic as Don't Starve — I transform food to
increase its keeping.* That breaks the old model, correctly.

`keeps: {frigo_days: 3, congelo: true}` treated shelf life as a property of the
**dish**. It is not. It is a property of the **dish × the method you own and
know**. So `conservation.yaml` holds the methods as data, each requiring a
*capability* rather than a tool — the same indirection `rules.yaml` uses for
cooking steps — and three things fall out on their own:

1. A method the household lacks is not a missing feature, it is a **locked
   skill-tree node with a kit lock**, which is exactly one of the three lock
   kinds #10 settled on. It reports what it would need and, per #29, never turns
   that into a purchase suggestion.
2. Conservation becomes an **axis of progression** with a measurable payoff in
   days, not a setting.
3. The household turned out to already own more than it thought: a 7.5 L cocotte
   immerses jars, so `sterilisation-bain-marie` is *acquired* — for acidic foods
   only.

**The safety finding, which is the important one.** Encoding this surfaced that
the user's own example is the dangerous case. *C. botulinum* grows in
**anaerobic, low-acid, ambient-temperature** conditions — which is precisely a
sealed jar of meat sauce, lentils or plain vegetables in a cupboard. A
boiling-water bath does not destroy the spores; only a **pressure** process
(>115 °C) does. Water-bath canning is safe only for acidic foods (pH ≤ 4.6).
Vacuum sealing creates the same anaerobic environment: it **extends the cold
chain, it does not replace it**. So the model defaults every dish to
`acidite: basse` — the conservative choice — and `bocal-bain-marie` refuses a
low-acid dish outright rather than quietly allowing it.

The keeping windows in `conservation.yaml` are **prototype orders of magnitude,
not sourced figures**, and the file says so. Before anyone acts on them they
need real references: ANSES/DGCCRF on the French side, and NCHFP for
per-food process times and pressures.

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
