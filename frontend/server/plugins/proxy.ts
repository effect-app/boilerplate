import * as cookie from "cookie"
import type httpProxyTypes from "http-proxy"
import httpProxy from "http-proxy-node16" // make sure to use package redirect to "http-proxy-node16" for fixing closing event: https://github.com/http-party/node-http-proxy/pull/1559

const proxy = httpProxy as unknown as typeof httpProxyTypes
export default defineNitroPlugin((nitroApp) => {
  const config = useRuntimeConfig()

  const otlpProxy = proxy.createProxyServer({
    changeOrigin: true, // don't forget this, or you're going to chase your tail for hours
    target: "http://localhost:4318",
    timeout: 1_000
  })

  otlpProxy.on("proxyReq", (proxyReq) => {
    proxyReq.path = "/v1/traces"
  })

  const apiProxy = proxy.createProxyServer({
    changeOrigin: true, // don't forget this, or you're going to chase your tail for hours
    target: config.apiRoot
  })

  apiProxy.on("proxyReq", (proxyReq, _, res) => {
    proxyReq.path = proxyReq.path.replace("/api/api", "")
    res.setHeader("x-fe-version", config.public.feVersion)

    const cookieHeader = proxyReq.getHeader("Cookie")
    if (!cookieHeader || typeof cookieHeader !== "string") return

    const cookies = cookie.parse(cookieHeader)
    const userId = cookies["user-id"]
    if (userId) {
      proxyReq.setHeader(
        "x-user",
        JSON.stringify({ sub: userId, "https://nomizz.com/roles": ["user"] })
      )
    }
  })

  nitroApp.h3App.stack.unshift({
    route: "/api/api",
    handler: fromNodeMiddleware((req, res, _) => {
      apiProxy.web(req, res)
    })
    // handler: async event => {
    //   let accessToken: string | undefined = undefined
    //   try {
    //     const jwt = await getToken({ event })
    //     if (jwt) {
    //       accessToken = jwt.access_token as string | undefined
    //     }
    //   } catch (error) {
    //     console.error(error)
    //   }
    //   return await fromNodeMiddleware((req, res, _) => {
    //     if (accessToken) {
    //       req.headers["authorization"] = "Bearer " + accessToken
    //     }
    //     return apiProxy.web(req, res)
    //   })(event)
    // },
  })
  nitroApp.h3App.stack.unshift({
    route: "/api/traces",
    handler: fromNodeMiddleware((req, res, _) => {
      otlpProxy.web(req, res, { timeout: 1_000 })
    })
  })
})
