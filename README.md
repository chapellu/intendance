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

### Books the household owns (`sources/`)

`sources/chioca-cuisine-bio-quotidien.yaml` indexes Marie Chioca's *La cuisine
bio du quotidien* (Terre vivante) — the 100 recipes as **season, title, page**,
plus the author's two worked example days. It lives outside `recipes/` on
purpose: `charger_recettes()` globs `recipes/*.yaml` only, so nothing in
`sources/` reaches the catalogue until somebody opens the page and encodes the
dish (marked back with `catalogue_id:`). Today the file is entirely a backlog.

Two reasons it is worth having as data rather than as a book on a shelf:

- **It is the seasonality table the model does not have.** No recipe carries a
  `saison` field and `_score()` has no way to refuse a tian-ratatouille in
  February. The book is organised by season, so its four page ranges type 100
  dishes by season for free — and by name-matching, some of the catalogue's own.
- **The author's example days independently reproduce `creneaux.yaml`.** Her
  balanced days are indexed by *slot* (petit déjeuner / déjeuner / goûter /
  dîner), not by dinner; breakfast and goûter carry no recipe, which is exactly
  `nature: routine`. Two coded mechanics also appear in her prose in plain
  words: the baby's portion taken out before salting (`seasoning_gate` +
  `baby_portion`), and the part set aside that becomes the absent adult's
  lunchbox the next day (`emits` → `accepts`).

Licensing, per map #26: a table of contents is factual reference data. No prose,
no photo and no recipe from the book is reproduced. Encoding one follows
`burgers-de-lentilles` — dish and process are unprotectable savoir-faire,
wording redone, `source:` filled in.

#### The spring section and the start of summer, and what they broke

Pages 26–76 are now in `recipes/` — **the whole spring chapter bar five pages**
(42, 45, 46, 49, 50) plus the opening of summer, so 24 of the book's 100. The
catalogue goes from 22 to 46, and the part that matters, from **2 fully-cooked
authored recipes to 30**. Both
originals were written by me to fit the schema. These nineteen were not, and
that is what makes them worth having: several assumptions failed immediately.

- **`seasoning_gate` assumes salt is a last step. Real recipes salt early.** The
  compiler injects the baby's unsalted set-aside *before* the step flagged
  `seasoning_gate`, which works perfectly for `ratatouille-minute` and
  `lentilles-mijotees` — because I wrote both to salt at the end. Of the five
  Chioca recipes, **three cannot have a baby portion at all**: the velouté salts
  the cooking water at minute one, the omelette salts three separate times
  starting with the raw vegetables, and the cookies have fleur de sel in the
  dough. Only the farçous salt the batter after blending. This is not a bug to
  fix in those recipes — it is the model's assumption being wrong. A real
  household with a baby either cooks unsalted and salts at the plate, or accepts
  that most dishes have no set-aside. The app has to say which, and today it
  silently offers no set-aside and no explanation.
- **A `seasoning_gate` step must not also *create* the thing being set aside.**
  The quiche's set-aside first rendered *before* the step that mixed the filling
  — the baby's portion was taken from a mixture that did not exist yet. Fixed by
  splitting mix and salt into two steps, but nothing in the model prevents
  re-making the mistake; the gate is a marker with no dependency on what the
  step produces.
- **`keeps` cannot express a cupboard.** Salted cookies keep three weeks in a
  tin at room temperature. `keeps` knows `frigo_days` and `congelo` and nothing
  else, so they are encoded as `frigo_days: 7` — wrong, and wrong in the
  direction that makes the planner under-use them. Ambient storage is a third
  location the stock model does not have, which also affects every jar
  `conservation.yaml` talks about.

Two smaller ones worth recording. The aisle merge earned its keep on contact:
three of the five want grated hard cheese and three want wholemeal flour, and
`rayons.yaml` collapses them into one 400 g line and one 750 g line instead of
six. And `orties` exposed a missing aisle — nettles are *foraged*, not bought,
and a project with a garden has nowhere to put an ingredient whose supply is
"go outside", so it sits under `primeur` with a comment. Three of the ten now
depend on foraging, so that gap is not an edge case.

#### The waste edge, and the correction it forced

`veloute-ortie` shipped with a note saying its `fanes` chain was left unencoded
because a dangling `accepts` would cost `chaine_manquante` (−8) every draw.
**That was wrong**, and reading `calculer()` for the next recipe showed why: an
uncovered `accepts` falls through to `sans_reste` and is only penalised when
there is no `sans_reste` at all. The −8 punishes the impossible, not the
unchained. An edge with a full price is always safe to declare.

So p. 35's *Consommé de fanes* — which the book itself badges "avec des restes"
— now closes the loop, and it is a kind of edge the graph did not have:

```
Jeudi    Velouté d'ortie    (→ veloute-vert, parures-legumes)
Vendredi Consommé de fanes  (part d'un reste · → bouillon-maison)
  ↪ rien à acheter pour cette base
```

Peeling 400 g of potatoes *emits* `parures-legumes`; the consommé accepts them
and emits `bouillon-maison`. Every previous chain moved food forward — a sauce,
cooked lentils, a carcass. **This one moves a waste product forward**, and the
carrot, leek and celery its `sans_reste` would otherwise buy simply vanish from
the shopping list. It is also the first dish whose main input has no quantity at
all: the author refuses to give one on purpose, because you use what the week
happened to produce. The model cannot say "an undetermined free amount", so it
says `1-repas` and carries a comment instead of an honest number.

#### The author writes her own chains — and a `role:` field is now the blocker

Two more findings from pages 51–58, and they point in opposite directions.

**The good one.** p. 55's roast is badged "2 en 1" and its text sends you to the
next page for the broth; p. 56's ingredient list literally opens with *the
cooking broth from the previous recipe*. So `roti-bouillon-herbes` emits
`bouillon-herbes` and `soupe-orge-petits-pois` accepts it — the first chaining
edge in the catalogue **we did not infer**. It is printed in the book. p. 61
does it again ("mousse au chocolat still warm from the previous page"), and
p. 59 offers aquafaba — the drained liquid from a tin of chickpeas — as a full
equal of egg whites, which turns p. 36's salad into its supplier. Three links
now run end to end:

```
Salade de pois chiches  →(aquafaba)→  Mousse au chocolat  →  Gâteau sans cuisson
  ↪ ni œufs ni base achetés pour les deux desserts
```

That is worth noting for the eventual entry UI: a cookbook already contains its
own `emits`/`accepts` graph in prose, and the useful question when entering a
recipe is not "what are the ingredients" but **"what does this leave behind"**.
Two of the four edges found so far are byproducts — peelings, chickpea water —
which no ingredient list would ever have surfaced.

**The one that looked like a blocker and wasn't.** p. 58 is the first dessert,
and it does not fit the *meal* assumption: `portions_eq` counts adult
meal-shares, `apports` measures what a dish brings to dinner. Encoded naively a
tart gets dealt as a main course and its `apports` (no protein, no vegetable)
drags the week's coverage down. I wrote here that fixing it needed a new `role:`
field and a change to `semaine_model.py`. **That was wrong — the lever already
exists.** `convient()` reads a per-recipe `creneaux:` list, and `equilibre_sur`
already limits balance measurement to lunch and dinner. So:

```yaml
creneaux: [gouter]
```

is enough: the dish is never offered at a `choisi` slot, and `couverture()`
never counts it. Better still, goûter is `nature: routine`, so it is planned and
shopped for but never dealt as a card — which is exactly right for a dessert.
The five desserts entered so far (p. 58, 59, 61, 62, 64) all carry it, and they
incidentally fill the empty goûter slot this README complained about earlier.

Two dessert-specific limits that are *not* solved, and are noted in the files:

- **`accepts` has no "immediately" scale.** p. 61's cake wants the p. 59 mousse
  *still warm*, before it sets. `_stock_has()` checks a freshness window in
  **days**, so yesterday's mousse in the fridge passes the test and ruins the
  recipe. Alongside `frigo_days` and `congelo` there needs to be a third thing:
  chain now, or not at all. The same entry also needs *double* the base recipe,
  which `accepts` cannot say either.
- **The freezer counter conflates storage with security.** `bilan_congelo()`
  totals every `congelo: true` output as an emergency portion — a meal for the
  night everything collapses. Six pots of ice cream are not that, yet they
  occupy one of the household's three drawers. "What is in the freezer" and
  "what I can count on to eat" are different quantities.

Third recurrence of a smaller one: the book's "prep + cooking" header keeps
hiding *waiting*. Chickpeas soak overnight (p. 36), barley soaks 12 h (p. 56),
the fish thaws two hours (p. 51), the tart pastry rests an hour (p. 58), and the
roast is cooked the day before it is eaten (p. 55). The model counts kitchen
minutes and has no way to say "and then wait until tomorrow", so all five
recipes under-report what they actually cost to schedule.

#### Summer opens with a bug in `plan.py`, quantified

Pages 70–76 add five more. Two things came out of them.

**A recipe entered at plan level, then completed — and the round trip is the
finding.** The samoussas' folding steps were on a page that had not been
photographed, so the dish went in **without `steps:`**: plannable, shoppable,
and politely refused by `compile.py`. When p. 78 arrived it was promoted to a
full recipe, and the second page corrected two things the ingredient list alone
had got wrong:

- **The yield was out by a factor of two.** "24 feuilles de brick" reads like
  24 samoussas. Each sheet is cut in half, so the quantities make **48, sixteen
  of each filling** — stated plainly on p. 78, invisible on p. 76.
- **There is no single stuffing.** The roasted vegetables become *three*
  separate fillings, blended one after another. p. 76 promised "trois garnitures
  différentes" without saying what they were.

That is the honest argument for the two-tier entry: a plan-level record is not a
lesser recipe, it is a *correct* one that knows what it doesn't know. Had the
first pass guessed at the missing steps, both errors would have been baked in
and looked authoritative.

It also produced the clearest example yet of the compiler earning its keep.
Chioca's header says ~90 minutes; the step breakdown says 112; compiled against
this household it says **121**, because the three blendings fall back to the
small immersion-blender bowl and it has to be washed between fillings. The gap
is not an error in the book — it is the price of not owning a food processor,
which is exactly what compiling a recipe against a real kitchen is for.

**The `plan.py` / `semaine_model.py` split now costs real money.** The panzanella
is built on stale bread, so its `sans_reste` buys a 400 g sourdough loaf when
there is none. `semaine_model.calculer()` gets this right — it reports
`plein_tarif` and puts 250 g of bread in the basket. **`plan.py` silently omits
it**: no bread anywhere in the list. This README already flagged the duplication
as known; what is new is the size of it. Seven of the 24 recipes entered so far
carry a `sans_reste` — consommé, salade de pois chiches, croc'kasha, soupe
d'orge, mousse, gâteau, panzanella — so `plan.py` now under-reports the
shopping list for **nearly a third of the catalogue**, always in the direction
of "you get to the shop and the thing is not on your list".

Two smaller notes, both recorded in the recipe files. p. 73 sends you to p. 58
for its pastry, and p. 36 sent you to p. 18 for cooking chickpeas: a **shared
sub-recipe** is a third kind of link, neither ingredient nor leftover, and the
model has no way to say it. And p. 70 is the first *drink*, containing rum —
mostly cooked off, per the author, but "mostly" is not "entirely" and the model
has no field for an allergen, an alcohol or an age restriction. `exclusions` in
`household.yaml` only knows tastes (piquant, Brussels sprouts). With a 12-month
old in the house that gap is worth naming.

#### The blog: 255 recipes indexed, and why only four of them got entered

There is no ebook of the Chioca book — Terre vivante sells print only — so the
scanning would have run to 100 photographs. Her blog, *Saines Gourmandises*, is
the same author publishing freely, and it is machine-readable. `sources/`
now carries the scrapers (`extraire_blog.py`, `blog_vers_yaml.py`) and their
output: **255 recipes out of 399 articles**, with title, URL, yield, times and
ingredient list.

**What the pass reveals is a difference in kind between a book and a blog.**
The book is a rigid template, so extraction is near-perfect. The blog is fifteen
years of a person writing, and three things degrade:

- **Titles are headlines, not dish names.** "Mais elles ne sont plus là !",
  "Bon, et cette tarte au citron on en parle enfin ?". 79 of the 255 entries
  carry `titre_a_revoir: true` — naming those dishes needs a human opening the
  page. A book names its dishes; a blog tells you about them.
- **Structure drifted across two WordPress generations** — recent posts use
  Gutenberg `<ul>` blocks, older ones hand-coloured `<p>` lines split by `<br>`.
  Parsing by CSS selector needed two extractors; flattening to *lines of text*
  and classifying by shape handles both. The rule that made it work is that an
  ingredient line is recognised by **the absence of an opening verb**, not by
  being short — some ingredients are long and some instructions are two words.
- **Only 123 of 255 state a yield at all**, so half the corpus cannot be scaled
  to a household without a human deciding what "pour 4" would have meant.

And one thing does not degrade at all: **`apports` cannot be derived by any
means**. Protein source, starch, vegetable families, format — that is judgment,
and automating it would commit at scale precisely the sin `_repertoire.yaml`
already confesses to.

So the 255 land in `sources/`, not in `recipes/` — same rule as the book index,
enforced the same way (`charger_recettes()` only globs `recipes/*.yaml`). Four
were then entered by hand, chosen for the hole in the catalogue rather than for
convenience: **two autumn and two winter main courses**, the two seasons that
had nothing. `chiffonnade-chou-frise-cantal` is the catalogue's only raw winter
dish, which matters because `equilibre.yaml` penalises repeating a `profil` and
winter had only soups and oven dishes to offer.

**Licensing, and why the index stores no steps.** Her ingredient lists are
functional data — quantities — of the same kind already encoded from the book.
Her *steps are her prose*, and every recipe in this catalogue has had them
re-worded at encoding time, never copied. Storing 255 verbatim step-sets in a
git repository would be republishing the blog. The index therefore stops at the
ingredients and keeps a `url`; the steps are re-worded when an entry is
promoted, exactly as they are for the book.

#### A validator, because I made the same mistake three times

`verifier.py` exists because entering ten recipes produced the *same* silent
error three times — a `seasoning_gate` on a step that both builds and salts the
mixture, so the baby's set-aside renders before the mixture exists. Nothing
crashed; `compile.py` printed a plausible wrong plan each time. It also caught a
class I would not have found by reading output at all: `plan_b`'s `drop:` takes a
bare step id while `swap:` takes a mapping, and writing `drop: {step: …}` fails
silently — the str/dict comparison never matches, so the plan B simply never
applies. Four of my recipes had it.

```bash
python3 verifier.py                # whole catalogue
python3 verifier.py <id> ...       # just what you entered
```

Errors are things that will crash or misrender; warnings are things that have
been wrong every time so far but that a recipe could legitimately do. The
catalogue is now at **0 errors, 0 warnings**.

#### The check that was wrong four times out of five

Getting the warnings to zero was not a matter of obeying them. The
`seasoning_gate` check asked *is this step short enough to be only salting?* —
on the grounds that a gate on a long step is probably a gate on the step that
builds the mixture. Read one by one, **four of its five hits were on correct
recipes**: the burgers set the baby's share aside from the cooked lentils (an
*ingredient*, present from minute zero), the gratin from the pasta and the sauce
(two *earlier* steps), the velouté from the blended soup, the omelette from the
softened courgettes. In every case the thing being set aside already existed.

A check that is wrong 80% of the time is worse than no check, because it teaches
you to skim past it — which is exactly how the original bug survived three
recipes. So the question was rewritten. Not *is this step short*, but **does
what we set aside exist yet**, which `baby_portion.depuis:` answers in data:

```yaml
baby_portion:
  take: "quelques pâtes et 2 c. à s. de sauce tomate, avant salage et sans fromage"
  depuis: [sauce, pates]     # the steps it is drawn from — both precede the gate
```

`depuis: []` means *drawn from an ingredient*, available from the start. Every id
in `depuis` must come strictly before the gate; if it does not, the set-aside
would be rendered before the thing to set aside exists — the historical bug,
now an **error** rather than a hunch, because it is provable from the structure.

Where `depuis:` is absent the old heuristic still runs, so nothing got quieter by
being loosened. 18 recipes are still in that state; the validator prints the
count as one line rather than 18 warnings, because it is a debt to work through,
not a finding to act on.

The fifth warning was real, and of a kind the heuristic found only by accident:
`omelette-courgettes` carried salt and pepper in its ingredients and mentioned
them in **no step at all**. The gate sat on a step that did not season, so
« prélever avant salage » described a salting that never happened. The step now
salts.

#### The one dish that planned and would not cook

Getting to zero meant repairing what the validator found and this README used to
list as *left alone*: `reste-de-la-veille`, a dish that planned perfectly and
**crashed the compiler outright** (`KeyError: 'type'`). Three causes, one shape:

- its `accepts` matches by `kind:` (any `reste-plat`) with no `type:`;
- its steps used `text:` with no `id:`, which no other recipe does;
- its baby set-aside was a *sentence inside a step* rather than the
  `seasoning_gate` + `baby_portion` data every other recipe uses — so it printed
  for every household, baby or not, and cost zero minutes.

The first is the real one, and it was worse than recorded here. The matcher that
understands `kind:` was written once, in `semaine_model.py`, and **both** other
readers — `compile.py:123` *and* `plan.py:76` — indexed `acc["type"]` by hand.
Two of the three code paths crashed, not one. `accepte()` / `libelle_accepts()`
now live in `compile.py`, the module `plan.py` and `verifier.py` already import
as `rc`, and `semaine_model.py` aliases them.

The lesson is not "put it in a shared module". It is that **a schema written
once and read three times is not a schema, it is three schemas**, and nothing
told us until a recipe used a field the majority reader had never parsed. The
validator is what turned that from a crash into a line of output; the fix is
what made the crash impossible. What still lacks a guard: `accepts` is now
matched in one place, but `scale_qty`/`_echelle` and `household_portions`/
`_portions_foyer` are still each written twice, and nothing checks they agree.

One thing the repair could not fix, and it is honest to say so in the data: the
baby's portion of a reheated leftover is *taken from a dish that was already
salted yesterday*. Prélever avant de saler only avoids today's salt. The real
gesture — setting the baby's share aside when the dish is first cooked — is an
output the model cannot carry yet, because `emits` has no notion of a baby
portion. The recipe says so in a comment rather than pretending.

#### The chain was a token, not a quantity

Asked whether portions were properly wired into the chaining, the honest answer
was no, and a three-dish week proves it. One 2-repas jar of bolognese covered
**both** Tuesday's pasta (500 g) and Wednesday's lasagne (700 g) — 1200 g claimed
against one jar — while the sauce actually cooked on Monday was consumed by
nobody. `stock_has()` found an output and never removed it, so an output was a
*token*: present or absent, infinitely divisible, never spent. The `qty:` written
on every `accepts` since #30 was read by **zero lines of code**.

What was missing was not a check but a **magnitude**. `chainage.py` now owns the
whole chaining vocabulary — matcher, stock, sizing — and `Stock.prelever()`
*takes* what a dish needs, across several jars if it must:

```
↪ Pâtes à la bolognaise part de 500 g du congélo
↪ Lasagnes part de 200 g du congélo + 500 g du lot « Sauce bolognaise »
```

Three things fell out of making the quantity real, and only the first was the
bug being chased:

- double-counting became impossible — you take, so it goes down;
- *"there is 100 g short"* became sayable, where before an edge was covered or
  not, with nothing in between. The partial cover turns out to be the common
  case, and it was the one the model could not express at all;
- and the week became **sizeable**. If Thursday wants a base Tuesday makes,
  Tuesday can be cooked bigger *on purpose*:

```
⤴ Lentilles vertes mijotées aux carottes : en faire 2× (+400 g de
  lentilles-vertes-cuites) et lundi (Salade de lentilles à la feta) ne coûte
  plus rien, 20 min gagnées.
```

That is an **offer, never an automatic resize**. Cooking bigger commits a bowl, a
freezer drawer and money — three things the model cannot arbitrate for the cook.
The planner's job is to notice, price it, and say what it buys you.

And to know what the kitchen can physically take, which is the other half of the
same idea and arrived from the AE2 comparison (`MECANIQUES.md` §25): a crafting
CPU has a storage budget, and a job that exceeds it does not run however many
ingredients are in the network. Equipment therefore declares `contenance` in
portions, the freezer has a ceiling as well as a floor, and an offer that breaks
either says which one:

```
⤴ Poulet rôti : en faire 3 lots entiers (+700 g de poulet-cuit) … — un lot ne se
  coupe pas, donc 1.2 portion(s) de plus à ranger ; ⚠ le congélo n'a que 0 place(s)
```

Only the *rounding surplus* is charged to storage — what the downstream dish eats
is not stored — so a divisible lot puts nothing away. Storage pressure is a side
effect of granularity, which is why the two rules had to arrive together.

#### Two ceilings per space: the shelf and the box

Storage is bounded twice, and the model says which bound is biting, because the
two call for opposite gestures — clear a shelf, or wash up. `household.contenants`
is a **pool** (boxes, jars, freezer bags: a count, a capacity in portions, and the
spaces each may go in), and `frigo` / `placard` finally have capacities alongside
the freezer:

```
FRIGO    2 +1 −0 = 3 / 10 places · 7 libre(s)
CONGELO  0 +6 −0 = 6 / 5 (limité par les contenants, pas par la place :
                          18 d'étagère) · ⚠ DÉBORDE
```

The `−` term matters: eating from stock **returns** a container to the pool. In a
real kitchen the binding constraint is almost never *the freezer is full* — it is
*the six boxes are in the fridge with Tuesday's ratatouille in them*.

One consequence nobody wrote a rule for: remove `sterilisation-bain-marie` from
the household and the cupboard drops from 24 storable places to **zero**. Jars
stop being cupboard cells and revert to fridge containers, which is physically
correct — it is `conservation.yaml`'s botulism warning reappearing as arithmetic.

Two messages had to be rewritten once quantity was real, because both had been
true only by accident. *« part d'un reste déjà au frigo (700 g) »* attributed a
multi-jar draw to the first jar; and *« que rien ne produit avant ce jour-là »*
was printed when the week produced plenty and had merely eaten it all — which
sends you to move a dish when the fix is to cook more of it.

#### Where each line comes from, decided once

"Where does this ingredient come from" already existed, scattered across three
unrelated encodings: `rayons.placard` (a global static list — salt is *always*
cupboard), `ing.from_accepts` (a per-line boolean), and `stock.location`
(household state, reserved for chaining outputs). Nothing joined them, so each
reader re-decided in its own corner — `plan.py` and `semaine_model.py` each wrote
their own two tests, and `compile.py` wrote none at all and printed every
ingredient identically.

`chainage.provenance()` is now the single decision, and the cooking view is where
it pays:

```
400 g — lentilles vertes cuites  (déjà au frigo)
200 g — tofu fumé  (à acheter)
4 c. à s. — huile d'olive  (placard)
```

The fifth case is the one that had no name and caused a real regression while
this was being wired. An uncovered `from_accepts` line is **not** `à acheter`:
labelling it so put *« 250 g de lentilles vertes cuites »* on the shopping list,
and cooked lentils are not sold anywhere. It is `ABSENT` — *à cuisiner d'avance* —
and `sans_reste` is what says which raw goods to buy instead. The bug is worth
recording because it is the argument for the whole refactor in miniature: three
scattered tests all happened to skip that line by accident; one honest decision
had to name why.

The week now reports what it costs in origin, not just in euros:

```
D'OÙ VIENT LA SEMAINE — 41 lignes d'ingrédients
  23 à acheter · 17 placard · 1 déjà cuisiné cette semaine
```

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
- **`accepts` / `emits`** (from #30): typed chaining outputs, measured on **two
  scales that do not compete**. `qty: {amount, unit}` sizes a *base* — 700 g of
  sauce, 1500 ml of broth, 1 carcass — and is what makes "is there enough" a
  question with an answer. `qty_band` (« 2-repas », « lunchbox ») counts *meals*,
  which is the right unit for a leftover dish and for the freezer budget.
  `accepts` draws on the stock through `chainage.Stock.prelever`, which
  **depletes**; missing → prelude pointing at `fallback_recipe`. `emits` renders
  as a "consigner dans le stock" footer — the cooking event *is* the stock event.
- **`seasoning_gate` + `baby_portion`**: one boolean on a step; the compiler
  injects the unsalted set-aside *before* it whenever an eater has `diet: baby`.
  `baby_portion.depuis:` names the steps the share is drawn from (`[]` = from an
  ingredient), which is what makes the gate's placement checkable rather than
  guessable.
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
- Over-production is costed in ingredients, vessel space and freezer places, but
  **not in minutes**: cooking 2× takes somewhat longer than 1× and the offer does
  not say so.
- Consumable containers (freezer bags) count as pool places but are never
  *used up* — the prototype has no persistence, so nothing carries across weeks.
- Nothing decides *which* container a given output goes into, only whether the
  pool has room. A 2-portion jar used for a 1-portion leftover wastes half a
  place and the model does not see it.
- `contenance` is one number per vessel, in portions. A batch that fits by volume
  can still be wrong by *shape* (a gratin spread too thin, a sauté pan too
  crowded to brown), and nothing represents that.
- **Recursive resolution.** Chaining looks exactly one level back, and only among
  dishes already in the week; `fallback_recipe:` is a hand-written pointer at the
  sub-recipe. AE2's autocrafting resolves the whole tree and finds the pattern
  itself — see `MECANIQUES.md` §25 for what that would change, and for the
  design question it opens (propose the missing sub-dish, or insert it?).
- **Which recipes are atomic** is declared one at a time (`lot_entier:`) and only
  two carry it so far. Nothing flags a recipe built on a whole chicken, a mould
  or a jar that has not been marked.
- The full-batch-vs-scale decision is a single rule here (keep full batch when
  emits keep well); the real planner should weigh freezer-drawer budget (#30).
