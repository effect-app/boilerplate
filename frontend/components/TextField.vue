<template>
  <v-text-field
    :type="field.type === 'float' || field.type === 'int' ? 'number' : 'text'"
    v-bind="$props"
    :model-value="convertIn(props.modelValue as any, field.type)"
    :required="field.metadata.required"
    :rules="
      props.extraRules ? [...props.extraRules, ...field.rules] : field.rules
    "
    color="primary"
    @update:model-value="value => convertOut(value, updateValue, field.type)"
  >
    <!-- pass down slots -->
    <!-- @vue-skip -->
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData" />
    </template>
  </v-text-field>
</template>
<script lang="ts" setup>
import type { FieldInfo } from "@/composables/form"
import { VTextField } from "vuetify/components"

export interface Fields
  extends /* @vue-ignore */ Omit<
    InstanceType<typeof VTextField>["$props"],
    "modelValue" | "update:modelValue"
  > {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: FieldInfo<any>
  extraRules?: InstanceType<typeof VTextField>["$props"]["rules"]
  modelValue: string | number | null
}

const props = defineProps<Fields>()
const emit = defineEmits(["update:modelValue"])

function updateValue(value: unknown | null) {
  emit("update:modelValue", value)
}
</script>
