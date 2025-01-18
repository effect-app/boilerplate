<script setup lang="ts">
import { useRouter } from "vue-router"
import { VueQueryDevtools } from "@tanstack/vue-query-devtools"
import { AccountsRsc } from "#Accounts/resources"

const accountsClient = clientFor(AccountsRsc)
const [userResult] = useSafeQuery(accountsClient.GetMe)

const appConfig = {
  title: "@effect-app/boilerplate",
}

useHead({
  title: appConfig.title,
})

const router = useRouter()
</script>

<template>
  <v-app>
    <v-app-bar app>
      <v-app-bar-title>
        <NuxtLink :to="{ name: 'index' }">Home</NuxtLink>
        |
        <NuxtLink :to="{ name: 'blog' }">Blog</NuxtLink>
      </v-app-bar-title>

      <div>{{ router.currentRoute.value.name }}</div>
      &nbsp;
      <QueryResult :result="userResult">
        <template v-slot="{ latest }">
          <div>{{ latest.displayName }}</div>
          <div><a href="/logout">Logout</a></div>
        </template>
        <template #error>
          <a href="/login/No3o_xbwEh8z2gSbcantz">Login</a>
        </template>
      </QueryResult>
    </v-app-bar>
    <v-main>
      <slot />
    </v-main>

    <v-footer app>
      <!-- -->
    </v-footer>
    <VueQueryDevtools />
  </v-app>
</template>