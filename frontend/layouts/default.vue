<script setup lang="ts">
import { AccountsRsc } from "#resources"
import { VueQueryDevtools } from "@tanstack/vue-query-devtools"
import { useRouter } from "vue-router"

const accountsClient = clientFor(AccountsRsc)
const [userResult] = accountsClient.GetMe.query()

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
      </v-app-bar-title>

      <div>{{ router.currentRoute.value.name }}</div>
      &nbsp;
      <QueryResult :result="userResult">
        <template #default="{ latest }">
          <div>{{ latest.displayName }}</div>
          <div><a href="/logout">Logout</a></div>
        </template>
        <template #error>
          <a href="/login/No3o_xbwEh8z2gSbcantz">Login</a>
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
