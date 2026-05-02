export default defineNuxtRouteMiddleware((_) => {
  const userId = getUserId()

  if (!userId.value) {
    return navigateTo("/login")
  }
})
