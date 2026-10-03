// LOL https://nuxt.com/blog/v3-13#vue-typescript-changes
import type { ComponentCustomOptions as _ComponentCustomOptions, ComponentCustomProperties as _ComponentCustomProperties } from "vue"

declare module "@vue/runtime-core" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ComponentCustomProperties extends _ComponentCustomProperties {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ComponentCustomOptions extends _ComponentCustomOptions {}
}
