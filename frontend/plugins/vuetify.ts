import { defineNuxtPlugin } from "#imports"
import { createVuetify } from "vuetify"
import * as components from "vuetify/components"
import * as directives from "vuetify/directives"
import { aliases, mdi } from "vuetify/iconsets/mdi-svg"

import "vuetify/styles"

export default defineNuxtPlugin((nuxtApp) => {
  const vuetify = createVuetify({
    theme: {
      defaultTheme: "dark",
      themes: {
        dark: {
          colors: {
            primary: "#EBF857",
            secondary: "#03A9F4",
            warning: "#E91E63"
          }
        }
      },
      variations: {
        colors: ["primary", "secondary"],
        lighten: 1,
        darken: 2
      }
    },
    components,
    directives,
    icons: {
      defaultSet: "mdi",
      aliases,
      sets: {
        mdi
      }
    },
    display: {
      thresholds: {
        xs: 340,
        sm: 540,
        md: 800,
        lg: 1280
      }
    }
  })

  nuxtApp.vueApp.use(vuetify)
})
