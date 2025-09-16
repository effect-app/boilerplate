<template>
  <div>
    <template v-if="error">
      <slot :error="error" />
    </template>
    <error-cause
      v-else
      :cause="cause"
    />
  </div>
</template>

<script setup lang="ts" generic="E">
import { Cause } from "effect-app"
import type { Refinement } from "effect/Predicate"
import { computed } from "vue"

type Props = {
  guard: Refinement<unknown, E>
  cause: Cause.Cause<unknown>
}

const props = defineProps<Props>()

const error = computed(() => {
  const main = Cause.squash(props.cause)

  if (props.guard(main)) return main
  return undefined
})
</script>
