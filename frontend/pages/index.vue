<script setup lang="ts">
import { Effect, S } from "effect-app"
import { mdiSetAll } from "@mdi/js"
import {
  useOmegaForm,
  OmegaForm,
  OmegaErrors,
} from "@effect-app/vue-components"
import type { NonEmptyString255, Email } from "effect-app/Schema"
import { useWithToast } from "~/composables/useWithToast"

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
  },
})

const onReset = () => {
  form.reset()
}

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
const withToast = useWithToast()
const { getHelloWorldQuery, setStateMutation } = useHelloWorld()
const helloWorld = await getHelloWorldQuery.query(req)

// Pros:
// - more standard effect
// - full control
// - "native" apis instead of various mapHandler options, mutation options to configure or disable toasts etc
// - composable
// Cons:
// - have to manually assign the action name
// - have to manually handle the errors and sucesses, loading states etc.
const Mutation = useMutation()

const setState = Mutation.fn("HelloWorld.SetState")(
  function* () {
    const input = { state: new Date().toISOString() }

    yield* Effect.log("before mutate", {
      input,
      span: yield* Effect.currentSpan.pipe(Effect.orDie),
    })

    // Are we sure?
    yield* Mutation.confirmOrInterrupt()
    // simulate slow action to reveal loading/disabled states.
    yield* Effect.sleep(2 * 1000)
    const r = yield* setStateMutation(input)

    yield* Effect.log("after mutate", { r, input })
    return r
  },
  // todo; handle errors, retries, etc.
  // the equivalent of handleMutation in legacy client code.
  // an idea is that we must remove all failures before the end of the composition.
  // (simply by using an error reporter that then removes the errors after reporting..)

  Mutation.withDefaultToast,
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
  Hi world!
  <div>
    <OmegaForm :form="form" :subscribe="['isDirty', 'isSubmitting']">
      <!-- TODO: field.type text, or via length, or is multiLine -->
      <form.Input name="title" label="title" />
      <form.Input name="name" label="name" />
      <form.Input name="age" label="age" />
      <form.Input name="email" label="email" />
      <v-btn type="submit">Submit</v-btn>
      <v-btn type="reset" @click="onReset">Clear</v-btn>
      <OmegaErrors />
    </OmegaForm>

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

    <QueryResult v-slot="{ latest, refreshing }" :result="helloWorld.result">
      <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
      <div>
        <pre v-html="JSON.stringify(latest, undefined, 2)" />
      </div>
    </QueryResult>
  </div>
</template>
