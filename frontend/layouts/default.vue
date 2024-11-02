<script setup lang="ts">
import { MeRsc } from "resources"
import { onMounted } from "vue"
import { useRouter } from "vue-router"
import { VueQueryDevtools } from "@tanstack/vue-query-devtools"
import { Result } from "~/composables/client"

const meClient = clientFor(MeRsc)
const [userResult, currentUser, getCurrentUser] = useSafeQuery(meClient.GetMe)

const appConfig = {
  title: "@effect-app/boilerplate",
}

useHead({
  title: appConfig.title,
})

const router = useRouter()

onMounted(() => {
  if (getUserId()) {
    run(getCurrentUser())
  }
})
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
      <div v-if="Result.isInitial(userResult)">Loading...</div>
      <div v-else>
        <span v-if="currentUser">{{ currentUser.displayName }}</span>
        <span v-else>
          <a href="/login/No3o_xbwEh8z2gSbcantz">Login</a>
        </span>
      </div>
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