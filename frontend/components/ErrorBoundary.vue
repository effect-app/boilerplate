<template>
  <Suspender :error-handler="(_) => true">
    <template #error="{ error }">
      <v-container>
        <div>
          <error-cause
            v-if="Runtime.isFiberFailure(error)"
            :cause="error[Runtime.FiberFailureCauseId]"
          />
          <p v-else>
            Ein unerwarteter Fehler ist aufgetreten.
            <span v-if="config.public.env !== 'prod'">{{ error }}</span>
          </p>
        </div>
        <br>
        <div>
          <v-btn @click="reload()">
            Seite neu laden
          </v-btn>
        </div>
      </v-container>
    </template>
    <slot />
  </Suspender>
</template>

<script setup lang="ts">
import { Runtime } from "effect"
import Suspender from "./Suspender.vue"

const config = useRuntimeConfig()
const reload = () => window.location.reload()
</script>
