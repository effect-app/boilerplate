import type { Schema } from "@effect-app/schema"
import { typedKeysOf } from "@effect-app/prelude/utils"
import {
  parseRouteParams,
  parseRouteParamsOption,
} from "@effect-app/vue/routeParams"
import { Option } from "~~/utils/prelude"
import { useRoute } from "nuxt/app"

export const useRouteParams = <NER extends Record<string, Schema<any, any>>>(
  t: NER, // enforce non empty
) => {
  const r = useRoute()
  const result = parseRouteParams(r.params, t)
  return result
}

export const useRouteParamsOption = <
  NER extends Record<string, Schema<any, any>>,
>(
  t: NER, // enforce non empty
) => {
  const r = useRoute()
  const result = parseRouteParamsOption(r.params, t)
  type Result = typeof result
  return typedKeysOf(result).reduce(
    (prev, cur) => {
      prev[cur] = Option.getOrUndefined(result[cur])
      return prev
    },
    {} as Record<keyof Result, unknown>,
  ) as unknown as {
    [K in keyof Result]: Result[K] extends Option.Option<infer A>
      ? A | undefined
      : never
  }
}
export * from "@effect-app/vue/routeParams"
