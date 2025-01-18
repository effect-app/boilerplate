<script setup lang="ts">
import { BlogRsc } from "#Blog/resources"
import { S } from "effect-app"

const blogClient = clientFor(BlogRsc)

const [, createPost] = useSafeMutation(blogClient.CreatePost)
const [r] = useSafeQuery(blogClient.GetPosts)
</script>

<template>
  <div>
    <div>
      a new Title and a new body
      <v-btn
        @click="
          run(
            createPost({
              title: S.NonEmptyString255(new Date().toString()),
              body: S.NonEmptyString2k('A body'),
            }),
          )
        "
      >
        Create new post
      </v-btn>
    </div>
    Here's a Post List
    <QueryResult :result="r" v-slot="{ latest, refreshing }">
      <Delayed v-if="refreshing"><v-progress-circular /></Delayed>
      <ul>
        <li v-for="post in latest.items" :key="post.id">
          <nuxt-link :to="{ name: 'blog-id', params: { id: post.id } }">
            {{ post.title }}
          </nuxt-link>
          by {{ post.author.displayName }}
        </li>
      </ul>
    </QueryResult>
  </div>
</template>