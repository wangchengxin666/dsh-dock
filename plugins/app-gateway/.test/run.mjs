import { readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const SKIP = new Set(['deps.mjs', 'run.mjs'])
const files = readdirSync(TEST_DIR).filter((n) => n.endsWith('.mjs') && !SKIP.has(n)).sort()
for (const file of files) {
  console.log(`\n==> Running ${file}`)
  execFileSync(process.execPath, [join(TEST_DIR, file)], { stdio: 'inherit', env: process.env })
}
console.log(`\nAll ${files.length} app-gateway test files passed.`)
