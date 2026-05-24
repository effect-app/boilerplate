import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import { type Page } from "playwright"
import { type Company } from "./companyPorts.ts"
import { makeHeaders, makeRuntime } from "./shared.ts"

type Runtime = Awaited<ReturnType<typeof makeRuntime>>

// const baseUrl = process.env["BASE_URL"] ?? "http://localhost:5500"

export class E2EContext extends Context.Service<E2EContext, { namespace: string }>()("E2EContext") {}

export const makeAnonRuntime = async (namespace: string, port = 5001, company?: Company) => {
  const apiUrl = process.env["API_URL"] ?? "http://localhost:" + port
  const url = apiUrl
  const runtime = await makeRuntime(
    namespace,
    {
      url,
      headers: Option.some(makeHeaders(namespace, port, undefined, company))
    }
  )

  return runtime
}

async function makeRuntimes_(namespace: string, page?: Page, port = 5001, company?: Company) {
  // console.log("Making runtimes for namespace:", namespace)

  const apiUrl = process.env["API_URL"] ?? "http://localhost:" + port
  const url = apiUrl
  const anonRuntime = await makeRuntime(
    namespace,
    {
      url,
      headers: Option.some(makeHeaders(namespace, port, undefined, company))
    }
  )

  const managerRuntime = await makeRuntime(
    namespace,
    {
      url,
      headers: Option.some(makeHeaders(namespace, port, "manager", company))
    }
  )
  const userRuntime = await makeRuntime(
    namespace,
    {
      url,
      headers: Option.some(makeHeaders(namespace, port, "user", company))
    }
  )

  const extras: Runtime[] = []
  const makeRuntimeWithHeaders = async (
    role: "user" | "manager" | undefined,
    extraHeaders: Record<string, string> = {}
  ) => {
    const rt = await makeRuntime(namespace, {
      url,
      headers: Option.some({ ...makeHeaders(namespace, port, role, company), ...extraHeaders })
    })
    extras.push(rt)
    return rt
  }

  const setupPage = (page: Page) =>
    page.setExtraHTTPHeaders({
      "x-store-id": namespace,
      "x-port": port.toString(),
      "x-e2e-print-skip": "1"
    })

  if (page) await setupPage(page)

  const allRuntimes = () => [anonRuntime, managerRuntime, userRuntime, ...extras]
  const dispose = () =>
    Effect.runSync(
      Effect.all(allRuntimes().map((_) => _.disposeEffect), { discard: true })
    )
  const disposeAsync = async () => {
    await Promise.all(allRuntimes().map((_) => _.dispose()))
  }

  const r = {
    anonRuntime,
    managerRuntime,
    userRuntime,
    makeRuntime: makeRuntimeWithHeaders,
    setupPage,
    [Symbol.dispose]() {
      return dispose()
    },
    [Symbol.asyncDispose]() {
      return disposeAsync()
    }
  }

  return r
}

export const makeRuntimes = (namespace: string, page: Page, port = 5001, company?: Company) =>
  makeRuntimes_(namespace, page, port, company)
export const makeRuntimesNoSetup = (namespace: string, port = 5001, company?: Company) =>
  makeRuntimes_(namespace, undefined, port, company)

export type Runtimes = Awaited<ReturnType<typeof makeRuntimes_>>
