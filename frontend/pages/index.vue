<script setup lang="ts">
import { HelloWorldRsc } from "#resources"
import { buildFormFromSchema } from "@effect-app/vue/form"
import { Effect, S } from "effect-app"

class Input extends S.Class<Input>("Input")({
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
const [setStateResult, setState] = useAndHandleMutation(
  helloWorldClient.SetState,
  "Set State",
  {
    mapHandler: (mutate, input) =>
      Effect.gen(function* () {
        yield* Effect.log("before mutate", {
          input,
          span: yield* Effect.currentSpan.pipe(Effect.orDie),
        })
        const r = yield* mutate // TODO: expect input, so we can add/customise it?
        yield* Effect.log("after mutate", { r, input })
        return r
      }),
  },
)

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
      <v-btn @click="run(setState({ state: new Date().toISOString() }))">
        Update State
      </v-btn>
    </v-form>

    <QueryResult v-slot="{ latest, refreshing }" :result="result">
      <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
      <div>
        <pre v-html="JSON.stringify(latest, undefined, 2)" />
      </div>
    </QueryResult>
  </div>
</template>
