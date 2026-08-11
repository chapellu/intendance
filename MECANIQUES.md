# Card-game mechanics, and which ones survive contact with a real kitchen

Exploration note for the week-builder prototype. The user's prompt: *7 Wonders'
chaining, and there are plenty of interesting mechanics.* True — and one of them
is strictly better than what this prototype does today, so it got implemented
rather than just noted (see **1**).

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
