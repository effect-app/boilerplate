<script setup lang="ts">
import { HelloWorldRsc } from "#resources"
import {
  useOmegaForm,
  OmegaForm,
  OmegaErrors,
} from "@effect-app/vue-components"
import { S } from "effect-app"
import type { NonEmptyString255, Email } from "effect-app/Schema"

const state = S.Struct({
  title: S.NonEmptyString255,
  name: S.NonEmptyString2k,
  age: S.NonNegativeInt,
  email: S.Email,
})

const form = useOmegaForm(state, {
  defaultValues: {
    title: "",
    name: "",
    age: 0,
    email: "",
  },
  onSubmit: async ({ value }: { value: typeof state.Encoded }) => {
    const trimmedValue = {
      title: value.title.trim() as NonEmptyString255,
      name: value.name.trim() as NonEmptyString255,
      age: value.age,
      email: value.email.trim() as Email,
    }
    await Promise.resolve(
      confirm("submitting: " + JSON.stringify(trimmedValue)),
    )
    form.reset({
      title: "",
      name: "",
      age: 0,
      email: "",
    })
  },
})

const makeReq = () => ({
  echo: "Echo me at: " + new Date().getTime(),
})

const req = ref(makeReq())

const helloWorldClient = clientFor(HelloWorldRsc)
const [result] = useSafeQuery(helloWorldClient.GetHelloWorld, req)

// onMounted(() => {
//   setInterval(() => {
//     // Fallback to the default focus check
//     focusManager.setFocused(false)

//     // Override the default focus state
//     focusManager.setFocused(true)
//   }, 2000)
// })

onMounted(() => {
  const t = setInterval(() => (req.value = makeReq()), 5000)
  return () => clearInterval(t)
})
</script>

<template>
  Hi world!
  <div>
    <OmegaForm :form="form" :subscribe="['isDirty', 'isSubmitting']">
      <template v-for="(field, name) in form.Field" :key="name">
        <!-- TODO: field.type text, or via length, or is multiLine -->
        <form.Input :name="name" :label="name" :field="field" />
      </template>
      <v-btn type="submit">Submit</v-btn>
      <OmegaErrors />

      <QueryResult v-slot="{ latest, refreshing }" :result="result">
        <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
        <div>
          <pre v-html="JSON.stringify(latest, undefined, 2)" />
        </div>
      </QueryResult>
    </OmegaForm>
  </div>
</template>
