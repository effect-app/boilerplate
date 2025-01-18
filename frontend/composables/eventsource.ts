import ReconnectingEventSource from "reconnecting-eventsource"
import { bus } from "./bus"
import { onMountedWithCleanup } from "./onMountedWithCleanup"
import { S } from "effect-app"
import { ClientEvents } from "#resources/Events"

const parseEvent = S.decodeUnknownSync(ClientEvents)

function listener(message: MessageEvent<string>) {
  const evt = parseEvent(JSON.parse(message.data))
  bus.emit("serverEvents", evt)
}

function makeSource() {
  const src = new ReconnectingEventSource("/api/api/events")
  src.addEventListener("message", listener)
  return src
}

export function useApiEventSource() {
  onMountedWithCleanup(() => {
    const source = makeSource()

    return () => {
      console.log("$closing source")
      source.removeEventListener("message", listener)
      source.close()
    }
  })
}
