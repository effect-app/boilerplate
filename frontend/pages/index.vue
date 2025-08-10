<script setup lang="ts">
import { HelloWorldRsc } from "#resources"
import { buildFormFromSchema } from "@effect-app/vue/form"
import { S } from "effect-app"
import { Atom, AtomRpc, useAtomSet, useAtomValue } from "@effect-atom/atom-vue"
import { makeRpcGroup } from "effect-app/client"
import { RpcClientProtocolLayers } from "~/lib"

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

const helloWorldRpcs = makeRpcGroup(HelloWorldRsc)
const helloWorldAtom = AtomRpc.make(helloWorldRpcs, {
  runtime: Atom.runtime(RpcClientProtocolLayers("/HelloWorld")),
})

const result = useAtomValue(() => {
  console.log("Recomputing HelloWorld.GetHelloWorld atom with:", req.value)
  return Atom.refreshOnWindowFocus(
    helloWorldAtom.query("HelloWorld.GetHelloWorld", req.value, {
      reactivityKeys: ["echo"],
    }),
  )
})

const increment = useAtomSet(() => helloWorldAtom.mutation("HelloWorld.Set"))
const test = () =>
  increment({ payload: { echo: "test" }, reactivityKeys: { echo: ["echo"] } })

// const mutation = Effect.fn("MySpan")(function* () {
//   yield* Effect.logInfo("doing something")
//   increment({ payload: { echo: "test" }, reactivityKeys: { echo: ["echo"] } })
// })

// onMounted(() => {
//   setInterval(() => {
//     // Fallback to the default focus check
//     focusManager.setFocused(false)

//     // Override the default focus state
//     focusManager.setFocused(true)
//   }, 2000)
// })

onMounted(() => {
  const t = setInterval(() => (req.value = makeReq()), 10_000)
  return () => clearInterval(t)
})
</script>

<template>
  <div>
    Hi world!
    <v-btn @click="test()">Test</v-btn>
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
