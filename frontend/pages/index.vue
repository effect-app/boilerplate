<script setup lang="ts">
import { HelloWorldRsc } from "#resources"
import { buildFormFromSchema } from "@effect-app/vue/form"
import { Effect, S } from "effect-app"
import { mdiSetAll } from "@mdi/js"

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

// we really have a Command pattern, which is a first class citizen that can be shared between buttons etc.
// considerations
// - i18n for the action name communicated to the user - it is nice when it's shared with the UI, like button text..
// - able to change the input format, e.g no input required.

// we can do two things..
// a) const setStateMutation = useAndHandleMutation(helloWorldClient.SetState, "Set State" /* TODO: i18n */)
//    const setState = setStateMutation(function* (mutate, input) { // auto typed input, i however also a weakness...
//      // do things before
//      yield* mutate(input)
//      // do things after
//    })
//
// b) const setStateMutation = useUnsafeMutation(helloWorldClient.SetState)
//    const setState = Effect.fn("HelloWorld.SetState")(function* (input: HelloWorldRsc.SetState) {
//      // do things before
//      yield* setStateMutation(input)
//      // do things after
//   })
//   // to run
//   run(setState(input), "Set State" /* TODO i18n */) // this now also takes care of error handling/reporting

// todo; check how it would work with Atom

const helloWorldClient = clientFor(HelloWorldRsc)
const [result] = useSafeQuery(helloWorldClient.GetHelloWorld, req)

// todo; we should use the variant that returns an action Result..
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
        yield* confirmOrInterrupt()

        // simulate slow action to reveal loading/disabled states.
        yield* Effect.sleep(2 * 1000)
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
    <!-- TODO switch form to OmegaForm... -->
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

      <v-btn
        :disabled="setStateResult.loading"
        :loading="setStateResult.loading"
        @click="run(setState({ state: new Date().toISOString() }))"
      >
        {{ setState.action }}
      </v-btn>
      <!-- alt -->
      <v-btn
        :disabled="setStateResult.loading"
        :loading="setStateResult.loading"
        :title="setState.action"
        :icon="mdiSetAll"
        @click="run(setState({ state: new Date().toISOString() }))"
      ></v-btn>
    </v-form>

    <QueryResult v-slot="{ latest, refreshing }" :result="result">
      <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
      <div>
        <pre v-html="JSON.stringify(latest, undefined, 2)" />
      </div>
    </QueryResult>
  </div>
</template>
