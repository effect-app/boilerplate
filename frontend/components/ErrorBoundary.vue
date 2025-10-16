<template>
  <Suspender>
    <template #error="{ error }">
      <v-container>
        <template
          v-if="guard && Runtime
          .isFiberFailure(error) && guard(Cause
            .squash(error[Runtime.FiberFailureCauseId]))"
        >
          <slot
            name="error"
            :error="Cause.squash(error[Runtime.FiberFailureCauseId]) as E"
          />
        </template>
        <template v-else>
          <error-cause
            v-if="Runtime.isFiberFailure(error)"
            :cause="error[Runtime.FiberFailureCauseId]"
          />
          <p v-else>
            Ein unerwarteter Fehler ist aufgetreten.
            <span v-if="config.public.env !== 'prod'">{{ error }}</span>
          </p>
          <br>
          <div>
            <v-btn @click="reload()">
              Seite neu laden
            </v-btn>
          </div>
        </template>
      </v-container>
    </template>
    <slot />
  </Suspender>
</template>

<script setup lang="ts" generic="E">
import { useRuntimeConfig } from "#imports"
import { Runtime } from "effect"
import { Cause } from "effect-app"
import type { Refinement } from "effect/Predicate"
import Suspender from "./Suspender.vue"

defineProps<{ guard?: Refinement<unknown, E> }>()

const config = useRuntimeConfig()
const reload = () => window.location.reload()
</script>
<script lang="ts">
/**
 * Error Boundary is a component that catches errors in its child components and displays a fallback UI. you can use a guard to display a custom component for specific errors
 * in Vue3/Nuxt4, its important your nearest Error Boundary handles all errors, or there will be weird rendering glitches
 */
export default {
  name: "ErrorBoundary"
}
</script>
