<script
  setup
  lang="ts"
  generic="
  I extends NonEmptyReadonlyArray<any> =
    never
"
>
import type { NonEmptyReadonlyArray } from "effect/Array"
import type { VBtn } from "vuetify/components"

type VBtnProps = VBtn["$props"]

/* @vue-ignore */
interface ButtonProps extends VBtnProps {}

const props = defineProps<
  & (
    | {
      input: NoInfer<I>
      command: {
        handle: (...input: I) => void
        waiting: boolean
        action: string
      }
      empty?: boolean
      title?: string // why isn't it part of VBtnProps??
    }
    | {
      command: {
        handle: () => void
        waiting: boolean
        action: string
      }
      empty?: boolean
      title?: string // why isn't it part of VBtnProps??
    }
  )
  & ButtonProps
>()
</script>
<template>
  <v-btn
    v-if="!empty"
    v-bind="$attrs"
    :loading="command.waiting"
    :disabled="command.waiting || disabled"
    :title="title"
    @click="command.handle(
      ...((`input` in props && props.input
        ? props.input
        : []) as unknown as I)
    )"
  >
    <slot>
      <span>{{ command.action }}</span>
    </slot>
  </v-btn>
  <v-btn
    v-else
    v-bind="$attrs"
    :loading="command.waiting"
    :disabled="command.waiting || disabled"
    :title="title ?? command.action"
    @click="command.handle(
      ...((`input` in props && props.input
        ? props.input
        : []) as unknown as I)
    )"
  />
</template>
