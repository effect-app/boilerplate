<template>
  <div ref="root">
    <FixedNuxtErrorBoundary @error="handleError">
      <template #error="{ error }">
        <slot
          name="error"
          :error="error as E"
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

<script setup lang="ts" generic="E">
import { onUnmounted, ref, templateRef, useRuntimeConfig, watch } from "#imports"
import { Cause, Runtime } from "effect-app"
import type { Refinement } from "effect/Predicate"
import FixedNuxtErrorBoundary from "./FixedNuxtErrorBoundary.vue"

const root = templateRef("root")
const latestRoot = ref()
watch(root, (v) => {
  if (v) {
    latestRoot.value = v
  }
}, { immediate: true })

onUnmounted(() => {
  // let's help silly vue.
  // for whatever bs reason, a Suspense within another Suspense does not properly unmount the html on error.
  if (latestRoot.value) latestRoot.value.remove()
})

const config = useRuntimeConfig()
type BaseProps = {
  timeout?: number
  suspensible?: boolean
}

type WithGuard = BaseProps & {
  guard?: Refinement<unknown, E>
}

type WithOnError = BaseProps & {
  guard?: never
  /** returning true means you handled the error */
  errorHandler: (error: Error) => boolean
}

type Props = WithGuard | WithOnError

const props = withDefaults(defineProps<Props>(), {
  timeout: 500,
  guard: undefined
})

const handleError = (error: Error) => {
  // if a custom error handler is provided, and it returns true, we consider the error handled
  if (
    "errorHandler" in props
    && props.errorHandler
    && props.errorHandler(error)
  ) {
    return
  }

  // if a guard is provided and we received a FiberFailure, and it returns true, we consider the error handled
  if (props.guard && Runtime.isFiberFailure(error)) {
    const culprit = Cause.squash(error[Runtime.FiberFailureCauseId])
    if (props.guard(culprit)) return
  }

  // move on to the next boundary, possibly until we reach the root error 500 page and native Sentry catch+report.
  throw error
}
</script>
