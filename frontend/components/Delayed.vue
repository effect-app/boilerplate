<template>
  <slot v-if="show" />
</template>
<script setup lang="ts">
import { useTimeout } from "@vueuse/core"

const props = defineProps<{ delay?: number }>()

const show = useTimeout(props.delay ?? 500)
</script>
