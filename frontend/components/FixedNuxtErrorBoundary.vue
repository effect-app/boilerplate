<template>
  <slot v-if="error" v-bind="{ error, clearError }" name="error" />

  <slot v-else name="default" />
</template>

<script setup lang="ts">
import { captureException } from "@sentry/browser"
import { Cause, Runtime } from "effect-app"
import { onErrorCaptured, shallowRef } from "vue"

defineOptions({
  name: "NuxtErrorBoundary",
  inheritAttrs: false,
})

const emit = defineEmits<{
  error: [error: Error]
}>()

defineSlots<{
  error(props: { error: Error; clearError: () => void }): any
  default(): any
}>()

const error = shallowRef<Error | null>(null)

function clearError() {
  error.value = null
}

if (import.meta.client) {
  const nuxtApp = useNuxtApp()

  function handleError(
    ...args: Parameters<Parameters<typeof onErrorCaptured<Error>>[0]>
  ) {
    const [err, instance, info] = args
    // PRO: log that we hit the error boundary
    console.warn("NuxtErrorBoundary caught error", err, instance, info)

    // PRO: we don't handle native event handlers the same way we handle setup errors,
    // because these errors should only get reported, not take over the page.
    if (info === "native event handler") {
      captureException(err, { extra: { info, instance } })
      return
    }

    // PRO: don't render interruptions..
    // e.g when we run useSafeSuspenseQuery, and we navigate away before a query is finished, we get a CancelledError
    // if we however render it here instead of the default slot, we will show the cancellation error of the previous page, instead of rendering the new page
    if (
      Runtime.isFiberFailure(error.value) &&
      Cause.isInterruptedOnly(error.value[Runtime.FiberFailureCauseId])
    )
      return

    emit("error", err)

    nuxtApp.hooks.callHook("vue:error", err, instance, info)

    error.value = err
  }

  onErrorCaptured((err, instance, info) => {
    if (!nuxtApp.isHydrating) {
      handleError(err, instance, info)
    } else {
      onNuxtReady(() => handleError(err, instance, info))
    }

    return false
  })
}

// PRO: fix error not clearing after route change: https://github.com/nuxt/nuxt/issues/15781#issuecomment-2320928163
const router = useRouter()
router.afterEach(() => {
  clearError()
})

defineExpose({ error, clearError })
</script>
