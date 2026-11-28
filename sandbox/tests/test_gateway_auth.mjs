import assert from 'node:assert/strict'
import test from 'node:test'
import * as gatewayAuth from '../rootfs/opt/dsh-gateway-auth/index.js'

test('dsh-gateway-auth admits valid HMAC header + user and rejects spoofed/missing headers', () => {
  const prevSecret = process.env.DSH_GATEWAY_AUTH_SECRET
  const secret = 'a'.repeat(64)
  process.env.DSH_GATEWAY_AUTH_SECRET = secret

  try {
    let registeredProvider = null
    const ownerPeer = { id: 'peer-owner', principal: { kind: 'owner' } }
    const ctx = {
      connection: {
        createPeer(opts) {
          assert.deepEqual(opts, { principal: { kind: 'owner' } })
          return ownerPeer
        },
        authentication: {
          register(provider) {
            registeredProvider = provider
            return async () => {}
          },
        },
      },
      logger: { info() {}, warn() {} },
    }

    gatewayAuth.apply(ctx)
    assert.ok(registeredProvider, 'provider must register on ctx.connection.authentication')

    // Missing header -> rejected
    assert.equal(registeredProvider.authenticate({ headers: {} }), undefined)

    // Wrong secret -> rejected
    assert.equal(
      registeredProvider.authenticate({
        headers: {
          'x-dsh-gateway-auth': 'b'.repeat(64),
          'x-forwarded-user': 'alice@example.com',
        },
      }),
      undefined,
    )

    // Different length secret -> rejected safely without timingSafeEqual RangeError
    assert.equal(
      registeredProvider.authenticate({
        headers: {
          'x-dsh-gateway-auth': 'short',
          'x-forwarded-user': 'alice@example.com',
        },
      }),
      undefined,
    )

    // Valid secret but missing user -> rejected
    assert.equal(
      registeredProvider.authenticate({
        headers: { 'x-dsh-gateway-auth': secret },
      }),
      undefined,
    )

    // Valid Node IncomingHttpHeaders -> admitted
    assert.equal(
      registeredProvider.authenticate({
        headers: {
          'x-dsh-gateway-auth': secret,
          'x-forwarded-user': 'alice@example.com',
        },
      }),
      ownerPeer,
    )

    // Valid Fetch Headers (case-insensitive) -> admitted
    const fetchHeaders = new Headers({
      'X-DSH-Gateway-Auth': secret,
      'X-Auth-Request-Email': 'admin@example.com',
    })
    assert.equal(
      registeredProvider.authenticate({ headers: fetchHeaders }),
      ownerPeer,
    )

    // Valid oauth2-proxy X-Auth-Request-User header -> admitted
    assert.equal(
      registeredProvider.authenticate({
        headers: {
          'x-dsh-gateway-auth': secret,
          'x-auth-request-user': 'alice',
        },
      }),
      ownerPeer,
    )
  } finally {
    if (prevSecret === undefined) delete process.env.DSH_GATEWAY_AUTH_SECRET
    else process.env.DSH_GATEWAY_AUTH_SECRET = prevSecret
  }
})

test('dsh-gateway-auth stays inactive when DSH_GATEWAY_AUTH_SECRET is empty', () => {
  const prevSecret = process.env.DSH_GATEWAY_AUTH_SECRET
  delete process.env.DSH_GATEWAY_AUTH_SECRET
  try {
    let registered = false
    gatewayAuth.apply({
      connection: {
        createPeer() { throw new Error('should not create peer') },
        authentication: {
          register() { registered = true },
        },
      },
      logger: { info() {}, warn() {} },
    })
    assert.equal(registered, false)
  } finally {
    if (prevSecret !== undefined) process.env.DSH_GATEWAY_AUTH_SECRET = prevSecret
  }
})
