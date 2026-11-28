import { createSelfEvolveService } from './src/host/service.js'
import {
  LESSON_ADD_ENDPOINT,
  ROLLBACK_ENDPOINT,
  SKILL_DELETE_ENDPOINT,
  SKILL_SAVE_ENDPOINT,
  STATE_ENDPOINT,
  registerBrowserRoutes,
} from './src/host/routes.js'
import {
  SELF_EVOLVE_TOOL_NAMES,
  buildSelfEvolveSkillMarkdown,
  wireHarnessRuntime,
} from './src/host/harness-bridge.js'

export const name = 'self-evolve'

export {
  STATE_ENDPOINT,
  SKILL_SAVE_ENDPOINT,
  SKILL_DELETE_ENDPOINT,
  LESSON_ADD_ENDPOINT,
  ROLLBACK_ENDPOINT,
  SELF_EVOLVE_TOOL_NAMES,
  buildSelfEvolveSkillMarkdown,
  createSelfEvolveService,
}

export function apply(ctx) {
  const logger = ctx.logger ? ctx.logger('self-evolve') : null
  const service = createSelfEvolveService({ logger })
  registerBrowserRoutes(ctx, service)
  wireHarnessRuntime(ctx, service, { logger })
}
