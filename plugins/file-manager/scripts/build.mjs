#!/usr/bin/env node
/** Rebuild `client.js` from the page sources, then run the local checks. */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const bundle = spawnSync(process.execPath, [join(root, 'scripts/bundle-client.mjs')], { stdio: 'inherit' })
if (bundle.status !== 0) process.exit(bundle.status ?? 1)
const checks = spawnSync(process.execPath, [join(root, '.test/run.mjs')], { stdio: 'inherit' })
process.exit(checks.status ?? 0)
