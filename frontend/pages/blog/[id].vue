<script setup lang="ts">
import { BlogRsc } from "#resources"
import type { ClientEvents } from "#resources"
import { BlogPostId } from "#models/Blog"

const { id } = useRouteParams({ id: BlogPostId })

const blogClient = clientFor(BlogRsc)
const opsClient = useOperationsClient()

const [r, , reloadPost] = blogClient.FindPost.query({
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

const progress = ref("")

const pub = useMutation(
  mapHandler(
    blogClient.PublishPost,
    opsClient.refreshAndWaitForOperation(reloadPost(), op => {
      progress.value = `${op.progress?.completed}/${op.progress?.total}`
    }),
  ),
)
const publish = Command.fn(blogClient.PublishPost)(function* ({ id }: { id: BlogPostId }) {
  return yield* pub({ id })
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