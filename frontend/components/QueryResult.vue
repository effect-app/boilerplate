<template>
  <div>
    <template v-if="result._tag !== 'Initial'">
      <slot
        v-if="getLatest(result)"
        :latest="getLatest(result)!"
        :refreshing="result.waiting"
        :latest-error="Result.isFailure(result) ? result.cause : null"
      />
      <slot
        v-else-if="Result.isFailure(result)"
        name="error"
        :error="result.cause"
      >
        <CustomErrorOrDefault
          v-if="customErrorGuard"
          :cause="result.cause"
          :guard="customErrorGuard"
        >
          <template #default="{ error }">
            <slot
              name="custom-error"
              :error="error"
            />
          </template>
        </CustomErrorOrDefault>
        <error-cause
          v-else
          :cause="result.cause"
        />
      </slot>
    </template>
    <Delayed v-else>
      <v-progress-circular indeterminate />
    </Delayed>
  </div>
</template>
<script
  setup
  lang="ts"
  generic="E extends SupportedErrors, A, E2 extends E"
>
import { Result } from "@effect-app/vue"
import type { SupportedErrors } from "effect-app/client/errors"
import type { Refinement } from "effect/Predicate"
import { $$ } from "~/prelude"
import Delayed from "./Delayed.vue"

defineProps<{
  result: Result.Result<A, E>
  customErrorGuard?: Refinement<unknown, E2>
}>()

const getLatest = (result: Result.Result<A, E>): A | null => $$.Option.getOrNull(Result.value(result))
</script>
