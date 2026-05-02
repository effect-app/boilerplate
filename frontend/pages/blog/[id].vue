<script setup lang="ts">
import { BlogRsc } from "#resources"
import type { ClientEvents } from "#resources"
import { BlogPostId } from "#models/Blog"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

const { id } = useRouteParams({ id: BlogPostId })

const blogClient = clientFor(BlogRsc)

const [r] = blogClient.FindPost.query({
  id,
})

const bogusOutput = ref<ClientEvents>()

onMountedWithCleanup(() => {
  const callback = (_: ClientEvents) => {
    bogusOutput.value = _
  }
  bus.on("serverEvents", callback)
  return () => {
    bus.off("serverEvents", callback)
  }
})

const [publishResult, publishStream] = blogClient.PublishPost.mutateStream

const progress = computed(() => {
  const v = publishResult.value
  if (AsyncResult.isSuccess(v) && v.value._tag === "PublishProgress") {
    return `${v.value.completed}/${v.value.total}`
  }
  return ""
})

const publish = Command.fn(blogClient.PublishPost)(function* ({ id }: { id: BlogPostId }) {
  yield* publishStream({ id })
}, Command.withDefaultToast())
</script>

<template>
  <div v-if="bogusOutput">
    The latest bogus event is: {{ bogusOutput.id }} at {{ bogusOutput.at }}
  </div>
  <QueryResult :result="r" v-slot="{ latest, refreshing }">
    <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
    <div>
      <v-btn @click="publish.handle({ id })" :disabled="publish.waiting">
        Publish to all blog sites
        {{ publish.waiting ? `(${progress})` : "" }}
      </v-btn>
      <div>Title: {{ latest.title }}</div>
      <div>Body: {{ latest.body }}</div>
      by {{ latest.author.displayName }}
    </div>
  </QueryResult>
</template>
