import { createAppGatewayService } from './src/host/service.js'
import {
  APP_AUTH_ENDPOINT,
  APP_EXPOSE_ENDPOINT,
  APP_UNEXPOSE_ENDPOINT,
  SERVICE_ACTION_ENDPOINT,
  SERVICE_ADD_ENDPOINT,
  SERVICE_LOGS_ENDPOINT,
  SERVICE_REMOVE_ENDPOINT,
  STATE_ENDPOINT,
  registerBrowserRoutes,
} from './src/host/routes.js'
import {
  APP_GATEWAY_TOOL_NAMES,
  wireHarnessRuntime,
} from './src/host/harness-bridge.js'

export const name = 'app-gateway'

export {
  STATE_ENDPOINT,
  APP_EXPOSE_ENDPOINT,
  APP_AUTH_ENDPOINT,
  APP_UNEXPOSE_ENDPOINT,
  SERVICE_ACTION_ENDPOINT,
  SERVICE_ADD_ENDPOINT,
  SERVICE_REMOVE_ENDPOINT,
  SERVICE_LOGS_ENDPOINT,
  APP_GATEWAY_TOOL_NAMES,
  createAppGatewayService,
}

export function apply(ctx) {
  const logger = ctx.logger ? ctx.logger('app-gateway') : null
  const service = createAppGatewayService({ logger })
  registerBrowserRoutes(ctx, service)
  wireHarnessRuntime(ctx, service, { logger })
}
