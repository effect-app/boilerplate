<script setup lang="ts">
import { useOmegaForm } from "@effect-app/vue-components"
import { mdiSetAll } from "@mdi/js"
import { Effect, S } from "effect-app"
import type { Email, NonEmptyString255 } from "effect-app/Schema"
import { useHelloWorld } from "~/composables/useHelloWorld"

const state = S.Struct({
  title: S.NonEmptyString255,
  name: S.NonEmptyString2k,
  age: S.NonNegativeInt,
  email: S.Email
})

const form = useOmegaForm(state, {
  defaultValues: {
    title: "",
    name: "",
    age: 0,
    email: ""
  },
  onSubmit: async ({ value }: { value: typeof state.Encoded }) => {
    const trimmedValue = {
      title: value.title.trim() as NonEmptyString255,
      name: value.name.trim() as NonEmptyString255,
      age: value.age,
      email: value.email.trim() as Email
    }
    await Promise.resolve(
      confirm("submitting: " + JSON.stringify(trimmedValue))
    )
  }
})

const onReset = () => {
  form.reset()
}

const makeReq = () => ({
  echo: "Echo me at: " + new Date().getTime()
})

const req = ref(makeReq())

const { getHelloWorldQuery, setStateMutation } = useHelloWorld()
const [helloWorld] = await getHelloWorldQuery(req)

const setState = setStateMutation.fn(
  function*(fail: boolean) {
    // all state happens to be generated within the command but you're free to accept whichever parameters you like
    const input = { state: new Date().toISOString(), fail }

    yield* Effect.log("before mutate", {
      input,
      span: yield* Effect.currentSpan.pipe(Effect.orDie)
    })

    // Are we sure?
    yield* Command.confirmOrInterrupt()

    // act if we are sure
    const r = yield* setStateMutation(input)
    // simulate slow action to reveal loading/disabled states.
    yield* Effect.sleep(2 * 1000)

    yield* Effect.log("after mutate", { r, input })
    // Do something... route somewhere, close a dialog, etc

    return r
  },
  Command.withDefaultToast()
  // defects etc are auto reported
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
    <form.Form :subscribe="['isDirty', 'isSubmitting']">
      <!-- TODO: field.type text, or via length, or is multiLine -->
      <form.Input
        name="title"
        label="title"
      />
      <form.Input
        name="name"
        label="name"
      />
      <form.Input
        name="age"
        label="age"
      />
      <form.Input
        name="email"
        label="email"
      />
      <v-btn type="submit">
        Submit
      </v-btn>
      <v-btn
        type="reset"
        @click="onReset"
      >
        Clear
      </v-btn>
      <form.Errors />
    </form.Form>

    <CommandButton
      :command="setState"
      :input="[false]"
    />
    <!-- alt -->
    <CommandButton
      :command="setState"
      empty
      :icon="mdiSetAll"
      :input="[false]"
    />

    <CommandButton
      :command="setState"
      :input="[true]"
    >
      Fail test
    </CommandButton>

    <QueryResult
      v-slot="{ latest, refreshing }"
      :result="helloWorld"
    >
      <Delayed v-if="refreshing">
        <v-progress-circular />
      </Delayed>
      <div>
        <pre v-html="JSON.stringify(latest, undefined, 2)" />
      </div>
    </QueryResult>
  </div>
</template>
