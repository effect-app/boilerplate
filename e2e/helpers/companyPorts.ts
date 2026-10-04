export const companyPorts = {
  default: { api: 3610, fe: 4000 }
} as const

export type Company = keyof typeof companyPorts

export const companies = Object.keys(companyPorts) as Company[]

export const isMultiCompanyMode = () => false

export const detectCompany = (_testInfo?: { file: string; project: { name: string } }): Company => "default"

const portFromEnv = (name: string): number | undefined => {
  const value = process.env[name]
  if (!value) return undefined
  const port = Number.parseInt(value, 10)
  return Number.isFinite(port) ? port : undefined
}

export const getPortsForCompany = (_company: Company) => ({
  api: portFromEnv("E2E_API_PORT") ?? companyPorts.default.api,
  fe: portFromEnv("E2E_FE_PORT") ?? companyPorts.default.fe
})

export const resolveStorageStateName = (fileName: string, _company: Company): string => fileName
