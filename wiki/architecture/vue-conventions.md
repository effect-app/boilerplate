<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Vue Conventions -->

# Vue Conventions

Conventions specific to `.vue` single-file components in `frontend/`.

## Do not shadow `Array` in `.vue` files

Inside `.vue` files, import `effect-app/Array` as `Array$`, not `Array`. Nuxt/Vue templates use the global `Array` symbol at runtime (e.g. `x instanceof Array`), and shadowing it with the module binding breaks template rendering.

```ts
// ❌ breaks Vue templates
import * as Array from "effect-app/Array"

// ✅
import * as Array$ from "effect-app/Array"
```

Outside `.vue` files (`.ts`), keep importing as `Array`.

## TaggedUnion type guards in templates

Prefer `S.TaggedUnion` over `S.Union` for discriminated unions — it generates `.guards` / `.isAnyOf` helpers that double as TypeScript type guards.

```ts
// BAD — S.Union requires manual `_tag` checks and provides no guard helpers
export const GetOrderResponse = S.Union(ClosedOrderDetail, OpenOrderDetail)

// GOOD — S.TaggedUnion gives free guards
export const GetOrderResponse = S.TaggedUnion(
  ClosedOrderDetail,
  OpenOrderDetail
)

// guard usage:
GetOrderResponse.guards.Open(order) // narrows to OpenOrderDetail
GetOrderResponse.guards.Closed(order) // narrows to ClosedOrderDetail
const inProgress = OrderState.isAnyOf("Open", "Assigned")
inProgress(order.orderState)
```

**Don't introduce `computed` properties whose only job is to check a `_tag`.** `computed` does not narrow types; guards do. After `v-if="GetOrderResponse.guards.Closed(order)"`, TypeScript knows `order` is `ClosedOrderDetail` inside the block — properties like `order.labelUrl` resolve directly without `?.` or `!`.

```ts
// BAD — every computed re-implements the same check and none of them narrow types for siblings
const isFinished = computed(() => order.value._tag === "Closed")
const labelUrl = computed(() =>
  order.value._tag === "Closed" ? order.value.labelUrl : null
)
const closedData = computed(() =>
  order.value._tag === "Closed" ? order.value : null
)
const isClosingInProgress = computed(() => {
  if (isFinished.value) return false
  const state = order.value._tag === "Open" ? order.value.orderState : undefined
  return state?._tag === "Open" || state?._tag === "Assigned"
})
```

```vue
<!-- GOOD — guard in the template, full type narrowing inside the block -->
<template v-if="GetOrderResponse.guards.Closed(order)">
  {{ order.labelUrl }}
  {{ order.providerTransactionId }}
</template>
```

## Group related form state into one ref

When **not** using a form helper, group related form fields into a single `ref` instead of one ref per field. Reduces variable noise and keeps related state colocated.

```ts
// BAD
const editableFrom = ref("")
const editableSubject = ref("")
const editableText = ref("")

// GOOD
const emailDraft = ref({ from: "", subject: "", text: "" })
```

For anything bigger than a few fields with validation, reach for the form helper instead.

## Preserve branded ids in shared components

Do not widen domain ids to `string` just because a shared Vue component needs to support another workflow's key shape. If a prop, event, or selected-state ref represents an `ItemId`, `OrderId`, or another branded domain id for one consumer, keep that precision.

When workflows need different key shapes, make the component generic over the key type:

```ts
type GroupedRow<GroupId extends string> = {
  groupId: GroupId
  subGroupId: GroupId
}

const props = defineProps<{
  showGroup?: GroupedRow<OrderId>["groupId"]
}>()
```

For composite UI-only grouping keys, define a workflow-local named type at the boundary and construct it there. The shared component should receive that type through generics and emit it back unchanged. Keep raw delimiters or concatenation details out of the shared component, and do not make other workflows lose their branded ids to accommodate the composite case.
