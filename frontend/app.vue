<script setup lang="ts">
import { useIntl } from "./composables/intl"
import { provideIntl } from "@effect-app/vue-components"

const intl = useIntl()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
provideIntl(intl as any)

useApiEventSource()
</script>
<template>
  <v-no-ssr>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </v-no-ssr>
</template>
