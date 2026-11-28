import { createWebhookStore } from './src/host/store.js'
import { createWebhookDispatcher } from './src/host/dispatcher.js'
import { startWebhookHttpServer, createWebhookHttpHandler, verifyWebhookRequest } from './src/host/server.js'
import {
  REPLAY_ENDPOINT,
  RULE_DELETE_ENDPOINT,
  RULE_ROTATE_SECRET_ENDPOINT,
  RULE_SAVE_ENDPOINT,
  STATE_ENDPOINT,
  TEST_FIRE_ENDPOINT,
  registerBrowserRoutes,
} from './src/host/routes.js'
import { WEBHOOK_TOOL_NAMES, buildWebhookSkillMarkdown, wireHarnessRuntime } from './src/host/harness-bridge.js'

export const name = 'webhook-triggers'

export {
  STATE_ENDPOINT,
  RULE_SAVE_ENDPOINT,
  RULE_DELETE_ENDPOINT,
  RULE_ROTATE_SECRET_ENDPOINT,
  REPLAY_ENDPOINT,
  TEST_FIRE_ENDPOINT,
  WEBHOOK_TOOL_NAMES,
  buildWebhookSkillMarkdown,
  createWebhookStore,
  createWebhookDispatcher,
  createWebhookHttpHandler,
  verifyWebhookRequest,
}

export function apply(ctx, config = {}) {
  const logger = ctx.logger ? ctx.logger('webhook-triggers') : null
  const listenerPort = Number(config.port || process.env.WEBHOOK_PORT || 4095)
  const store = createWebhookStore({ webhooksDir: config.webhooksDir })
  const dispatcher = createWebhookDispatcher(ctx, store, { logger })

  if (config.listen !== false) {
    startWebhookHttpServer(ctx, {
      store,
      dispatcher,
      logger,
      port: listenerPort,
      host: config.host || '127.0.0.1',
    })
  }

  registerBrowserRoutes(ctx, { store, dispatcher, listenerPort })
  wireHarnessRuntime(ctx, store, { logger })
}
