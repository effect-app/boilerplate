<script setup lang="ts">
import { useRuntimeConfig } from "#app"
import { Cause, Either, Match } from "effect-app"
import type { SupportedErrors } from "effect-app/client/errors"

defineProps<{ cause: Cause.Cause<unknown> }>()
const config = useRuntimeConfig()
</script>

<template>
  <div>
    {{
      Cause.failureOrCause(cause).pipe(
        Either.match({
          onLeft: (error) =>
            Match.value(error as SupportedErrors).pipe(
              Match.tags({
                NotFoundError: () => "Nicht gefunden",
                NotLoggedInError: () => "Sie mussen eingelogt sein",

                UnauthorizedError: () =>
                  "Sie sind nicht berechtigt, diese Aktion auszuführen"
              }),
              Match.orElse(
                () =>
                  "Es ist ein Fehler aufgetreten. Wir wurden benachrichtigt und werden das Problem in Kürze beheben. Versuchen Sie es erneut."
              )
            ),
          onRight: (cause) =>
            Cause.isInterrupted(cause)
              ? "Die Anfrage wurde unterbrochen"
              : "Es ist ein Fehler aufgetreten. Wir wurden benachrichtigt und werden das Problem in Kürze beheben. Versuchen Sie es erneut."
        })
      )
    }}
    <div v-if="config.public.env !== 'prod'">
      dev details: {{ Cause.pretty(cause) }}
    </div>
  </div>
</template>
