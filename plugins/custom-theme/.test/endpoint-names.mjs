import assert from 'node:assert/strict'
import { RESET_ENDPOINT, SAVE_ENDPOINT, STATE_ENDPOINT } from '../index.js'

const ENDPOINT_RE = /^\/api\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/

for (const ep of [STATE_ENDPOINT, SAVE_ENDPOINT, RESET_ENDPOINT]) {
  assert.match(ep, ENDPOINT_RE, `Endpoint ${ep} must follow /api/<plugin>.<action> convention`)
}
console.log('endpoint-names ok')
