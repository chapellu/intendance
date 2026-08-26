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
python3 compile.py soupe-orge-petits-pois            # what has to be started 12 h earlier, and when
python3 compile.py tarte-aux-fraises --repas gouter  # the slot decides the hour, so it decides the deadlines
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
python3 semaine_tui.py --today 2026-08-10 --jours 7 --maintenant 2026-08-10T18:00 \
    --agenda --placer 3:panzanella-toscana 5:roti-bouillon-herbes 6:soupe-orge-petits-pois
```

The last one is non-interactive: it places three dishes on numbered slots and
prints the agenda as of a given moment (`demo/g-agenda.txt`).

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

A slot carried a day and no **hour** until anticipation needed one — see *The
second clock* below. `heure:` per meal is what makes « la veille au soir » a
thing the model can say rather than a phrase written inside a recipe.

Meals are **not symmetric**. Breakfast and goûter are `nature: routine` — counted
in the shopping list and the balance view, never dealt as a hand. Nobody wants to
draw a card at 7 a.m., and #29 asks for breakfasts « with a weekly intake-balance
view », not a daily choice.

#### A third nature: `optionnel`, and the dessert slot it was needed for

Two natures were not enough, and the proof arrived from a real dinner rather
than from reasoning. Six desserts in the catalogue declared `creneaux: [gouter]`
because that was the only lever available — and the README above argues for it
at length, correctly, as far as it goes. Driving the visual proto on production
showed how far that is: the week holds **one** goûter, on Wednesday, and it is
`routine`, therefore never dealt. So **no gesture in the whole app could put a
dessert into a week.** Six recipes were plannable, shoppable, and unreachable.

The obvious repair is the wrong one. Adding `diner` to a dessert's `creneaux`
makes it a candidate main course, and its `apports` — no protein, no vegetable —
drag the week's coverage down, which is the exact harm `[gouter]` was chosen to
avoid. The dish is not miscategorised; **the slot was missing**.

`dessert` is therefore a meal in `creneaux.yaml`, at 20 h 15, on every day, and
its nature is neither of the two that existed:

| nature | empty slot is… | dealt a hand? | auto-filled? |
|---|---|---|---|
| `choisi` | a **gap** the week complains about | yes | yes |
| `routine` | nothing — planned and shopped, never chosen | no | no |
| `optionnel` | nothing — but selectable, and it deals | yes | no |

`optionnel` is the cell those two left empty: a slot that **exists without being
a lack**. Nobody eats a dessert every night, and a week with no dessert is not an
incomplete week — but when you do want one, you must be able to say so. Every
`ctx.nature(i) == "choisi"` test in `semaine_model.py` already did the right
thing by construction: the landing slot, `_avancer`, `remplir` and the curse
card's rescue days all skip it, while `offre()` — which asks `convient()`, not
nature — deals it normally. The change is one meal in a YAML file and one word.

Two consequences worth recording. The week goes from 22 slots to **29**, which
is 21 + goûter + 7 desserts, and none of the seven counts as a gap. And the
ordering invariant earned its keep again immediately: `dessert` is declared last
in `repas:` but sorted by `heure`, so Wednesday comes out *petit-déj, déjeuner,
goûter, dîner, dessert* — 16 h before 19 h 30 before 20 h 15. **The proto's JS
was still sorting by declaration order**, the bug this README records as fixed on
the Python side, and adding a fifth meal is what made the divergence visible.

**And it put a number on the oven.** The section on p. 115 above argues that
nothing in the model knows there is one oven; that was reasoning from the data.
With a dessert slot the model states the contradiction itself, in its own output:

```
$ compile.py tourte-nicoise-courgettes --repas diner    → commencer à 17h52
$ compile.py clafoutis-miel-abricot   --repas dessert   → commencer à 17h57
```

Five minutes apart, one oven, 180 °C against 150 °C. Before the slot existed the
clafoutis was pinned to a 16 h goûter and the two schedules never appeared to
touch, so the gap was invisible *because a dish was filed at the wrong hour*. A
missing slot was hiding a missing constraint. That is the argument for adding
slots that are honest about when food is actually eaten, ahead of any other
scheduling work: **the calendar has to be right before contention can even be
noticed**, let alone resolved.

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

The visual prototype (`proto.chapellu.fr`, `chapellu/flagship`) is fed by
`export_json.py` and carries a transcription of this model in `semaine.js`. It
has been ported to slots, and then to the four grandeurs of #30–#33: the
depleting stock with its quantities, the storage spaces and their container
pool, the over-production offers, and ingredient provenance. **Regenerating
`cuisine-data.json` is the only way to move the screen**, and any new field
added here has to be exported before it can be shown.

**The proto is now ahead of this model on three rules**, and they are rules, not
screen decoration — they belong here and have not been written here yet:

- **A skipped meal.** `SAUTE` distinguishes *we are not eating here* (nomadic
  weekends, per #29) from *not decided yet*. This model only knows the second,
  so it counts a deliberate hole as a gap in the week.
- **Portions per slot.** `household_portions()` sizes the whole week off one
  number. Guests at dinner, a lunch alone and a lunchbox to prepare are three
  different sizes, and size commands the basket and the leftovers.
- **The coworking lunchbox.** #29 asks for lunchbox outputs; this model only
  scores a badly-travelling dish down. Nobody cooks a lunchbox in the morning —
  it is taken off the previous evening's dinner, which therefore has to be
  cooked bigger. It is `offres_surproduction` commanded by the calendar instead
  of by a shortage.

**Left undone, deliberately:** the catalogue contains **no breakfast and no
goûter item**, so those slots are correctly marked routine but have nothing
behind them yet. That is a data gap, not a model gap.

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

Two dessert-specific limits, one since solved and one still open:

- **`accepts` had no "immediately" scale.** p. 61's cake wants the p. 59 mousse
  *still warm*, before it sets. `_stock_has()` checks a freshness window in
  **days**, so yesterday's mousse in the fridge passed the test and ruined the
  recipe. `delai_max_h` now says it — see *The second clock* below, which is
  where this ended up. The same entry still needs *double* the base recipe,
  which `accepts` cannot say.
- **The freezer counter conflates storage with security.** `bilan_congelo()`
  totals every `congelo: true` output as an emergency portion — a meal for the
  night everything collapses. Six pots of ice cream are not that, yet they
  occupy one of the household's three drawers. "What is in the freezer" and
  "what I can count on to eat" are different quantities. *The second clock*
  adds a third difference: a frozen portion is only playable tonight if you
  can thaw it tonight.

Third recurrence of a smaller one: the book's "prep + cooking" header keeps
hiding *waiting*. Chickpeas soak overnight (p. 36), barley soaks 12 h (p. 56),
the fish thaws two hours (p. 51), the tart pastry rests an hour (p. 58), and the
roast is cooked the day before it is eaten (p. 55). The model counts kitchen
minutes and had no way to say "and then wait until tomorrow", so all five
recipes under-reported what they actually cost to schedule. That is the finding
the section below is built on — it was recorded here three times before it was
modelled once.

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

#### p. 87, entered to be cooked tonight — the first entry driven by a real dinner

Every recipe before this one was entered to fill a hole in the catalogue. The
*Tourte niçoise aux courgettes* was entered because the household has a guest
tomorrow and a week-old glut of courgettes, which is a different pressure and
found different things.

- **A fallback chain can degrade a dish, and nothing says so.** The filling is
  cut in 1–1.5 cm cubes, and that size *is* the recipe: it is what lets the
  courgettes render their water in the pan instead of holding it. Declared
  `needs: [chop-coarse]`, the chain would have resolved onto the mini-blender
  and puréed them. Every previous use of `rules.yaml` degraded *gracefully* — a
  slower gesture, a smaller bowl, a longer time. This is the first capability
  whose fallback would have produced a **different, worse dish**, and the only
  defence available was to declare the knife in hard, with `needs: []`. A chain
  has no way to say "below this rung, do not substitute — ask".
- **The salt is not the salt.** `seasoning_gate` injects the baby's unsalted
  set-aside before the step marked with it, and `seasoning: true` marks salt and
  pepper. Here the real salt load is **100 g of parmesan**, which carries no such
  flag. A set-aside taken from the filling "before salting" would have been
  heavily salted while ticking the box. The share is therefore drawn from the
  plain sautéed courgettes upstream (`depuis: [poeler]`). The class the validator
  cannot see: *a salting ingredient that is not a seasoning*.
- **The book never says when to salt.** « Sel, poivre » is in the ingredient list
  and in no step at all — the exact hole already recorded for
  `omelette-courgettes`. Third occurrence; it is a property of how cookbooks are
  written, not an oversight, and an entry checklist should ask for it.

`lot_entier: true` earned its keep immediately: built on a mould, the tourte
cannot be cooked in fractions, and without the flag a 2.5-portion household
ordered 0.625 of it — 375 g of courgettes and 0.6 egg. It is also the reason the
guest is covered without the model knowing there is one: **portions per slot**
is still the gap this README names above, and an indivisible lot happens to
paper over it.

**And the dish is nearly unreachable on the screen, which is the finding the
real dinner produced.** It scores 1.6 (5.6 on the one slot where its vegetable
families are new), ranking 36th of 44 — correctly, since cheese-and-pastry
completes nothing the week lacks. Its category is `congelable`, so it is not one
of the three `garantir` suits and only ever enters the hand through the general
draw: measured over 300 redeals of a five-card hand, it comes up **14 times, 4.7%**
— about twenty redeals to see it once. The proto has no search, no repertoire
view, no way to say *I own this book and I am cooking page 87 tonight*. That is
a legitimate entry point the deck cannot express, and it is field evidence on
the open question this README already poses about unlimited redealing: the
problem is not that redealing turns the hand into a list, it is that **a hand
has no answer at all to a cook who has already chosen**.

#### p. 115, the dessert of the same dinner — and the oven neither dish can see

The same evening needed a dessert, and the household had ageing apricots, so
p. 115's *Clafoutis super crémeux au miel et à l'abricot* went in beside the
tourte. Entering two dishes **for one meal** rather than one dish for the
catalogue is what produced the finding that matters.

**Nothing in the model knows there is one oven.** The tourte bakes 45 min at
180 °C and finishes under the grill; the clafoutis bakes an hour at 150 °C and
must then cool. Both are `needs: [bake]`, both resolve to
`four-chaleur-tournante`, and the two facts that decide the whole evening — the
appliance is shared, and the two temperatures are incompatible — are represented
nowhere. `facteur_max_vaisselle` asks *does this batch fit in its vessel*, which
is a question about one dish against one pan. The question a meal actually poses
is *do these dishes fit in this kitchen, in this order, at these temperatures*,
and it has no owner. `plan.py` never even meets it, because it lays one dish per
day: it put the tourte on Friday and the clafoutis on Saturday when both are
Friday. The right answer here is knowable and boring — bake the clafoutis in the
afternoon, it has to cool anyway — but the model neither finds it nor warns that
it is needed. Note also that no recipe carries its oven **temperature** as data
at all; 180 °C and 150 °C exist only inside French step prose.

Three smaller ones, and the first is a repeat that has now earned a field:

- **A dish must be able to carry an age ban and its reason.** The clafoutis has
  115 g of honey, a tablespoon of rum and bitter-almond extract. Honey is
  advised against before 12 months (infant botulism: the spores survive, and a
  custard at 150 °C does not destroy them), and this household's baby is exactly
  12 months — on the line, which makes it a parent's call and not a compiler's.
  So `baby_portion` is absent, exactly as it is for p. 70's rum cocktail. **But
  absence is the only thing the model can say**, and it is indistinguishable
  from nobody having thought about it. Second occurrence of the gap p. 70
  recorded; it wants a field, not a third comment.
- **The author's variants are priced in money, and there is no axis for money.**
  « SOS porte-monnaie » offers almond purée → 40 g melted butter, almond milk →
  vanilla soy milk, honey → agave syrup. `plan_b` is denominated in minutes and
  `sans_reste` repairs a missing base; neither speaks of cost or of *what is
  already in the cupboard*. That gap points straight at this household, whose
  stated trajectory (#26) is a **smooth** transition toward organic and short
  chains — which is a sequence of price arbitrations, one substitution at a time.
- **`aliases` can merge two things that must not merge.** The tourte wants
  T80–T110 wheat or *grand* épeautre; the clafoutis wants T110 *petit* épeautre.
  Einkorn and spelt are different cereals sold side by side, so
  `farine-petit-epeautre` is a separate id. The aisle table's merging is a
  service right up to the point where it silently deletes a shopping line.

And the dessert inherits `creneaux: [gouter]` from the five before it, which is
still the only lever available and is still not what is happening: this clafoutis
is being served after Friday's dinner. `compile.py` duly schedules it against a
16 h goûter and says *commencer à 13h42*. **A dessert at dinner is a slot the
model does not have**, and six recipes now pretend to be goûters to get planned
and shopped at all.

What did work, first time and without help: the egg line. One dish wants 1 and
the other 4, and the list came out `5 pièce — œuf (2 plats)`.

#### Winter opens on four consecutive pages (p. 177–182)

The first batch entered from photographs of **full pages** rather than of the
contents index, and the first four of the book's twenty-five winter recipes:
croque-monsieur montagnards (p. 177), accras de thon au pain rassis (p. 178),
tartelettes noix-topinambours (p. 181), pot-au-feu (p. 182). 31 of 100 entered.

**The pot-au-feu is the first souche with three outputs, and the author declares
all three herself**: « Un seul plat, trois bons repas en perspective » — the meat
and vegetables at midday, the broth with small pasta or crêpe ribbons that
evening (she points at p. 192), the leftovers the next day as hachis Parmentier
(p. 199) or cold with vinaigrette. Two of the three consumers are recipes in this
same book, neither entered yet, so `bouillon-pot-au-feu` deliberately ships
without a `qty:`: a number with nothing to check it against would look like a
measurement. What three simultaneous outputs expose is that `emits` has always
been read as a pleasant consequence — the dish leaves a leftover, good. Here the
three are born in the same minute and go to the same place. The household has 10
fridge places, 8 boxes and 12 jars, and **the container pool is verified over the
week, never at the moment a dish emits**.

**The author lists the pot as the last line of the ingredients** — « … Une très
grande marmite (de type "faitout traiteur") », right after the coarse salt. No
other recipe in the catalogue declares its vessel, and the model cannot hear it.
`contenance` is denominated in adult portions, so the 7.5 L cocotte offers 12
against this dish's 6 and `facteur_max_vaisselle` says yes twice over. But 3.5 l
of water, 1.5 kg of meat and nearly 3 kg of whole vegetables do not go into 7.5 L
whatever the arithmetic of portions says. A portion of pot-au-feu is three times
the volume of a portion of stew, and the portion unit was chosen precisely so
nobody would have to convert litres into plates. First dish where that turns.

**The croque-monsieur is cooked on the author's fallback, and nothing says so.**
She writes « au gaufrier … ou sur une plaque de cuisson, 10 minutes dans un four
préchauffé à 240 °C ». This kitchen has no waffle iron and no croque press, so
only the second path exists. But there is no `gaufrier` capability, so writing
`needs: [bake]` does not *declare a fallback* — it declares the recipe. A missing
capability that `rules.yaml` knows about announces its downgrade in the compiled
output (« au petit blender, en 2–3 fois »); a capability the vocabulary never had
downgrades in silence, and the loss is not nil — pressed and gridded versus
merely toasted.

**Oven temperature, four more times, and now the converse of p. 115's finding.**
240 °C, 240 °C, 180 °C « assez bas dans le four ». p. 115 showed the model cannot
see two dishes *conflicting* over one oven; the croque and the accras want the
same 240 °C and could share it happily, and the model cannot see the *agreement*
either. Temperature is not just a conflict detector — it is what would let two
dishes be scheduled together, which is the more useful half.

**`pain-rassis` has a second consumer and still no emitter.** The accras are
badged « avec des restes » and open on 200 g of stale bread; `panzanella-toscana`
already declared the same edge. Nothing emits it, because stale bread is not the
output of a cooked dish — it is a bought ingredient that got old. The chaining
graph (#30) only knows leftovers of *dishes*. The leftover *ingredient* — Sunday's
bread, the end of a cheese, half a pot of cream — has no possible emitter, so its
edge stays at `required: false` forever and `sans_reste` buys fresh bread in
order to let it stale. What the model lacks is an inventory that **ages**.

**Salt that is not salt, three more times.** p. 87 found it once (100 g of
parmesan crossing a `seasoning_gate` unseen); this batch adds parmesan again, and
then cured ham + aged tomme + gherkins in one dish, and 80 g of demi-sel butter
in another. All four winter dishes end up with no baby portion, for three
structurally distinct reasons — salt in the pan at minute one (p. 177, p. 181),
salt in the cooking water at minute zero (p. 182, exactly the rôti p. 55), and
for the accras no reason at all, which is why they *do* get one: their gate was
written by splitting the author's single « add everything » step in two, purely
so a set-aside could exist.

**A second non-time axis, after money.** The pot-au-feu is the first recipe where
the author explicitly *forbids* a time plan B — « ne raccourcissez pas le temps
de cuisson ! » — and offers an energy one instead: « pour économiser l'énergie
(gaz ou électricité), vous pouvez en revanche faire cuire à tout petit feu ».
Same dish, same duration, different bill. `plan_b` counts minutes and nothing
else; p. 115 wanted money, p. 178 wants money again (the optional 100 g of
parmesan buys nothing back in time), p. 182 wants energy.

##### The bug this batch found in the eight recipes before it

Ingredient lines are written as YAML **flow mappings** — `{id: x, name: y, qty: 1}`
— where the comma separates fields. An unquoted `name:` containing a comma
therefore ends at that comma, and everything after it becomes a **key with no
value** that nobody reads. Nothing breaks: the recipe loads, verifies and
compiles, with an amputated name. I wrote four such lines in an afternoon, saw
`jarret de bœuf avec l'os (ou gîte` in the compiled output, and went looking.

Eight lines of the existing catalogue were already in that state, and what they
were losing was not ornament: « sans peau ni arêtes », « à température ambiante »,
« très froide ». That last one is on the coconut cream of a whipped tart — the
difference between the recipe working and not. `verifier.py` now closes the set
of legal ingredient fields and treats an unknown key as an **error**, since the
only way to get one is this mistake.

#### Half the book (52/100): summer finished, autumn's tail, winter's head

Twenty-one more pages entered in one sitting, from photographs of full pages.
Summer went 8 → 21 of 26, autumn 0 → 5, winter 4 → 7. The findings stopped being
one-offs and started being **counts**, which is the useful part.

**The first complete author-declared sub-graph.** p. 96 is a pizza dough and
nothing else; the author writes « vous trouverez pages 99 et 100 des idées de
recettes avec cette bonne pâte ». Both are entered. The catalogue has had souches
with one declared consumer (p. 55 → p. 56) and souches whose consumers are
unentered pages (p. 182 → p. 192, p. 199; p. 93 → p. 141), but never a base plus
all of its declared derivatives.

And it exposes something the model assumes without saying: **every recipe is a
meal.** Raw pizza dough is a *production*. `portions_eq: 4` counts parts of a dish
that does not exist yet, `apports` declares a protein for something nobody eats,
and `creneaux` cannot be emptied — `semaine_model.convient()` reads
`recipe.get("creneaux") or CRENEAUX_DEFAUT`, so an empty list is falsy and falls
back to lunch + dinner. The week can deal raw dough as a dinner card. This is the
same shape as the dessert problem that produced `nature: optionnel`, one notch
further out: a dish served at *no* slot.

**A chaining edge the author never wrote.** p. 159 (plain soy yoghurt) emits
`yaourt-soja`; p. 101 (fruit yoghurts) opens on « 1 yaourt au lait entier, ou de
soja ». Different seasons, no cross-reference, and the graph connects them
anyway: the autumn recipe is the starter factory, the summer one a consumer. And
p. 159 is the first recipe in the catalogue **whose output is its own input** —
seven pots get eaten, the eighth seeds the next batch. A cycle has no
`fallback_recipe`, because falling back on yourself is infinite; `sans_reste` (a
sachet of commercial ferments) is the only door *into* the loop, used once.

**The author describes the missing inventory, in her own words.** p. 90's
introduction: a small basket in the kitchen collects every uneaten piece of bread
and stale heel, it dries in the open air for a few days, and when there is enough
it goes into a recipe. Four recipes now declare `accepts: pain-rassis` with no
emitter — panzanella, p. 178, p. 172, p. 90 — because stale bread is the output
of no recipe. What is missing is not an edge, it is a **receptacle that
accumulates and ages**: no origin recipe, fed by plate scraps, whose contents
*improve* with time instead of spoiling, and which triggers a recipe when full.

**`exclusions` has never been read by any code.** `household.yaml` has declared
`piquant` and `choux de bruxelles` since #29. p. 86's risotto carries half a
teaspoon of piment d'Espelette — the first recipe to hit it — and `grep` finds
`exclusions` in exactly one place: a docstring in `compile.py` claiming to compile
"against the household (equipment, eaters, exclusions)". It has been wrong since
day one and looked fine because nothing had collided with it. p. 95 sharpens it:
there the piment is marked *optional by the author*, so the dish is compatible if
you drop one line. An exclusion should exclude a **line**, not a dish, and the
model does neither.

**The oven, four more times, and the worst case yet.** p. 99 bakes at 240 °C for
5 minutes then, without opening the door, at 150 °C for 12 — a cooking programme,
not a setting. p. 160 decides at the fifteen-minute mark whether to drop to
150 °C. p. 101 holds the oven **twelve hours at 50 °C**, two hours on and the
rest of the night off, door shut, to ferment yoghurt. p. 115 asked for a
temperature field; what the corpus actually wants is a temperature *per step*,
sometimes conditional, plus an occupancy distinct from the cooking time.

**Salt keeps not being salt, and now it arrives by inheritance.** p. 82's author
writes « ne pas saler » outright, because cured ham, olives, capers and
mozzarella already carry it — the clearest possible evidence that salt load is a
property of the *ingredient*. p. 85 shows the converse: there the salt is
*technical*, added to draw water out of 1.2 kg of courgettes, so the trick that
gave the accras a baby portion (split the seasoning into its own step) would
break the dish. And p. 100 inherits its salt through a chaining edge — the meat
that arrives is already cooked and already salted by p. 95. `emits` carries no
salt load at all.

**Counts, at half the book.** Six dishes have no baby portion for reasons of
**age** (honey p. 115, tuna p. 178 and p. 92, cocoa p. 157, rum p. 158, sugar
p. 159 and p. 101, raw yolk p. 174) and still nothing but comments to say so.
Four recipes offer the author's own arbitration in **money** (p. 115, 178, 182,
93) and three in **energy** (p. 182 « tout petit feu », p. 85 « le four ne restera
allumé que 10 minutes », p. 95 « quitte à allumer le four, autant le rentabiliser
à fond » — which makes her *double the recipe*). Five recipes give a **range** of
servings, or a serving count that depends on the role (p. 86, 88, 99, 157, 173,
104). `plan_b` counts minutes and only downwards; p. 172's VARIANTES offer the
opposite — ten minutes *more* for a better dish — and there is no word for that.

##### Three model repairs this batch forced

- **`verifier.py` rejected a baby portion that works.** The check demanded a
  `seasoning_gate`, on the theory that salting is the only reason to set aside
  early. p. 160's caramelised apples are plain — apples and oil — and the only
  fleur de sel is in the pastry two steps later. `compile.py` had already learned
  to place the set-aside from `depuis:`; the check predated the field and its
  message ("will never be injected") had become false.
- **`facteur_max_vaisselle` assumed every step holds the whole yield.** Melting
  180 g of butter in a saucepan (p. 166) got the cake rejected as too big for the
  kitchen. `charge_partielle: true` opts a step out. Three of the four uses are
  desserts, which points at the real cause: `contenance` is denominated in adult
  *meal* portions and a tart's "8 parts" are dessert parts. The flag is a
  stopgap; the repair is to stop measuring two quantities with one word.
- **Five more truncated ingredient names**, all mine, all caught by the check
  added the day before. It has now paid for itself twice over.

##### Summer's last four pages, and the first dish this kitchen cannot make

p. 107, 108, 111, 112 — summer now stands at 25 of 26, missing only p. 116.
56/100 overall.

**A capability with no fallback, and the code path nothing had ever taken.**
p. 111's waffles need a waffle iron. The croque p. 177 needed one too, but the
author supplied the oven as a second route, so the model was never asked the
question; a waffle has no second route. `rules.yaml` now declares `gaufrier` with
a single tool the household does not own, `resolve_capability` returns
`(None, None)`, and the compiled step carries **⚠ aucune solution avec
l'équipement du foyer**. That branch has existed in `compile.py` since the
beginning and no recipe had ever reached it. It is also the answer to what p. 177
said was missing: there the fallback lived in the author's prose, here it lives
in the model.

**The strongest possible case for the ageing inventory.** p. 111's header and
ingredient list each carry a number that is a *function of how stale the bread
is*: rest the batter 1 h (slightly stale) to 4 h (very hard), and use 30 cl of
milk (just stale) to 40 cl (very dry). It is no longer a question of whether
there is stale bread in the basket — it is *since when*, because the recipe's own
figures change with the answer. Fifth `pain-rassis` consumer, still no emitter.

**What you buy is not what you use, twice, both numbers given by the author.**
p. 107: buy 1.2 kg of peaches, « peser exactement 800 g de chair ». p. 112: buy
about 300 g of redcurrants to extract the 200 g of juice the recipe wants. An
ingredient line carries one quantity and two are needed, joined by a yield ratio.
Both files carry the shopping figure, since buying too little fails the recipe
and buying too much fails nobody.

**A temperature window that is not the oven's.** p. 107 must fold whipped cream
into a peach purée at about 35 °C: hotter melts the cream, colder and the agar
has already set (around 25 °C) so nothing can be folded in at all. Bounded on
both sides, measured on the *material*, and checked with a finger. The oven
findings asked for a number per step; this one asks for a range with a failure
mode at each end.

**Seasonality inside a recipe, twice.** p. 108 is indexed `saison: ete` by its
page and its own text offers the autumn version (« remplacez la courgette par du
potimarron »). p. 112 goes further — its title is *« et l'hiver, tarte au
citron ! »*, so swapping redcurrant juice for lemon changes the dish and its
name. `source.saison` is derived from the book's page ranges and can only ever
hold one.

**`keeps` cannot say that storage harms.** p. 108's author: refrigerating the
muffins makes them lose their moistness. `keeps` says how long an output survives
a space; it has no way to say a space *degrades* it, nor that there is a fourth
place — the biscuit tin — beside fridge, freezer and cupboard.

And one omission left as an omission: p. 108 never says what to do with its 130 g
of chocolate, which cannot be whisked in solid. The two previous omissions of
this kind (salt at p. 87 and p. 181) were written in here, because salting has
only one possible moment. Melting does not — bain-marie, in the milk, microwave
all give different batters — so the step stays as the book prints it, flagged.

##### Summer closes (26/26), and the household inventory turns out to be wrong

p. 116 finishes summer; p. 123, 124 and 127 open autumn from its head. 60/100.

**The unit is one of the recipe's own ingredients.** p. 116 measures in *pots* —
« 3 pots de farine », « 1 pot et demi de cassonade », « 3/4 de pot d'huile
d'olive » — where the pot is the yoghurt pot, line one of the list. That is what
makes the recipe memorable without a scale, and the model cannot follow it three
ways over: nothing links `unit: pot` to the yoghurt line, a pot weighs ~125 g of
yoghurt but ~70 g of flour, and halving the recipe halves the *number* of pots
rather than the pot. It is the only case in the corpus where the unit of measure
is household data instead of a constant.

**The bug was in the inventory, not in the check.** p. 123 browns 1.5 kg of
squash, three leeks and three onions; the 28 cm sauteuse offers 6 portions
against the recipe's 7, and `facteur_max_vaisselle` refused the dish. But the
author says *cocotte*, and the household's 7.5 L cast-iron pot declared only
`simmer-large`, `steam` and sterilising. A Dutch oven browns — that is what it is
for. Three recipes say so outright (p. 93, 123, 127), so `pan-fry` joins its
capabilities.

This is more unsettling than a wrong check. **A wrong inventory never announces
itself**: it just makes dishes impossible, and you conclude the kitchen is too
small. Note also that `rules.yaml`'s `pan-fry` chain still names the sauteuse
first, so the compiled text says "sauteuse 28 cm" even where only the cocotte's
volume makes the batch possible — the two files answer different questions (which
tool to name / what fits) and they diverge here for the first time.

**The ageing inventory, running backwards.** Five recipes want bread that has
*improved* by drying, and p. 111 makes its own quantities depend on how far that
has gone. p. 124 is the exact mirror: « évitez de les conserver trop longtemps :
plus vous les consommerez vite après les avoir ramassées, plus elles seront
saines ». Chestnuts degrade, fast. So the gap is an axis and not a special case:
an ingredient has an age, and that age makes it better or worse depending on what
it is. Nothing dates a bought ingredient, and nothing says which direction it
moves in.

p. 124 also adds a third form of *bought ≠ used*, after the peaches (1.2 kg →
800 g) and the redcurrants (300 g → 200 g): float the chestnuts and throw away
the ones that surface, in a proportion nobody knows when writing the list.

**The author states an age, and the model can only stay silent.** p. 127's
introduction: this velouté « fait l'unanimité, **de 7 mois à 77 ans** ». The
household's baby is 12 months. And the recipe puts a tablespoon of coarse salt
into the pot with the water at minute zero, so structurally there is no unsalted
moment, no `seasoning_gate` to place, and `baby_portion` stays absent — exactly
as at p. 182. The two statements do not conflict in a kitchen (a parent cooks the
same pot without salt); they conflict *in the model*, which reads only structure.

Ten dishes now carry no baby portion for reasons of age, and this is the only one
where the book asserts the opposite. It sharpens what p. 115 asked for: not just a
field for a **ban** and its reason, but one for a **permission** when the source
grants it — and the ability to notice that the permission does not match the
steps.

The corpus's second gate-free baby portion also landed here: p. 124's chestnuts
contain one ingredient, water and fire, no salt anywhere. The old `verifier.py`
would have rejected the simplest dish in the catalogue.

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

### The second clock: what has to be started the night before (`anticipation.py`)

The user's objection, and it is the last big hole in the planner: *what we are
missing is help with **anticipating** — remembering to soak the legumes the
night before.*

The model had exactly two notions of time — **minutes inside a step**, and
**which day a dish sits on** — and nothing in between. Almost everything that
ruins a dinner lives in that gap. It had also been recorded, in the data, eight
separate times, always in the same defeated register: *« le trempage n'est pas
dans ce chiffre »*, *« les 2 h de décongélation ne sont pas dedans »*, *« faute
de pouvoir exprimer une attente dans le modèle »*. Being written down eight
times is not the same as being modelled once.

**The field is not `avance: veille`. It is the waiting.** The tempting fix was
to tag the steps that happen the day before, and it is the mistake this repo
keeps repairing: a hand-placed label where a magnitude can be derived. One
honest number is enough —

```yaml
- id: tremper
  action: "Mettre l'orge à tremper dans un grand volume d'eau froide"
  time_min: 3
  attente_min: 720        # ce qui ATTEND, sans personne
  attente_raison: trempage
```

— and the rest falls out. A recipe splits into **sessions**: wherever the wait
is too long to stand around for (`COUPURE_MIN`, 90 min), you leave, and what
follows is another visit to the kitchen. *The night before* is not a field; it
is what 12 hours of waiting does to a start time. No recipe says « la veille »
anywhere any more — the four that did have had the phrase deleted, because the
model now computes it.

Four things came out of it, and only the first was the point.

- **Minutes are billed to the right meal.** The 3 min of soaking were being
  charged to tomorrow's dinner, the one evening nobody can spend them. The
  offer now prices the *slot*: the barley soup is 22 min, not 25, and the plan-B
  compressor no longer fires early because it was counting yesterday's gesture
  against tonight's budget.
- **A dish now says what time to start it**, which « 50 min » never did when the
  pastry rests an hour in the middle: `Du premier geste au repas : 1 h 55 —
  commencer à 14h05` for a 16 h goûter. The rest is *below* the cut, so it does
  not split the recipe — you wait at home. Same field, different consequence,
  and the threshold is the only thing deciding between them.
- **The extreme case is a dish that costs zero minutes the day you eat it.**
  p. 55's roast is served cold the next day, so all 75 minutes are anticipated
  and `minutes_sur_place` is 0. The compiler prints *« rien à cuisiner le jour
  même : tout est fait la veille »*, which is the truth and reads like a bug.
  It also exposes an unwritten step: nothing in the recipe covers *slicing it*.
- **The reminder had to be anchored to a slot, not to an hour.** 12 h before a
  19 h 30 dinner is 07 h 05 — correct arithmetic, useless advice. But
  `attente_min` is a *minimum*, so the deadline is a **latest** moment and
  anything earlier is free. `agenda()` therefore hangs each gesture on the last
  meal slot that precedes it — a moment when somebody is in the kitchen anyway:

```
À ANTICIPER — les gestes dont l'oubli fait rater le plat sans recours
  ⏳ lundi dîner : Mettre l'orge à tremper (3 min, trempage) → mardi dîner
  ⏳ lundi dîner : Détailler l'oignon… (75 min, refroidissement) → mardi déjeuner
  ⏳ mercredi goûter : Mettre le colin à décongeler (5 min) → mercredi dîner
```

  What cannot be pulled earlier says so (`attente_souple: false`) and keeps its
  hour, bounded by `AVANCE_RIGIDE_MAX_H`: a roast cooked six hours early is
  still a roast, three days early is not.

**Missing the window is a price, not a gate** — the same 7 Wonders rule the
chaining already runs on. A dish whose soak was due last night is not forbidden;
it scores `anticipation_ratee` and offers its `rattrapage` (barley covered in
boiling water for an hour: *grain moins tendre, mais le plat se fait le jour
même*). And anticipation **by itself costs nothing** in the ranking: penalising
a dish for needing forethought would quietly push away the legumes that
`legumineuse: {min: 2}` two lines above is trying to encourage.

**The uncomfortable finding, and it is about a mechanic already shipped.**
Thawing is not a recipe property, it is a **household** property, so it is
derived — a new `decongeler` chain in `rules.yaml` whose steps are priced in
`avance_h` rather than `time_delta_min`. Which means the freezer's *« portions
d'urgence »*, the card you play on the night everything collapses, need
**twelve hours' notice in a household without a microwave**. That is a reserve,
not an emergency. This household has one, so the card is playable — but the
model was promising something it could not have delivered to a household that
does not, and nobody had noticed because nothing measured notice.

**The other end of the same axis.** `attente_min` says *not less than*;
`delai_max_h` on an `accepts` edge says *not more than*. p. 61's cake wants the
p. 59 mousse **still warm**, and the freshness window — counted in days — was
happily letting yesterday's set mousse through. The week now says so:

```
⏳ mercredi goûter : « Gâteau sans cuisson » veut « mousse-chocolat » sous 2 h
   — il est cuisiné 32 h plus tôt. Cette base ne se garde pas, elle s'enchaîne.
```

Both ends measure the gap between two moments, which is precisely what the
model could not measure at all. The mousse carries both at once: it needs 4 h to
set for its own goûter, and it must be poured into the cake within 2 h of being
made. Not a contradiction — two different uses of the same bowl.

**The validator earned its keep on the first run.** The new check is *does the
prose announce a wait that no field carries* — the exact failure mode, since for
eight recipes the information existed in French and was invisible to Python. It
found a ninth: p. 62's no-bake cake sets *« une nuit au frais »*, which nobody
had spotted by reading. It also fired on three false positives — bread dipped
3 min in water, a leftover *« plus fade que la veille »* — and that is 75 %
wrong, the ratio this README already identified as the point where a check
teaches you to skim. It was tightened the same hour, to the turns of phrase that
actually announce a wait.

**What this does not do** — attacked in the next section, which found that the
missing delivery was hiding three defects rather than one missing feature.

### The agenda's unit is the visit, not the gesture (`agenda.py`)

The previous section closed on an apology: *the agenda is computed, not
delivered; there is no notion of "now".* That reads like one missing feature —
wire up a notification — and it was not. Going at the delivery meant asking
*what exactly would you announce, and when*, and the model could not answer
either half. Three separate things were wrong, and all three were about time.

**The list of slots was not in clock order.** `Contexte.creneaux` carried the
comment `# Creneau, chronological` from the day it was written. It wasn't. The
TUI built the week by sorting each day's meals by their position in
`creneaux.yaml`, and the goûter is declared last because it arrived last — so
Wednesday came out *petit-déj, déjeuner, dîner, goûter*, with 16 h filed after
19 h 30. Two mechanics believed the comment: the chaining walks slots forward to
make *« hier soir nourrit ce midi »* true, and the anchor takes **the last slot
preceding a deadline** — by index. A Wednesday-evening deadline anchored to
*« mercredi goûter »*, naming a moment five hours in the past. The invariant now
lives in `construire_creneaux()`, next to the structure that declares it,
because a promise in a comment holds nothing.

**A slot is not a presence.** The anchor's whole premise is *a moment when
somebody is in the kitchen anyway* — and it was reaching for any slot at all,
including Tuesday's lunch, which `creneaux.yaml` has said all along departs in a
lunchbox (`emporte: {dejeuner: [mardi, jeudi]}`). Anchoring *« mets l'orge à
tremper »* there is telling someone to do it thirty kilometres from their
barley. The model already knew which meals leave the house; nothing had
connected that to the reminder. Of 22 slots, 20 are presences.

**And the minutes had been subtracted without ever being added.** This is the
one that matters. `minutes_sur_place` took the anticipated gestures *off* the
meal that was wrongly carrying them — the 3 min of soaking are not in tomorrow's
dinner — and nothing put them *on* the evening that actually pays them. They
fell between the two. On the test week, Monday evening displayed **20 min** and
owed **98**: its own panzanella, plus 75 min cooking Tuesday's roast (served
cold, so all of it is anticipated), plus the barley. `hors_budget` and the
time-ranking were both deciding on that number.

```
AGENDA — la cuisine visite par visite · maintenant : 10/08 18h00
  ▶ lundi dîner — y être à 17h52 · 98 min (dont 78 pour plus tard)
        ⏳ Détailler l'oignon…  (75 min, refroidissement) → mardi déjeuner
        ⏳ Mettre l'orge à tremper…  (3 min, trempage)    → mardi dîner
```

**The fix for all three is one object: the visit.** A flat list of gestures says
*« lundi dîner »* three times and never says what Monday evening costs. A visit
is a presence plus everything that hangs on it, and it knows two numbers nobody
had: what the evening really owes, and **the time to walk into the kitchen** —
17 h 52, not the 19 h 10 the meal's own duration implies. That start time moves
when tomorrow asks something of tonight, which is precisely the coupling the
model could not express.

The visit is also what makes delivery trivial, and that is the argument for it
over the gesture. *What* to announce is the visit's contents; *when* is
`visite.debut`. Three gestures in one room would otherwise be three
notifications for one trip — which is how you teach someone to turn
notifications off. `curseur(visites, maintenant)` splits the week at `debut`
rather than at the meal hour, so at 19 h 15 a 19 h 30 dinner needing 98 min is
not *« à venir »*, it is an hour and a half late.

**Two things the view exposed the moment it existed.** A missed deadline prices
its `rattrapage` on the gesture but not on the meal, so Tuesday read *« 22 min »*
for an evening whose only remaining route costs 82 — the same lie one level
down; it now reads `22 min + 60 min de rattrapage`. And the announcement is
built out of `action`, which is recipe prose (*« détailler l'oignon en petits
cubes, émincer les carottes, le céleri et le poireau »*) and not a label. It is
truncated for now, and the truncation is the finding: a step needs a short
imperative name that the recipe format does not carry.

**`agenda.py` contains no word of cooking, and that is deliberate** — this
mechanic is shared across facets, not owned by the kitchen. The garden has the
same shape: a sowing has a window, a winter fleece goes on *before* the frost,
and the reminder is worth something only if it lands when you are already at the
planter. So the module knows three things — a deadline, a presence, a visit —
and `semaine_model` supplies the kitchen's answers to *what produces deadlines*
and *what counts as being there*. Another facet supplies its own. The rule that
generalises furthest is the narrow one found here: **a presence is not every
moment you have an appointment, it is the moments you are actually in the
place** — which in the kitchen excluded the lunchbox, and in the garden will
exclude whatever its equivalent turns out to be.

**What this still does not do.** Nobody fires the reminder: `annonce()` renders
the sentence a notification would carry, and there is no scheduler behind it —
correctly so, since posting it belongs to the shell, which is the only layer
that sees a Tuesday-evening kitchen visit and a Tuesday-evening garden visit as
one interruption. `maintenant` is a flag, not a clock.

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
- **`attente_min`**: what the step *waits*, with nobody there, after the gesture.
  The second clock. Long enough (90 min) and it cuts the recipe into two
  sessions, which is what makes « la veille » derivable instead of written by
  hand; `attente_raison` names it, `attente_souple: false` forbids doing it
  earlier, and `rattrapage` is the price of having forgotten.
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
