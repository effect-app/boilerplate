<script setup lang="ts">
import { User } from "#models/User"
import * as AccountsRsc from "#resources/Accounts"
import { AsyncResult } from "@effect-app/vue"
import { VueQueryDevtools } from "@tanstack/vue-query-devtools"
import { pipe } from "effect-app/Function"
import * as Option from "effect-app/Option"
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
    <v-app-bar>
      <v-app-bar-title>
        <NuxtLink :to="{ name: 'index' }">
          Home
        </NuxtLink>
      </v-app-bar-title>

      <div>{{ router.currentRoute.value.name }}</div>
      &nbsp;
      <QueryResult :result="userResult">
        <template #default="{ latest }">
          <div>{{ User.displayName(latest) }}</div>
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
