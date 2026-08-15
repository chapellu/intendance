# Game mechanics, and which ones survive contact with a real kitchen

Exploration note for the week-builder prototype, in two waves. The first came
from *7 Wonders' chaining, and there are plenty of interesting mechanics* and
stayed inside card games. The second (from **11** on) was asked to sail further
out — any genre — and it turns out the card-game frame was the smaller half.
Colony sims, factory builders and farming games have been modelling *supply,
spoilage and standing orders* for twenty years, which is more literally this
problem than any deck ever was.

Two mechanics from the second wave are **built**, not merely noted: the standing
freezer floor (**12**) and the curse card (**13**).

Ground rule throughout, inherited from the garden map: **this is not a game.**
A mechanic earns its place only if it makes a real decision easier or gets food
on the table. Anything that is merely fun in the app has failed. Several famous
mechanics fail that test and are listed as rejected, on purpose.

---

## 1. 7 Wonders — chaining is a *cost waiver*, not a prerequisite ✅ implemented

In 7 Wonders, a card printed with a chain symbol can be built **for free** if you
already built its predecessor. Crucially you could always have built it anyway,
by paying the resource cost. The chain removes a cost; it never gates access.

This prototype had it wrong. `accepts: {required: true}` made a derived dish
*impossible* without its base, so the offer showed « ⚠ demande
lentilles-vertes-cuites » and shoved the card to the bottom. But of course you
can make pasta bolognese without last night's sauce — you buy mince and spend
45 more minutes. That is a **price**, and prices belong in the same currency the
rest of the app already speaks: shopping lines and minutes.

So recipes now carry a `sans_reste` block — what to buy and how much longer it
takes when the base is not there. A card reads one of two ways:

```
↪ base déjà cuite (Sauce bolognaise)      15 min   +2 art.
plein tarif : sans le reste               60 min   +6 art.
```

Same dish, two prices, and the chain is visible as the discount it is. Three
things improve at once: no more hard errors in the offer; the *value* of cooking
a souche becomes legible (it is the discount it unlocks later in the week); and
the planner stops refusing weeks that are perfectly cookable.

`required: true` survives only for dishes that genuinely cannot exist without
their base — it now means "no `sans_reste` exists", not "blocked".

## 2. 7 Wonders — Ages, i.e. the deck changes with the season 🔜 the obvious next step

7 Wonders deals three different decks across three Ages; costs and payoffs
escalate. The equivalent here is not difficulty, it is **season**. An August deck
and a December deck should not contain the same cards: summer is raw, quick, and
glut-driven; winter is soup, stew, and the preserved stock built in autumn.

This matters more than it looks, because the garden facet already runs on
seasonal windows and a Persephone period where nothing grows. A seasonal deck is
the cooking-side expression of the same clock, and it is the cleanest way to stop
the planner proposing ratatouille in January.

Cheap to build: a `saisons` field per dish, filtered in `deck()`. Not done yet
only because it deserves real seasonality data rather than my guesses.

## 3. 7 Wonders — Wonder stages ≈ the conservation tree ✅ already there

A Wonder is a personal board whose stages unlock one at a time, each granting a
permanent new ability. That is exactly what `conservation.yaml` became: sous-vide,
pressure canning, lacto-fermentation and drying are stages, each gated by kit,
each granting a permanent extension of what the household can keep. The
resemblance was accidental and is worth naming — it means the shape is a known
good one.

## 4. 7 Wonders — buying resources from your neighbours ⚠ maps, with a caveat

In 7W you can pay coins to use a neighbour's resource rather than produce it
yourself. The household equivalent is real and slightly uncomfortable: **buy the
base instead of cooking it.** Jarred passata instead of a reduced sauce, shop
stock instead of a carcass, ready-cooked lentils instead of simmering them.

It maps cleanly onto the existing `subs` field and it is honest about how people
actually cook on a Tuesday. The caveat is that money is currently nowhere in the
model — #29 has a ~€217/week baseline, but the prototype has no prices — so this
stays unbuilt until a cost axis exists. Adding money is a bigger decision than
adding a mechanic.

## 5. Deckbuilders (Dominion) — your repertoire *is* your deck, so it needs culling 🔜

Dominion's core insight is that a deck you only ever add to gets **diluted**:
sixty recipes of which ten are good means mostly bad draws. Its answer is
trashing — deliberately removing weak cards.

Directly applicable, and the user has "much more than six recipes". Once the real
repertoire lands, the hand quality depends on being able to retire a dish
("nobody liked it"), and on affinity weighting so favourites surface more often.
Without culling, a growing repertoire makes the app *worse*, which is a
counter-intuitive and important thing to design against.

## 6. Roguelike deckbuilders (Slay the Spire) — energy per turn = minutes per night ✅ partly there

Every card costs energy; you have a small amount per turn. That is precisely the
weeknight time budget, which the prototype already has (`[t N]`). What is missing
is the *deck-level* consequence, which brings us to:

## 7. Magic: the Gathering — the mana curve 🔜 a genuinely useful diagnostic

A deck needs a distribution of costs, not just good cards. A week of six
45-minute dishes is unplayable in the same way a deck of only expensive spells
is: the cards are fine, the curve is broken.

`main.garantir: [express, ...]` is a crude version — it guarantees a cheap card
in each hand. The real version is a **curve check on the week**: how many nights
are under 25 minutes, against how many nights the household actually has time
for. #29 says weekends are nomadic and the batch slot is a weekday, so the curve
is knowable. This is the single cheapest diagnostic left on the table.

## 8. Slay the Spire — curse cards ≈ the leftover that must be eaten 🔜 the best unbuilt idea

A curse is a card forced into your hand that you did not choose and would rather
not play. The kitchen has exactly one of these: **the thing in the fridge that is
about to spoil.**

Today the expiring lentils are a warning line under the week — passive, easy to
scroll past, and in fact the user's real fridge had already aged them out before
the planner mentioned it. As a *card dealt into the hand*, unbidden, with a
visible clock, the same fact becomes a decision: play it, or discard it and
accept that you are throwing food away. Making waste an explicit, chosen discard
rather than a silent default is the most behaviour-changing idea in this list,
and it is the one I would build next.

## 9. Engine-builders (Wingspan, Race for the Galaxy) — the souche ratio 🔜 a metric, not a mechanic

Engine games are about setting up so that later turns pay off. The kitchen
equivalent is already the souche/derivative structure; what is missing is the
scoreboard. One number would say it: **what share of the week's meals came from
something cooked once?** With 21 meal slots (#29) and three freezer drawers, that
ratio is the household's actual leverage, and it is currently invisible.

## 10. 7 Wonders Duel — the face-down pyramid 🔜 answers an earlier question

In Duel, cards sit in a pyramid: some visible, some face-down until the cards
above them are taken. You can see part of the future and plan toward it.

This is the answer to something already noted in the Civilization discussion —
that what the user liked was *seeing far ahead what will become possible*, not
the strict prerequisite graph. Showing next week's dishes as partly-revealed
cards, some unlocked by what you cook this week, delivers the foresight without
the rigid DAG that the "loose web" decision rejected.

---

# Second wave — beyond card games

## 11. Agricola — the feeding phase, and the slot two people are fighting over 🔜

Agricola is the closest thing to this app that exists as a boardgame, and its
central rule is not a card: **at fixed intervals the harvest comes, and you must
feed your family.** Fail and you take a begging card, which is pure penalty.
Food is not a resource you accumulate for points — it is a *debt that comes due
on a clock*, and everything else you do is subordinate to it.

That framing is more honest than this prototype's. Today a week is an optional
planning exercise you open when you feel like it; the model is happy with three
empty days. In reality 21 meal slots arrive every week whether or not anyone
opened the app, and the ones you did not plan get resolved by pasta or by
delivery. Naming the unplanned nights, rather than leaving them blank, would
change what the screen is *for*.

The second half of Agricola is worker placement: you have a few family members,
each action space fits one, and taking a space **denies it to everyone else**.
The kitchen equivalent is not ingredients — those are elastic, you can buy more.
It is the **batch slot**. There is one Sunday afternoon. Putting a 3-hour souche
in it means nothing else goes there, and #29 already says the weekends are
nomadic and the batch slot is a weekday. The prototype models minutes per night
as if minutes were fungible; they are not, because they belong to a specific
person on a specific evening.

Unbuilt because it needs schedule data the model does not have. But it is the
mechanic most likely to make the app match the actual constraint, which has
never been "what shall we eat" and has always been "who is free to cook".

## 12. RimWorld — the standing bill, and a reorder point ✅ implemented

In RimWorld you do not queue meals one at a time. You attach a **bill** to the
stove — *cook simple meals until you have 20* — and the colony re-triggers it on
its own whenever the stock falls through the threshold. It is the classic (s,S)
inventory policy wearing a game's clothes, and it is the right shape for a part
of this problem that the card frame was handling badly.

The insight: **not everything in a kitchen is a choice.** "What shall we eat
Tuesday?" is a decision, and deserves a hand of cards. "Are there still portions
behind me if Tuesday collapses?" is not a decision — it is a *level*, and levels
want a floor and an alarm, not a deal.

So `equilibre.yaml` gained `congelateur.plancher`, and the model now tracks the
freezer as a moving level across the week rather than a count of what the week
banks:

```
CONGÉLO 2 −1 +3 = 4 portion(s) d'urgence   au-dessus du plancher de 4
```

Opening stock, minus what the week eats out of it, plus what it puts back. Under
the floor, `_score` adds `plancher_congelo` to any dish that banks portions, and
the card says why — *remplit le congélo, sous son plancher (2/4)*. Batch cooking
stops being a virtue in the abstract and becomes the thing this particular week
is short of.

Worth noting what this replaced: the old `portions_congelees` only counted what
the week *added*, so a week that emptied the freezer looked identical to one that
never touched it. A level you only ever measure going up is not a level.

## 13. Slay the Spire — the curse card ✅ implemented, and it drew blood immediately

Wave one rated this the best unbuilt idea. It is now built, and it justified
itself on the first frame.

A curse is a card forced into your hand that you did not choose and cannot
usefully play. The kitchen has exactly one: **the thing in the fridge with a
clock on it.** Previously that was a grey line under the week — passive, easy to
scroll past. It is now dealt as a card above the hand, with its deadline printed
on it and exactly two exits:

```
┌─ ✖ MALÉDICTION ──────────────────────────────────────────────────┐
│ lentilles-vertes-cuites (2-repas)                     encore 1 j │
│ le sauve : Salade de lentilles à la feta, Petits burgers…        │
│ [!] le cuisiner    [d] le jeter                                  │
└──────────────────────────────────────────────────────────────────┘
```

`[!]` places the best dish that eats it on the earliest day that still catches
it. `[d]` throws it away — and that is the part that matters. The discard is
**recorded**, `calculer` stops counting the item as available, and everything
downstream reprices. Cook the doomed lentils and the burgers cost **30 min and 2
articles**; discard them and the same dish costs **65 min and 3 articles**,
because it now pays full `sans_reste` price. Waste is no longer free, and it is
no longer silent: it is a move you made.

The first frame it ever rendered, dated for today, said *périmé depuis 2 j —
plus aucun plat ne peut le rattraper à temps*, and offered only `[d]`. That is
the passive grey line's real failure mode, stated out loud: by the time anyone
reads it, the decision is gone. A curse card that arrives too late to play is
itself the finding.

## 14. Factorio — ratios, and alerting on the *starved* node 🔜

Factorio's deep teaching is throughput matching: a chain runs at the speed of its
slowest step, and overproducing an intermediate is waste dressed as progress.
The kitchen version is direct — a souche that yields four portions of sauce when
the week only ever consumes two has not saved you anything, it has moved the
spoilage downstream. The model has `emits`, `accepts` and `qty_band` already, so
the ratio is computable: **does what the week produces match what it consumes?**

The more transferable half is Factorio's *alerting discipline*. It never shows
you a dashboard of everything that is fine; it shows you the assembler that is
**starved**, with an arrow pointing at it. This prototype currently prints the
whole state every frame — deliberately, that is the point of a logic prototype —
but the real app should invert it. One line about the thing that will not work is
worth more than a full-week readout nobody parses.

## 15. Factorio — the blueprint, i.e. the week you already know 🔜 (but not here)

A blueprint is a saved arrangement you stamp down and then edit. The household
equivalent is obvious and probably valuable: **"ma semaine type"** — a skeleton
you drop in and adjust, rather than six blank slots every Sunday. Most weeks in
most households are a variation on the same week.

Explicitly *not* built here, because the prototype's rules say no persistence:
saving weeks is the thing a prototype should be testing the value of, not
depending on. Noted for the real app.

## 16. Zelda: Breath of the Wild — cook the fridge, not the recipe 🔜 an inverted query

BOTW has no recipe list to follow. You throw ingredients in a pot and their
*properties* combine into a result. Under-appreciated: this reverses the
direction of the whole interaction. Every planner, including this one, runs
**dish → ingredients → shopping list**. BOTW runs **what I have → what that
becomes**.

Both directions are needed and the app only has one. Sunday-with-a-list wants
dish→ingredients. Thursday at 19:00 with half a courgette, an egg and no
shopping trip left in you wants the inverse: *what does this become?* The
catalogue can already answer it — filter dishes whose non-cupboard ingredients
are a subset of what is in stock — and it is a genuinely different screen, not a
sort order.

The caveat is that it needs a real pantry inventory, which is the single most
tedious thing to ask a human to maintain. Worth prototyping with a deliberately
lazy input (five checkboxes for what is left) before assuming full inventory.

## 17. Balatro — jokers, i.e. the week has a modifier 🔜 a reframe of what exists

Balatro's jokers are not cards you play into a hand; they sit alongside it and
**change how everything scores**. The prototype already has this and does not
know it: `MODES` (`equilibre / courses / temps / frigo / varie`) are exactly
score modifiers, but they are buried in a `[m]` cycling key, mutually exclusive,
and invisible on the cards they are reweighting.

As played modifiers they would become *combinable and legible*: "semaine sans
viande" + "semaine à petit budget" + "on reçoit samedi" are three real constraints
that co-occur constantly and that the current single-mode switch cannot express.
This is cheap — the weights are already data in `equilibre.yaml` — and it turns a
hidden sort order into something the user states about their week.

## 18. Carcassonne — edges must match, i.e. companion planting 🔜 for the garden facet

Carcassonne's only placement rule is that a tile's edges must match its
neighbours'. That is a startlingly good fit for the **garden** side, where what
you may plant in a bed genuinely depends on what is in the bed next to it —
companion planting, allelopathy, shade cast by a neighbour. On a terrace of eight
containers, adjacency is the whole design space.

This is the first mechanic in either wave that belongs to the garden rather than
the kitchen, and it is worth flagging to the garden-interior research: the
question "how do we draw the terrace" has an answer that depends on whether beds
have *edges that interact*. A grid of independent pots and a tile-laying board are
different apps.

## 19. Crop rotation — the same cooldown, in the other facet ✅ already there, twice

Real gardening forbids planting the same botanical family in the same bed year
after year: pests accumulate, the soil is drawn down the same way. Agricola and
Fields of Arle both model it.

The pleasing part is that this app **already implements it** — as
`main.cooldown_jours`, which pulls a recently-cooked dish out of the deck. A dish
on cooldown and a bed on rotation are the same mechanic: *a slot that must lie
fallow so the system does not degenerate into repetition*. Two facets, one rule.
That is a strong signal for the shared shell: it belongs in the common layer, not
duplicated in each facet.

## 20. Darkest Dungeon — the roster gets tired 🔜 the honest missing axis

> **Confirmé depuis, par les données.** Ce point était une intuition tant que le
> modèle n'avait qu'un dîner par jour. Avec les 21 créneaux réels, l'auto-remplissage
> d'une semaine produit **475 minutes de cuisine** — dont une sauce bolognaise de
> 60 minutes placée un *lundi midi*, parce que le glouton note chaque créneau
> isolément et ne voit jamais la journée. Chaque créneau tient dans son budget ;
> la journée, non. C'est exactement la fatigue décrite ci-dessous, et elle n'était
> pas mesurable avant que les trois repas existent.

In Darkest Dungeon you cannot send the same four heroes on every expedition; they
accumulate stress and must be benched. The model is *the party is a renewable but
not infinite resource*.

The kitchen has this and refuses to say it: **the cook gets tired.** Six
cook-from-scratch evenings in a row is not a time problem — each night fits its
budget — it is a fatigue problem, and it is the actual reason weeks collapse into
takeaway on Thursday. The prototype scores every night independently and is
therefore blind to it by construction.

The minimum version is small: a cap on consecutive high-effort nights, or a
"curve" check in the sense of **7** — how many nights this week ask for real
cooking, against how many the household has in it. This is the clearest thing the
model is missing that no amount of better ranking will fix.

## 21. Root / Spirit Island — asymmetry, and the baby as a derived consumer 🔜

Asymmetric games give each player different rules, not different stats. The
household is asymmetric in exactly that way: two adults with different evenings
and different skills, and — per `household.yaml` — a baby, whose `diet: baby`
currently only removes them from `portion_eq` so they do not inflate the
quantities.

That is a modelling shortcut worth revisiting, because the baby's meals are not
absent, they are **derived**: the purée comes from the same vegetables, cooked
plainer, before the salt. That is an `emits`/`accepts` edge the catalogue does not
have, and it is the same chaining machinery already built for bases. A dish that
also feeds the baby is cheaper than one that requires a second, separate cooking
job — and right now the app cannot see that difference at all.

## 22. Legacy games — the repertoire keeps a scar 🔜

Pandemic Legacy has you write on the board and tear up cards; the game state
carries history permanently. Wave one covered *culling* (Dominion, **5**), but
legacy adds something culling does not: the board **remembers why**. A dish that
was refused twice by a kid, a recipe that always overruns its stated time, a
souche that reliably gets eaten before its derivative — these are facts a
household learns and an app throws away every week.

`historique.yaml` is already the log that would feed it. Annotation is cheap, and
it is what makes a repertoire *yours* rather than a list.

## 23. Slay the Spire — upgraded cards, i.e. you get faster 🔜 built-adjacent, deliberately not built

Strike+ costs the same and hits harder. Cooks do this for real: the fifth time you
make a dish it takes noticeably less time than the first, and stated recipe times
are written for someone who has never made it.

`historique.yaml` already counts how often each dish was cooked, so a mastery
discount on `time_min_total` is a handful of lines. Not built, for an honest
reason: with three entries in the log it would change nothing visible, and a
mechanic you cannot see working is a mechanic you cannot evaluate. It needs the
user's real cooking history first.

## 24. Dorfromantik / Terra Nil — the tone: no fail state 🎨 a constraint, not a mechanic

Both are placement games with no way to lose — Dorfromantik ends when it ends,
Terra Nil is about restoring rather than conquering. They are calm on purpose.

This is the right register for a household app and it is worth writing down as a
constraint, because several mechanics above could easily drift the other way. The
week is not scored, the fridge is not a threat, and a week where you ate badly is
information rather than a loss. The curse card in **13** sits closest to that line
and is deliberately phrased as a choice you make, not a punishment you receive.

## 25. Applied Energistics 2 (Minecraft) — the closest thing to what we built ✅ mostly, and it corrected a bug

The nearest analogue to this whole file, and it came from the user rather than
from me. AE2's autocrafting is not *a* mechanic to borrow — it is the same
problem, solved fifteen years ago by people who had to make it work at scale.

**What it does.** Items live in one queryable ME network. Recipes are **patterns**
(inputs → outputs, bound to a machine). You *request* an output, and the system
resolves the whole dependency tree, then shows a **plan before committing**: per
item, how many are in stock, how many will be crafted, and how many are
**missing** — the last in red, and the job will not start. Accept it, and a
**crafting CPU** takes the job: it *extracts and holds* the inputs, which stop
being available to any other job. Patterns run a whole number of times; surplus
outputs flow back into the network. An **ME Interface** can be told to keep N of
something in stock, so a level crossing a threshold *is* a craft order.

**What maps, and already did.** Nearly all of the supply half:

| AE2 | here |
|---|---|
| pattern | a recipe with `accepts` / `emits` |
| the ME network | `chainage.Stock` |
| the CPU extracting and holding inputs | `Stock.prelever()` — it depletes |
| fuzzy / substitution patterns | `accepts: {kind:}` and `subs:` |
| the missing-items plan | *« il manque 100 g »* and the sizing offers |
| ME Interface "keep N in stock" | the freezer floor from **12** (RimWorld) |
| byproducts returning to the network | `emits` landing back in the running stock |

That the RimWorld entry and the AE2 interface arrive at the same (s,S) reorder
policy from opposite directions is a decent sign the shape is right.

**What it caught.** One rule had no counterpart here and should have: **a pattern
runs a whole number of times.** The over-production offer was computing
`facteur + manque / par_lot` and cheerfully proposing *« en faire 1,6× »* a roast
chicken — a recipe whose principal ingredient is *one whole farm chicken*.
Pulling the thread found the same error one level deeper and much older: the base
scaling rule `facteur = besoin / rendement` gives **0,42** for a household of 2.5
facing a recipe for 6, which for a mousse means *make 42% of a mousse*. That
number was flowing into the shopping basket. `lot_entier:` now declares the
recipes built on an object you cannot cut, `chainage.facteur_lot()` rounds them up
to whole lots, and the offer says so out loud:

```
⤴ Poulet rôti : en faire 2 lots entiers (+300 g de poulet-cuit) et j2 (Fajitas)
  ne coûte plus rien — un lot ne se coupe pas, donc 200 g en plus au congélo.
```

Note the kitchen is *more* granular than AE2, not less: 1,5× a bolognese is a
perfectly good instruction. The lesson is not "always round" but "some patterns
are atomic, and the model must know which" — which is a declaration, not a rule
that can be derived. « 1 pièce » describes a whole chicken and also an onion.

**What is missing, and it is the big one.** AE2 resolves **recursively**. Ask for
lasagne and it will craft the bolognese, and whatever the bolognese needs, on its
own. This planner looks exactly *one* level back, and only among dishes already
placed in the week; `fallback_recipe:` is a hand-written pointer at the sub-recipe,
which AE2 would never need — it finds the pattern that emits the type. That is
both a real simplification available (derive the fallback from the catalogue, a
query the validator already performs for `kind:` edges) and a genuine design
question: should the planner *insert* "cook a bolognese on Monday" into your week
by itself? AE2 would. A week is not a factory order, and the answer is probably
"propose, never insert" — the same line already drawn for over-production.

**Where the analogy breaks, and why it matters.** AE2's storage is infinite and
eternal, its items never rot, its patterns cost energy rather than a human being
standing in a kitchen at 19h with a baby on one hip, and — decisively — **in AE2
the demand is given**. You request 64 gears. Nobody requests a week of dinners:
you fill 21 slots with things that must also be pleasant, varied and balanced, and
that demand is *constructed*, not stated. That single asymmetry is why AE2 can be
fully automatic and this cannot, and it is why the interactive half of this
prototype is a card game rather than a crafting terminal. AE2 has no counterpart
to `equilibre.yaml`, to the fridge window, or to the freezer drawer budget —
nothing in it ever says *you had pasta twice this week*.

The honest summary: **AE2 is the right model for the supply half and the wrong
model for the demand half.** Almost every remaining idea worth stealing from it
is on the supply side.

---

## Rejected, deliberately

- **Military conflict / player interaction (7 Wonders)** — there is one
  household. Nothing to model.
- **Randomised difficulty, combat, HP (roguelikes)** — the failure state here is
  a bad dinner, and dramatising it would be exactly the "entertains without
  changing behaviour" trap.
- **Victory points and end-of-week scoring** — scoring the week invites gaming
  the score. The week's real feedback is that people ate well and the fridge is
  empty. Coverage targets already provide direction without a leaderboard.
- **Card rarity / packs / collection** — a repertoire is not a collection to
  complete. Rarity would push toward cooking things for novelty rather than
  because they suit a Tuesday.
- **Overcooked's real-time chaos** — dramatising the rush is the opposite of
  helping. Its one real lesson is kept and belongs elsewhere: the binding
  constraint on a weeknight is often *the oven and the two hobs*, not the
  ingredients. The capability model can express that; the panic cannot.
- **Streaks, badges, "you planned 5 weeks in a row!"** — the habit-app trap. A
  streak makes a bad week feel like a failure and quietly pushes you to log
  rather than to cook. It also breaks exactly when life is hardest, which is
  when the app should be most useful.
- **Hunger / satisfaction meters on the household** — modelling people as bars
  that deplete. Wrong on the merits and unpleasant besides; the household knows
  whether it ate well and does not need a gauge to tell it.
- **Trading, markets, dynamic prices** — the shop is not an opponent. Money
  belongs in the model eventually (see **4**), as a cost axis, not as a game.
