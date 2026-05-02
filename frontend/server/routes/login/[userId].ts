export default defineEventHandler((event) => {
  setCookie(event, "user-id", decodeURIComponent(event.context.params!["userId"]!))
  return sendRedirect(event, "/")
})
