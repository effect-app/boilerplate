import { HelloWorldRsc } from "#resources"

export const useHelloWorld = () => {
  const client = clientFor(HelloWorldRsc)

  return client.helpers
}
