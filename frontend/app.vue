<script setup lang="ts">
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
