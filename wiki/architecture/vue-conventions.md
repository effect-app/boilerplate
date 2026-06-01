<!-- Space: SA -->
<!-- Parent: Scanner Wiki -->
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
export const GetShipmentResponse = S.Union(ClosedShipmentDetail, OpenShipmentDetail)

// GOOD — S.TaggedUnion gives free guards
export const GetShipmentResponse = S.TaggedUnion(ClosedShipmentDetail, OpenShipmentDetail)

// guard usage:
GetShipmentResponse.guards.Open(shipment)            // narrows to OpenShipmentDetail
GetShipmentResponse.guards.Closed(shipment)          // narrows to ClosedShipmentDetail
const inProgress = ShipmentState.isAnyOf("Booked", "LabelsAssigned")
inProgress(shipment.shipmentState)
```

**Don't introduce `computed` properties whose only job is to check a `_tag`.** `computed` does not narrow types; guards do. After `v-if="GetShipmentResponse.guards.Closed(shipment)"`, TypeScript knows `shipment` is `ClosedShipmentDetail` inside the block — properties like `shipment.labelUrl` resolve directly without `?.` or `!`.

```ts
// BAD — every computed re-implements the same check and none of them narrow types for siblings
const isFinished       = computed(() => shipment.value._tag === "Closed")
const labelUrl         = computed(() => shipment.value._tag === "Closed" ? shipment.value.labelUrl : null)
const closedData       = computed(() => shipment.value._tag === "Closed" ? shipment.value : null)
const isClosingInProgress = computed(() => {
  if (isFinished.value) return false
  const state = shipment.value._tag === "Open" ? shipment.value.shipmentState : undefined
  return state?._tag === "Booked" || state?._tag === "LabelsAssigned"
})
```

```vue
<!-- GOOD — guard in the template, full type narrowing inside the block -->
<template v-if="GetShipmentResponse.guards.Closed(shipment)">
  {{ shipment.labelUrl }}
  {{ shipment.carrierTransactionId }}
</template>
```

## Group related form state into one ref

When **not** using a form helper, group related form fields into a single `ref` instead of one ref per field. Reduces variable noise and keeps related state colocated.

```ts
// BAD
const editableFrom    = ref("")
const editableSubject = ref("")
const editableText    = ref("")

// GOOD
const emailDraft = ref({ from: "", subject: "", text: "" })
```

For anything bigger than a few fields with validation, reach for the form helper instead.
