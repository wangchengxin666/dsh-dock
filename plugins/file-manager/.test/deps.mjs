/**
 * Resolve the plugin's test dependencies from the running DSH installation.
 *
 * The bundle declares `@deepseek-ai/cordis` and `@deepseek-ai/dsh-typert-protocol`
 * as peers and resolves them from DSH at run time. Tests need the same modules
 * without putting a `node_modules` inside the package: a profile links this
 * directory, and pnpm would walk into an in-package `node_modules` and try to
 * chmod files of the read-only installation (EPERM). This loader maps the bare
 * specifiers to the install instead.
 *
 * Import this module first in a check; it registers the hook process-wide.
 */
import { register } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * Locate the DSH installation whose modules the plugin peers resolve to.
 * @returns the absolute installation directory.
 */
function installDir() {
  const candidates = [
    process.env.DSH_INSTALL_DIR,
    '/usr/local/lib/node_modules/@deepseek-ai/dsh',
    // A checkout that runs the tests from its own workspace.
    join(here, '..', '..', '..', '..', '..'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'node_modules', 'zod', 'package.json'))) return candidate
  }
  throw new Error('deps: cannot find the DSH installation; set DSH_INSTALL_DIR')
}

const root = installDir()
/** Bare specifier -> absolute ESM entry point. */
const MAPPING = {
  '@deepseek-ai/cordis': join(root, 'node_modules/@deepseek-ai/cordis/lib/index.js'),
  '@deepseek-ai/dsh-typert-protocol': join(root, 'node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js'),
  '@deepseek-ai/dsh-typert-protocol/remote-info': join(root, 'node_modules/@deepseek-ai/dsh-typert-protocol/lib/types/remote-info.js'),
  'zod': join(root, 'node_modules/zod/index.js'),
}

const source = `
const mapping = ${JSON.stringify(MAPPING)}
export async function resolve(specifier, context, next) {
  if (Object.hasOwn(mapping, specifier)) return { url: new URL('file://' + mapping[specifier]).href, shortCircuit: true }
  return next(specifier, context)
}
`
register('data:text/javascript,' + encodeURIComponent(source))

export { root as dshInstallDir, MAPPING }
