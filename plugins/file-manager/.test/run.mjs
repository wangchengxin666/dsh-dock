/** Runs the package's checks in order and reports the exit code. */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
let failed = 0
for (const file of ['behaviour.mjs', 'client-flow3.mjs', 'bundle-load.mjs', 'client-live.mjs', 'host-live.mjs', 'icon-check.mjs', 'locale-check.mjs', 'sidebar-row.mjs', 'endpoint-names.mjs']) {
  const path = fileURLToPath(new URL(file, import.meta.url))
  const result = spawnSync(process.execPath, [path], { encoding: 'utf8' })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  if (result.status !== 0) { failed += 1; console.log(`FAIL ${file}`) }
}
console.log(failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK FILE(S) FAILED`)
process.exitCode = failed === 0 ? 0 : 1
