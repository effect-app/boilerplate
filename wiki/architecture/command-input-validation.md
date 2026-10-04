<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Command Input Validation -->

# Command Input Validation: gate at the caller, not inside

Default rule: a `Command.fn` body assumes its input is valid. All presence / non-empty / "user selected something" checks live in the caller. Two valid ways to gate the trigger:

1. **`v-if` on the button** with a computed that returns the validated input or `null` — button disappears when input incomplete. Use when hiding the affordance is acceptable.
2. **`optional-input` on `CommandButton`** with a computed returning `Option<I>` — button stays rendered but disabled when `None`. Use when the affordance should remain visible (most cases).

Both share the same core: one computed gates both the UI and types the command input. No early-return guards inside the body.

Companions:

- [command-pattern.md](./command-pattern.md) — `.fn()` / `CommandButton` / `family()` / toasts; this doc is the gating rule on top of that machinery.
- [query-shape-list-vs-get.md](./query-shape-list-vs-get.md) — project at the boundary.

## Good vs bad at a glance

| Prefer                                                                                           | Avoid                                                                                                 |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Command parameter typed as the validated shape (`{ optionId, items: NonEmptyReadonlyArray<…> }`) | Command parameter is the loose form state, validated by early-return guards inside the body           |
| One computed (`Option<I>` or `I \| null`) drives both gating and command input                   | Separate `disabled` expression duplicating the checks the command body also runs                      |
| `v-if` (hide) or `optional-input` (disable) on the trigger when input incomplete                 | Trigger fires, hits a `return` guard, no-ops silently                                                 |
| Command body reads its arguments + **page-stable** refs (`props.order.id`, `effectiveRegion`)    | Command body reaches into **form** refs (the values the user is filling in) to assemble its own input |

## Why

1. **One source of truth for "can the user do this?"** The same `processInput` computed gates the button and types the command. The two cannot drift — there is no second branch inside the command that decides differently.
2. **Type-narrow inside the command.** The body works with `NonEmptyReadonlyArray`, `string` (not `string | null`), etc. No `if (!x) return` ladders, no `as` casts to convince the type system.
3. **Silent no-ops disappear.** A button that fires a command which immediately returns is bad UX (looks broken) and bad telemetry (the command logs an attempt with no work). `v-if` makes the affordance honest.
4. **Easier to test.** The command is a pure function of its input; tests don't have to wire up a half-filled form to exercise the guard branches.
5. **Composable.** Other call sites (a hardware event handler, a keyboard shortcut, an undo flow) can call the command directly with their own validated input, without re-implementing the form's checks.

## Pattern

```ts
// In the .vue component that owns the form state:
// Note: inside .vue files, import `effect-app/Array` as `Array$` (see vue-conventions.md).
import * as Array$ from "effect-app/Array"
import * as Option from "effect-app/Option"

const processInput = computed(() => {
  const optionId = selectedOptionId.value
  if (!optionId) return Option.none()
  const items = Array$.toNonEmptyArray(
    selectedItems.value.map((_) => _.id as StringId)
  )
  if (!items.value) return Option.none()
  return Option.some({
    optionId,
    items: items.value as NonEmptyReadonlyArray<StringId>
  })
})

const process = orderClient.Process.fn()(
  function*(
    { optionId, items }: {
      optionId: string
      items: NonEmptyReadonlyArray<StringId>
    }
  ) {
    yield* orderClient.Process.mutate({
      orderId: props.order.id,
      optionId,
      items
      // …other fields read from page-stable refs (weight, region)
    })
    // success-side state cleanup
  },
  Command.withDefaultToast()
)
```

```vue
<CommandButton
  :command="process"
  :optional-input="processInput"
  :disabled="process.waiting || isWeightOverLimit"
>
  Apply
</CommandButton>
```

`CommandButton` accepts `optional-input: Option<I>` in addition to `input: I`. When the `Option` is `Some`, the button is enabled and clicking it fires the command with the unwrapped value; when `None`, the button is disabled (still rendered, so the affordance is visible). No `v-if` / `v-else` placeholder pair, no type-level "is the input present?" branching at every call site.

Use `optional-input` whenever the input is gated by validation; use `input` when the value is unconditionally available; use neither when the command takes no input.

## Page-stable refs are still allowed inside the body

The line between "validate outside" and "command body may read" sits at **shape-of-the-write** vs **page context**. Page context — `props.order.id`, `props.order.address.country`, `effectiveRegion`, `resolvedWeightAmount` — is stable for the page lifetime and not what the user is filling in. Reading them inside the command body keeps the `:input` payload focused on the user's actual choice (the option + items) rather than re-serialising the entire page state.

Rule of thumb: if a field is "what the user selected in _this_ form", it goes through `:input`. If it is "what the page already knows about the order", read it inside the body.

## Dialogs and child components: emit the full payload

When a child component (dialog, chooser, sub-form) collects part of the command input and the parent supplies the rest as a prop, the child should **emit the complete payload** rather than just the bit it owns. This lets the parent wire `@event="command.handle($event)"` directly with no wrapper helper.

Wrong — child emits `amount`, parent reaches back into its own ref to compose:

```vue
<!-- in parent -->
<QuantityDialog
  :selected-item="selectedItem"
  @quantity="handleQuantity($event)"
/>
```

```ts
const handleQuantity = (amount: PositiveInt) => {
  const item = selectedItem.value
  if (!item) return
  setQuantity.handle({ amount, item })
}
```

The wrapper exists only because the emit shape didn't match the command input — every consumer re-implements the same `if (!item) return` guard.

Right — child emits `{ amount, item }`, parent wires straight through:

```vue
<!-- child: QuantityDialog.vue -->
<script setup lang="ts" generic="A extends TaskA | TaskB">
const props = defineProps<{ selectedItem: A | null /* … */ }>()
const emit = defineEmits<{ (e: "quantity", v: { amount: PositiveInt; item: A }): void }>()

const handleQuantity = () => {
  const item = props.selectedItem
  if (quantityInput.value && item) {
    emit("quantity", { amount: decode(quantityInput.value), item })
  }
}
</script>
```

```vue
<!-- parent -->
<QuantityDialog
  :selected-item="selectedItem"
  @quantity="setQuantity.handle($event)"
/>
```

The child already has `selectedItem` as a prop and is the only place that knows the dialog is open and the user clicked confirm — it's the natural site for the gating `if (item)` check. The parent's command input matches the emit shape one-to-one.

Make the child generic (`<A>`) so each consumer keeps its concrete task type and the command parameter doesn't have to widen to a union.

## When to keep checks inside

- The command can be triggered by a non-UI path (an external event, an SSE event, a job retry) where the caller cannot pre-validate. In that case, validate once at the command entry and surface a typed error (`InvalidStateError`), don't silently return.
- The check is a server-state invariant (e.g. "the order must still be in `done` state"), not a form-state check. Race-condition guards belong in the body and should return a typed error, not a bare `return`.

## Anti-patterns

- **Disabled-only gating.** Button is always rendered with `:disabled="!optionId || items.length === 0 || …"` and command body re-does the same checks. The two checks must be kept in sync forever; one of them is dead code; the user has no signal what _exactly_ is missing.
- **Loose input + early-return.** Command takes `{ optionId: string | null; items: readonly Item[] }`. Type system can't help; every read site asserts.
- **Non-null assertions on refs inside the body.** `selectedItem.value!`, `toNonEmptyArray(...).value!`, `form.value!` — every `!` is a runtime crash waiting to happen and a sign the validation belongs at the caller (`:optional-input`) or, for non-UI trigger paths, in a real `InvalidStateError` guard.
- **Parent-side wrapper helpers that re-validate state the child already has.** If you find yourself writing `const handleX = (count) => { if (!selectedItem.value) return; cmd.handle({ count, item: selectedItem.value }) }`, push the gating + emit shape into the child so the parent can wire `@x="cmd.handle($event)"` directly.
- **Calling `.handle()` with synthetic input to "show the toast".** If the user shouldn't fire it, don't fire it. Use UI state, not a no-op command call.
