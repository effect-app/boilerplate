import Toast from "vue-toastification"

// Import the CSS or use your own!
import "vue-toastification/dist/index.css"

export default defineNuxtPlugin((nuxtApp) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nuxtApp.vueApp.use("default" in Toast ? (Toast as any).default : Toast, {})
})
