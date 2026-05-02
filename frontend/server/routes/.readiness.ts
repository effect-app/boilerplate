export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const r = await Promise.all([
    fetch(`${config.apiRoot}/.well-known/local/server-health`)
  ])
  if (r.some((_) => !_.ok)) {
    console.error("$$$ readiness check failed", r)
    event.node.res.statusCode = 503
  } else {
    event.node.res.statusCode = 200
  }
  event.node.res.end()
})
