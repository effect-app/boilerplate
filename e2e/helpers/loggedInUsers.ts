import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { type Company, isMultiCompanyMode } from "./companyPorts.ts"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseDir = path.resolve(__dirname, "..")

export type LoggedInUsers = { manager: string; user: string }

const filePath = (company?: Company) => {
  const prefix = company ? `storageState.${company}` : "storageState"
  return path.join(baseDir, `${prefix}.users.json`)
}

export const writeLoggedInUsers = (users: LoggedInUsers, company?: Company) => {
  fs.writeFileSync(filePath(company), JSON.stringify(users, null, 2))
}

export const readLoggedInUsers = (company: Company): LoggedInUsers => {
  const p = isMultiCompanyMode() ? filePath(company) : filePath()
  return JSON.parse(fs.readFileSync(p, "utf-8")) as LoggedInUsers
}
