<template>
  <div>
    <template v-if="result._tag !== 'Initial'">
      <slot
        v-if="getLatest(result)"
        :latest="getLatest(result)!"
        :refreshing="result.waiting"
        :latest-error="AsyncResult.isFailure(result) ? result.cause : null"
      />
      <slot
        v-else-if="AsyncResult.isFailure(result)"
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
import { AsyncResult } from "@effect-app/vue"
import type { SupportedErrors } from "effect-app/client/errors"
import type { Refinement } from "effect/Predicate"
import { $$ } from "~/prelude"
import Delayed from "./Delayed.vue"

defineProps<{
  result: AsyncResult.AsyncResult<A, E>
  customErrorGuard?: Refinement<unknown, E2>
}>()

const getLatest = (result: AsyncResult.AsyncResult<A, E>): A | null => $$.Option.getOrNull(AsyncResult.value(result))
</script>
