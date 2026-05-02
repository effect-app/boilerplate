<script setup lang="ts">
import { BlogRsc } from "#resources"
import { S } from "effect-app"

const blogClient = clientFor(BlogRsc)

const createPost = blogClient.CreatePost.wrap(Command.withDefaultToast())
const [r] = blogClient.GetPosts.query()
</script>

<template>
  <div>
    <div>
      a new Title and a new body
      <v-btn
      :disabled="createPost.waiting"
        @click="
            createPost.handle({
              title: S.NonEmptyString255(new Date().toString()),
              body: S.NonEmptyString2k('A body'),
            })
        "
      >
        Create new post
      </v-btn>
    </div>
    Here's a Post List
    <QueryResult
v-slot="{ latest, refreshing }"
:result="r"
>
      <Delayed v-if="refreshing">
<v-progress-circular />
</Delayed>
      <ul>
        <li
v-for="post in latest.items"
:key="post.id"
>
          <nuxt-link :to="{ name: 'blog-id', params: { id: post.id } }">
            {{ post.title }}
          </nuxt-link>
          by {{ post.authorId }}
        </li>
      </ul>
    </QueryResult>
  </div>
</template>