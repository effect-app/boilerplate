<script setup lang="ts">
import { HelloWorldRsc } from "#resources"
import { buildFormFromSchema } from "@effect-app/vue/form"
import { S } from "effect-app"

class Input extends S.Class<Input>()({
  title: S.NonEmptyString255,
  name: S.NonEmptyString2k,
  age: S.NonNegativeInt,
  email: S.Email,
}) {}

const state = ref<typeof Input.Encoded>({
  title: "",
  name: "",
  age: 0,
  email: "",
})

const form = buildFormFromSchema(Input, state, v =>
  Promise.resolve(confirm("submitting: " + JSON.stringify(v))),
)

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
  <div>
    Hi world!
    <v-form @submit.prevent="form.submit">
      <template v-for="(field, name) in form.fields" :key="name">
        <!-- TODO: field.type text, or via length, or is multiLine -->
        <!-- <TextArea
          v-if="field.type === 'text' && name === 'name'"
          rows="2"
          :label="name"
          placeholder="name, or company and next line: name"
          v-model="state[name]"
          :field="field"
        /> -->
        <TextField
          v-model="state[name]"
          :label="name"
          :placeholder="name"
          :field="field"
        />
      </template>
    </v-form>

    <QueryResult v-slot="{ latest, refreshing }" :result="result">
      <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
      <div>
        <pre v-html="JSON.stringify(latest, undefined, 2)" />
      </div>
    </QueryResult>
  </div>
</template>
