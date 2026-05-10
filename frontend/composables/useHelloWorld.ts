import * as HelloWorldRsc from "#resources/HelloWorld"
import { clientFor } from "./client"

export const useHelloWorld = () => {
  const client = clientFor(HelloWorldRsc)

  return { ...client.helpers, client }
}
