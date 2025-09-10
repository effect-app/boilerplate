<script setup lang="ts">
import { useIntl } from "./composables/intl"
import { provideIntl } from "@effect-app/vue-components"

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
