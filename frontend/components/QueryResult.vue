<template>
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
      <div>
        {{
          Cause.failureOrCause(result.cause).pipe(
            Either.match({
              onLeft: error =>
                Match.value(error as SupportedErrors).pipe(
                  Match.tags({
                    NotFoundError: () => "Nicht gefunden",
                    NotLoggedInError: () => "Sie mussen eingelogt sein",
                    UnauthorizedError: () =>
                      "Sie sind nicht berechtigt, diese Aktion auszuführen",
                  }),
                  Match.orElse(
                    () =>
                      "Es ist ein Fehler aufgetreten. Wir wurden benachrichtigt und werden das Problem in Kürze beheben. Versuchen Sie es erneut.",
                  ),
                ),
              onRight: cause =>
                Cause.isInterrupted(cause)
                  ? "Die Anfrage wurde unterbrochen"
                  : "Es ist ein Fehler aufgetreten. Wir wurden benachrichtigt und werden das Problem in Kürze beheben. Versuchen Sie es erneut.",
            }),
          )
        }}
        <div v-if="config.public.env === 'local-dev'">
          dev details: {{ Cause.pretty(result.cause) }}
        </div>
      </div>
    </slot>
  </template>
  <Delayed v-else><v-progress-circular /></Delayed>
</template>
<script setup lang="ts" generic="E extends SupportedErrors, A">
import type { SupportedErrors } from "effect-app/client/errors"
import { Cause, Either, Match, Option } from "effect-app"
import Delayed from "./Delayed.vue"
import { Result } from "~/composables/client"

defineProps<{ result: Result.Result<A, E> }>()
const config = useRuntimeConfig()

const getLatest = (result: Result.Result<A, E>): A | null =>
  Option.getOrNull(Result.value(result))
</script>
