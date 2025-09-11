<script setup lang="ts">
import { provideIntl } from "@effect-app/vue-components"
import { useIntl } from "./composables/intl"

const intl = useIntl()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
provideIntl(intl as any)

useApiEventSource()
</script>
<template>
  <client-only>
    <ErrorBoundary>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </ErrorBoundary>
  </client-only>
</template>
