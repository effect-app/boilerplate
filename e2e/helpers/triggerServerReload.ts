import * as fs from "fs/promises"

const content = `STORAGE_URL="mem://"`

export const triggerServerReload = () => fs.writeFile("../main/.env.local", content)
