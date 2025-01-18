import type { ClientEvents } from "#resources/Events"
import mitt from "mitt"

type Events = {
  serverEvents: ClientEvents
}

export const bus = mitt<Events>()
