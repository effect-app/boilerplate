<script setup lang="ts">
import { AccountsRsc } from "#resources"
import { AsyncResult } from "@effect-app/vue"
import { VueQueryDevtools } from "@tanstack/vue-query-devtools"
import { Option, pipe } from "effect-app"
import { useRouter } from "vue-router"

const accountsClient = clientFor(AccountsRsc)
const [userResult] = accountsClient.GetMe.query()
const [usersResult] = accountsClient.Index.query()

const firstUserId = computed(() =>
  pipe(
    AsyncResult.value(usersResult.value),
    Option.flatMapNullishOr((users) => users[0]?.id),
    Option.getOrNull
  )
)

const appConfig = {
  title: "@effect-app/boilerplate"
}

useHead({
  title: appConfig.title
})

const router = useRouter()
</script>

<template>
  <v-app>
    <v-app-bar app>
      <v-app-bar-title>
        <NuxtLink :to="{ name: 'index' }">
          Home
        </NuxtLink>
        |
        <NuxtLink :to="{ name: 'blog' }">Blog</NuxtLink>
      </v-app-bar-title>

      <div>{{ router.currentRoute.value.name }}</div>
      &nbsp;
      <QueryResult :result="userResult">
        <template #default="{ latest }">
          <div>{{ latest.displayName }}</div>
          <div><a href="/logout">Logout</a></div>
        </template>
        <template #error>
          <a
            v-if="firstUserId"
            :href="`/login/${encodeURIComponent(firstUserId)}`"
          >Login</a>
          <span v-else>No users available</span>
        </template>
      </QueryResult>
    </v-app-bar>
    <v-main>
      <ErrorBoundary>
        <slot />
      </ErrorBoundary>
    </v-main>

    <v-footer app>
      <!-- -->
    </v-footer>
    <VueQueryDevtools />
  </v-app>
</template>
