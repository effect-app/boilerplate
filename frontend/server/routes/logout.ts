export default defineEventHandler((event) => {
  deleteCookie(event, "user-id")
  return sendRedirect(event, "/")
})
