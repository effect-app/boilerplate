export default defineEventHandler(() => {
  const config = useRuntimeConfig()
  return {
    version: config.public.feVersion
  }
})
