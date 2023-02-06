import { Operations } from "@/services.js"
import { OperationsRsc } from "@effect-app-boilerplate/resources"

const { controllers, matchWithServices } = matchFor(OperationsRsc)

const Find = matchWithServices("Find")(
  { Operations },
  ({ id }, { Operations }) => Operations.find(id).map(_ => _.getOrNull)
)

export const OperationsControllers = controllers(Effect.struct({ Find }))
