<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: List Totality -->

# List Totality: every entity lands in exactly one rendered bucket

Default rule: when a page splits a collection into tabs / sections / groups
(orders, claims, imports — every list-shaped surface), the split must be
**total** and that totality must be **enforced at compile time**. An entity may
never match zero buckets (invisible) or two buckets (double-shown/miscounted),
and the classification must fail the build when a new state or a new bucket is
added without being handled.

Companion to [list-layout.md](./list-layout.md) (where per-item actions live)
and [tagged-state-machines.md](./tagged-state-machines.md) (the state unions
being classified).

## The failure this prevents

A durable-saga entity parked mid-step sat in a state (`valid`, but the external
step had failed) that **no list predicate matched**: one screen filtered for
`processing`, another for the known phases, and the parked entity fell between
them. It was in the database, fully recoverable, and **visible on no screen** —
so no one could retry it.

The root cause is a class, not a one-off: **independent positive `.filter()`
buckets with no catch-all.** Each list decides "show if X"; the union of the
Xs is assumed to cover everything but nothing checks it. Add a state, tweak a
predicate, and the covered set silently develops a hole.

```ts
// ANTI-PATTERN — three independent predicates, no proof they partition
const todo = items.filter((_) => _.state === "valid")
const processing = items.filter((_) => _.state === "processing")
const done = items.filter((_) => _.state === "done")
// a `parked` / `out-of-stock` / future state matches none → invisible
```

## The three compile-time guarantees

Totality is not "we wrote a catch-all once". It is three properties the type
checker re-verifies on every change:

1. **Exhaustive classification.** Every entity is mapped to a bucket key by a
   single function whose codomain is a closed key union. Drive it from a
   `Record<Phase, Key>` over the entity's state union so that **adding a state
   tag without mapping it is a compile error** (`satisfies never` on the
   fall-through where the state is itself an open union you can't `Record`).

2. **Every bucket key has a title.** The bucket set is a `Record<Key, string>`
   (or `Record<Key, …>`), so **adding a bucket key without titling it is a
   compile error** — "we don't yet handle that key" fails the build.

3. **Produced ⇒ rendered.** Classification returns an **ordered list of
   `{ key, title, items }`**, present buckets included (empty ones too), and the
   template renders by **iterating that list** (`v-for`). A bucket can be
   neither produced-but-not-rendered nor rendered-but-not-produced, because
   there is exactly one list and the template walks all of it.

Miss any one and totality regresses silently: (1) lets a new state fall
through, (2) lets a new bucket be untyped, (3) lets a real bucket be forgotten
by the hand-written template.

## The primitive

`frontend/utils/bucketByPhase.ts` encodes all three:

```ts
export const bucketByPhase = <T, K extends string>(
  items: Iterable<T>,
  titles: Record<K, string>, // (2) new key without a title → compile error
  classify: (item: T) => NoInfer<K> // (1) can only return a declared key
): Array<Bucket<K, T>> => {/* one entry per key in titles, in order */}
```

Apply it with a `Record<Phase, K>` so the classifier itself is total over the
state union:

```ts
type Tab = "todo" | "processing" | "done" | "needsAttention"
const TITLES: Record<Tab, string> = {
  todo: "To do",
  processing: "Processing",
  done: "Done",
  needsAttention: "Check"
}
// exhaustive over the phase union → a new phase forces a new arm here
const PHASE_TAB: Record<Phase, Tab> = {
  valid: "todo",
  processing: "processing"
  /* … */
}

const tabs = computed(() =>
  bucketByPhase(items.value, TITLES, (_) => PHASE_TAB[phaseOf(_)])
)
```

```vue
<v-tab v-for="tab in tabs" :key="tab.key">{{ tab.title }} ({{ tab.items.length }})</v-tab>
<v-window-item v-for="tab in tabs" :key="tab.key"> … render tab.items … </v-window-item>
```

### Two-level (tabs that contain sections)

When a tab groups several sub-sections (e.g. an "occupied" group tab holding
_in-use_ / _blocked_ / _elsewhere_), classify into the **fine-grained** section
keys, then bucket the sections into tabs via a second `Record<Section, Tab>`
(also exhaustive). Still one iterated structure end to end — `tabs → sections →
items` — so the two-level split keeps all three guarantees.

## When per-bucket bodies differ

Iterating one list does **not** force one uniform row template. Switch the body
on the (typed) `tab.key` / `section.key` inside the loop (`v-if="tab.key ===
'…'"`), or dispatch to a per-key body component. The classification stays total;
only the presentation branches. This is the escape hatch that lets genuinely
different cards (a clickable checkout card vs an informational blocked card)
live under one enforced iteration instead of separate hand-read buckets.

## A boolean discriminant is already total — leave it

A view split purely on a `boolean` (a resource that is `inUse` or not) is total
by construction and **cannot grow an unhandled phase**: adding a third state
requires widening the boolean to a union, which is itself a type change that
forces every consumer to handle it. Converting such a view to `bucketByPhase`
adds ceremony without adding safety. The rule targets **open unions** (state
tags, blocked/occupied combinations) where a new variant can appear and
silently fall through — confirm the boolean case is total and move on.

## Routing states you don't render — the "hidden" key

The exhaustive classifier must map **every** tag of the state union, but not
every tag is meant to be shown. The closed-union equivalent of a catch-all is a
declared `"hidden"` key: route the tag to it in the same `Record<State, Key>`,
then omit `"hidden"` from the titled/iterated keys so it is produced (proved
accounted for) but never rendered. "Fell through the cracks" and "deliberately
suppressed" are again distinguishable in the code.

A work-queue list can be an item-grain partition of a parent entity's line items:
every line-item state maps to `tasks` / `done` / `missing`, while tags that
never belong on that list (`initial`, `processed`, `cancelled`) route
to `"hidden"`. Those tags are structurally unreachable on an assigned parent
(no `groupId`, or a server pre-filter), so hiding them is behavior-preserving —
but the `Record` makes a _new_ tag a compile error instead of an invisible row.
`bucketList` / `bucketCount` carry the ordered, titled result and give pages a
typed lookup for the action logic that needs one specific bucket.

## Single membership: double-showing is the mirror of invisibility

Totality has two failure modes, not one. Invisibility is an entity in **zero**
buckets; the mirror is an entity in **two**. Both come from non-exclusive
`.filter()` predicates (a loose `||`/`&&` split); both make the counts lie. A
`bucketByPhase` classify returns exactly one key, so it rules out _both_ — that
is the point.

Before modelling a split, decide what the **rendered unit** is, because that
decides whether an apparent double-appearance is legitimate:

- **Legitimate — different grain.** If the unit is finer than the entity you
  loop over, one entity can legitimately contribute rows to several tabs. A
  view that renders line items projects a parent to its open lines (To do) and
  its completed lines (Done). The parent "appears twice", but each **line** is
  in exactly one tab — a true partition at line grain. Model it as a
  line-level split, not a parent-level one.

- **Smell — same entity, contradictory tabs → give it a compound status.** If
  the _same whole entity_ would land in two tabs whose labels contradict each
  other, that is a bug wearing a feature's clothes: it double-counts and the two
  tabs disagree about what the entity _is_. Resolve it by classifying the entity
  **once** into the tab that reflects its primary status, and expressing the
  secondary fact as an inline badge. A page that splits entities into "ready"
  and "not ready" does this: an entity bundling a processable child and a
  shortage child is _processable_, so it sits once under "READY" with a
  "ready-with-special-status" shortage badge — not duplicated under "NOT READY".
  A compound status belongs on one representation of the entity, never smeared
  across two tabs. (If the secondary fact is really about a _finer unit_, that's
  the "different grain" case above — split the finer unit instead.)

Rule of thumb: if you reach for a second `.filter()` whose predicate can be true
at the same time as the first, stop — either the grain is wrong (split the finer
unit and partition _that_ with `bucketByPhase`), or you want one bucket with a
richer status.

## Per-bucket type narrowing — evaluated, not adopted

The natural next step after _membership_ totality would be _shape_ totality:
give each bucket's `items` a type narrowed to the states that map to it (so a
"done" body cannot even receive a "todo" order — "fail when what you give is
more than what you can take" at the type level). Evaluated and deliberately not
adopted, because two structural walls make the cost exceed the benefit:

1. **The view types are not unions.** View types are built as
   `interface X extends Omit<ModelUnion, …> { … }` — `Omit` over a union
   collapses it into one interface whose `_tag` is merely a union-typed
   property. `Extract<X, { _tag: "done" }>` is `never`; there is nothing to
   narrow. Fixing that means rebuilding every view projection as a distributive
   union (`DistributiveOmit` per variant), rippling through the resource
   schemas.
2. **`<List>` re-unions at the slot boundary.** `List.vue` is generic over a
   single `T` for _all_ its lists; the `#Body` slot's `item` is typed `T`
   regardless of which list it came from. Per-bucket item types would need a
   per-list-generic slot redesign of `List.vue`.

Until both are worth paying for, the equilibrium is: **membership is proven at
compile time** (the exhaustive `Record`s), and **shape is asserted at runtime by
the same single classifier** (`v-if="keyOf(order) === '…'"` dispatching the
bodies in one view) — one source of truth for both, no duplicated predicates.
This is also why the bodies stay inline rather than extracted components: a
component boundary would _pretend_ to a narrowed prop type it cannot actually be
given through `<List>`.

## Anti-patterns this retired

- **Independent positive filters with no catch-all.** The origin failure —
  `filter(X)` per bucket, union assumed to cover, nothing checks it.
- **`const done = computed(() => bucketItems('done'))` (read-by-hand).**
  Even when classification is total, pulling each bucket out by key re-opens the
  "forgot to render one" hole. Iterate the list; never index it by hand in the
  script to feed named template slots.
- **A count from one computed, a body from another.** Two derivations of the
  "same" bucket (e.g. a tab label counting `partition[1]` while the body renders
  a separately-filtered group set) drift apart on the next predicate edit — one
  number, one source.
- **Silent truncation.** If a list intentionally hides a bucket, make it an
  explicit declared bucket routed to a hidden tab, not an entity that matches no
  predicate. "Hidden on purpose" and "fell through the cracks" must be
  distinguishable in the code. A page can declare an `idle` section (empty,
  unused entity) mapped to a `hidden` tab that the `tabs` computed filters out —
  an idle entity is meaningless on the active work queue, but a NEW state still
  cannot vanish: the exhaustive classifier forces it to be routed somewhere,
  and hiding it is a visible, greppable decision.

When adding or changing a list-shaped view, start from `bucketByPhase`; if you
find yourself writing a second `.filter()` bucket or reading a bucket out by
key, stop — classify once, title every key, iterate the result.
