<script setup lang="ts">
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
//    const setState = Effect.fn("HelloWorld.SetState" /* this is duplicate with HelloWorldRsc.SetState auto derived name */)(function* (input: HelloWorldRsc.SetState) {
//      // do things before
//      yield* setStateMutation(input)
//      // do things after
//   })
//   // to run
//   run(setState(input), "Set State" /* TODO i18n */) // this now also takes care of error handling/reporting

// todo; check how it would work with Atom
const { getHelloWorldQuery, setStateMutation } = useHelloWorld()
const helloWorld = await getHelloWorldQuery.query(req)

// Pros:
// - more standard effect
// - "native" apis instead of various mapHandler options
// - reuses the Action name / span from the API client action
// Cons:
// - not composable
// - don't control the toasts / error handling, except perhaps via options
const setState = setStateMutation.with(
  mutate =>
    function* () {
      const input = { state: new Date().toISOString() }

      yield* Effect.log("before mutate", {
        input,
        span: yield* Effect.currentSpan.pipe(Effect.orDie),
      })
      yield* confirmOrInterrupt()

      // simulate slow action to reveal loading/disabled states.
      yield* Effect.sleep(2 * 1000)
      const r = yield* mutate(input)

      yield* Effect.log("after mutate", { r, input })
      return r
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
        :disabled="setState.waiting"
        :loading="setState.waiting"
        @click="setState.mutate"
      >
        {{ setState.action }}
      </v-btn>
      <!-- alt -->
      <v-btn
        :disabled="setState.waiting"
        :loading="setState.waiting"
        :title="setState.action"
        :icon="mdiSetAll"
        @click="setState.mutate"
      ></v-btn>
      <!-- TODO: a form example where we get some state from router, from function, and from form -->
    </v-form>

    <QueryResult v-slot="{ latest, refreshing }" :result="helloWorld.result">
      <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
      <div>
        <pre v-html="JSON.stringify(latest, undefined, 2)" />
      </div>
    </QueryResult>
  </div>
</template>
