<!-- TODO(shared): contains project-specific examples (Mako/Empasa/EasyLife, carriers, bauhaus, omega). Generalize before downstream sync. -->

# List Layout: per-item Actions inside the body slot

Default rule: when a page renders a `<List>` (or any container whose body slot iterates over rows / panels) and each row exposes actions tied to that row's data, render those actions as a dedicated component **inside the body slot**. Do not lift the actions into a top-level form gated by a `selectedItem` ref.

The body slot's mount lifecycle is the guard. While the panel is open, the component exists with a non-null `item` prop; when the panel collapses or the row leaves the list, the component unmounts and its state is discarded. No `v-if="selectedItem"`, no nullable-item branches in computeds, no provide/inject across slot scopes.

Applies to every list-shaped page in the app — packer pages, commission pages, dashboards with expandable rows — wherever the action set depends on a single selected entity.

Companion to [command-input-validation.md](./command-input-validation.md) (commands take validated input) and [query-shape-list-vs-get.md](./query-shape-list-vs-get.md) (project at the boundary).

## The shape

```
PageShell.vue
├─ data loads (Promise.all of suspense queries — query results outlive every panel)
├─ subscriptions hoisted to parent (SSE, websockets — see below)
├─ <GlobalListener @event="...">    ← if there's one global event source per page (scanner, hotkey)
└─ <List>
    ├─ #Top-Action-Menu
    │   ├─ <div id="top-action-menu" />     ← portal target for per-item Teleport
    │   └─ shell-level commands (release-all, mark-finished, pause)
    ├─ #Title                                ← per-item header chips, slot-scoped
    ├─ #Item-Body
    │   └─ <ItemActions :item :resources @… />
    │        ├─ <Teleport to="#top-action-menu" defer>
    │        │    └─ per-item form, action buttons, confirm dialogs
    │        └─ inline body table + per-row inline actions
    └─ #Item-ReadOnly-Body
        └─ <ItemReadOnly :item />            ← separate, smaller component for terminal-state rows
```

## Why per-item, not per-page

`<List>` renders one body-slot instance per panel and passes the row as the slot scope (`{ item }`). Mounting `<ItemActions>` inside that slot gives the component a **non-null `item` prop for its entire lifetime**.

That removes a whole class of plumbing:

- No `selectedItem` ref to keep in sync with the List's internal selection.
- No `v-if="selectedItem"` wrappers; no `item?.field` chains in computeds.
- No `useSelectable(itemRef, …)` that takes a nullable root.
- No template refs / provide-inject to bridge "the form in the top slot" with "the body table in the body slot" — they're the same component now, with the form Teleported out.

The implicit guard is the panel's mount lifecycle. State (selection, draft form values, in-flight optimistic updates) is per-item by construction.

## What lives where

### Page shell (item-agnostic)

- Route middleware / claim guards / page-level redirects.
- All `Promise.all` data fetches whose results several screens read.
- Page-stable refs / subscriptions that **must not** re-mount when a panel switches (see "Hoist subscriptions" below).
- `<List>` lifecycle plumbing: any `listKey` remount after a confirm flow, the active-tab state, watchers that re-select an item after a server round-trip.
- Commands with **no item context**: bulk-release, page-level pause, dashboard-wide refresh.
- Global event listeners (the keyboard buffer for a barcode scanner, a hotkey listener) — these own the subscription and delegate per-event to the active item's handler.

### `_components/ItemActions.vue` (per-item, owns the form)

- `defineProps<{ item; …shared resources }>()` — `item` is non-null.
- Selection composables scoped to the item (`useSelectableSingle(computed(() => props.item), …)`).
- Per-item commands: edit, submit, undo, the per-row half of any global event.
- `defineExpose({ … })` exposing any handler the page-level listener needs to route into (e.g. `scan`).
- `<Teleport to="#top-action-menu" defer>` projects the form into the page-level action area; the rest of the body renders inline inside the slot.

### `_components/ItemReadOnly.vue` (per-item, no commands)

- Terminal-state rendering for rows in the "done" tab.
- No selection, no form, no Teleport — just the row's read-only details.
- Kept separate from `ItemActions` so the action-heavy code doesn't pay the import cost on rows that can't be acted on.

## Hoist subscriptions, not commands

Anything whose subscription / identity must survive a panel re-mount lives in the parent:

- **Event-source connections** (`useWeightScaleEventSource`, SSE feeds, websocket subscriptions). Opening / closing the connection every time the user expands a panel is wasteful and racy. Owned by the shell, passed down as a prop.
- **Suspense query roots.** TanStack already caches, but the suspense boundary has to live above `<List>`. Shell owns the queries; `ItemActions` reads from props.
- **One-time projections.** Shape transforms applied via `select` on the parent's query (see [query-shape-list-vs-get.md](./query-shape-list-vs-get.md#project-once-at-the-query-not-in-every-consumer)). Each `ItemActions` instance receives the already-projected shape and never re-derives.

Commands stay in the child even when they read parent-stable refs, because their **handler identity matters per item**: toast keys, optimistic state, scan-delegate hooks all want to be torn down when the item unmounts.

## Global events: page-level listener, per-item handler

The pattern for a barcode scanner, hotkey, or any single-listener input that should act on the currently-active item:

```ts
// shell
const actionsRef = useTemplateRef<InstanceType<typeof ItemActions>>("actionsRef")

const onEvent = Command.fn("…")(function*(payload: string) {
  const handler = actionsRef.value
  if (!handler) return yield* new InvalidStateError("Bitte ein Element auswählen")
  yield* handler.handleEvent(payload)
}, Command.withDefaultToast({ onSuccess: null, onWaiting: null }))
```

```vue
<!-- shell template -->
<GlobalListener @event="onEvent.handle" />
<!-- … -->
<ItemActions ref="actionsRef" :item … />
```

The shell owns the subscription (one buffer, one listener, one set of teardown hooks); the child owns the handler (knows the active item, the selection, the next action). The `InvalidStateError` covers the "fired with nothing expanded" race.

## Per-row inline actions on the active panel

Some actions are intrinsically per-row (an unpack button on each completed sub-package, a remove button on each line item). Render them **inside `ItemActions`** rather than the shell, because they need to mutate the same selection / form state the rest of the component owns. The body slot only renders for the expanded panel, so the row data is always paired with the active `props.item`.

After a server round-trip, the item may flicker — leave one tab, briefly re-enter the other before settling. A `pendingItemId` ref + a watcher on the relevant list in the shell handles re-selection once the cache settles:

```ts
// shell
const pendingItemId = ref<string | null>(null)
watch(visibleItems, (current) => {
  const id = pendingItemId.value
  if (!id) return
  const found = current.find((_) => _.id === id)
  if (found) {
    selectedItem.value = found
    pendingItemId.value = null
  }
}, { flush: "post" })
```

The per-row command emits `unpackPending` (or similar) when it finishes; the shell stores the id and lets the watcher re-select.

## Anti-patterns this layout retired

- **`selectedItem` plumbed into a top-of-page form.** Required `v-if` guards everywhere, an explicit `null` branch in every computed, and a `useSelectable` instance with a nullable root. Touching the form for one item could leak state into the next.
- **Bodies in the shell, commands in a sibling child.** Forced provide/inject or template-ref drilling to bridge them — and provide/inject **does not work** for this, because slot content renders in the parent scope where the child's `provide` is not reachable.
- **Resubscribing to a long-lived feed on every panel switch.** Drops events during the gap between unmount and remount, exhausts upstream connection limits, makes "is the feed connected?" a per-panel UI question.
- **A page-level scan handler that walks the DOM for the "currently expanded" panel.** Use a template ref into `ItemActions` instead — explicit, typed, no stale-DOM races.

## Concrete instances

- `frontend/workflows/mako/pages/standard/package/` — split shell + `_components/Actions.vue` + `_components/ActionsPacked.vue`.
- `frontend/workflows/mako/pages/bauhaus/package/` — same shape, with workflow-specific extras (pallet dialog, building-block flow) entirely inside `Actions.vue`.
- `frontend/workflows/easy-life/pages/dropshipping/package/` — same shape; the most recent convergence. Before the refactor, it ran a `selectedOrder` ref with a top-of-page form gated by `v-if`; the migration to this layout shrank the shell from ~750 lines to ~270.

When adding a new list-shaped page, start from this shape; if you find yourself adding a `selectedItem` ref to gate a top-level form, stop and move the form into a body-slot child instead.
