export default defineEventHandler((event) => {
  setCookie(event, "user-id", event.context.params!["userId"]!)
  return sendRedirect(event, "/")
})
