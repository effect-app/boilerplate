<template>
  <div>
    <FixedNuxtErrorBoundary @error="(error) => emit('error', error)">
      <template #error="{ error }">
        <slot
          name="error"
          :error="error"
        >
          <p>
            An unexpected error occurred
            <span v-if="config.public.env !== 'prod'">{{ error }}</span>
          </p>
        </slot>
      </template>
      <Suspense
        :timeout="timeout"
        :suspensible="suspensible"
      >
        <slot />
        <template #fallback>
          <slot name="loader">
            <Loader />
          </slot>
        </template>
      </Suspense>
    </FixedNuxtErrorBoundary>
  </div>
</template>

<script setup lang="ts">
import { useRuntimeConfig } from "#imports"
import FixedNuxtErrorBoundary from "./FixedNuxtErrorBoundary.vue"

const emit = defineEmits<{
  (e: "error", error: Error): void
}>()

const config = useRuntimeConfig()
type BaseProps = {
  timeout?: number
  suspensible?: boolean
}
withDefaults(defineProps<BaseProps>(), {
  timeout: 500,
  guard: undefined
})
</script>

<script lang="ts">
/** Internal use, use ErrorBoundary instead */
export default {
  name: "Suspender"
}
</script>
