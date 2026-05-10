import * as Option from "effect-app/Option"
// import { UsersRsc } from "#resources"
import { makeHeadersHashMap, makeRuntime } from "./shared.js"

const baseUrl = process.env["BASE_URL"] ?? "http://localhost:4000"

export function makeRuntimes(namespace: string) {
  const apiUrl = `${baseUrl}/api/api`
  const { runtime: anonRuntime } = makeRuntime(
    {
      apiUrl,
      headers: Option.some(makeHeadersHashMap(namespace))
    }
  )

  // const { runtime: managerRuntime } = makeRuntime(
  //   {
  //     apiUrl,
  //     headers: Option.some(makeHeadersHashMap(namespace, "manager"))
  //   }
  // )
  // const { runtime: userRuntime } = makeRuntime(
  //   {
  //     apiUrl,
  //     headers: Option.some(makeHeadersHashMap(namespace, "user"))
  //   }
  // )

  return {
    anonRuntime
    // managerRuntime,
    // userRuntime
  }
}
