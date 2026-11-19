import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { PLUGIN_DIR, importExternal } from './deps.mjs'
import { createMeshController } from '../src/client/mesh-controller.js'
import {
  copyTextToClipboard,
  createMeshChatPage,
  createMeshSettingsPage,
  detectComposerTrigger,
} from '../src/client/mesh-page.js'
import { canStartNewTopic, parsePairInvite, resolveBrowserOriginUrl } from '../src/shared/protocol.js'
import { MESH_CSS } from '../src/client/styles.js'

const { Context, Service } = await importExternal('@deepseek-ai/cordis')
const React = (await importExternal('react')).default || await importExternal('react')
const ReactDOMServer = await importExternal('react-dom/server')

// 1. Test @ and # trigger detection + Chat Main View vs Settings Pairing View separation
{
  assert.deepEqual(detectComposerTrigger('Hello @bob'), {
    trigger: '@',
    query: 'bob',
    replaceStart: 6,
  })
  assert.deepEqual(detectComposerTrigger('Check #README.md'), {
    trigger: '#',
    query: 'README.md',
    replaceStart: 6,
  })
  assert.equal(detectComposerTrigger('Normal text '), null)

  const mockServerState = {
    self: {
      slug: 'alice',
      ownerName: 'Alice',
      ownerEmail: 'alice@example.com',
      publicOrigin: 'https://dock.example.com',
      basePath: '/s/alice',
      meshPort: 4090,
      endpointUrl: 'https://dock.example.com/s/alice/p/4090',
    },
    activeInvite: {
      codeId: 'k8F9mP',
      shortCode: 'alice.k8F9mP2xQ7vL4nR1wZ3y',
      inviteUri: 'https://dock.example.com/s/alice/p/4090#pair=alice.k8F9mP2xQ7vL4nR1wZ3y',
      expiresAt: Date.now() + 300_000,
    },
    peers: [
      {
        slug: 'bob',
        ownerName: 'Bob',
        ownerEmail: 'bob@example.com',
        endpointUrl: 'https://dock.example.com/s/bob/p/4090',
        status: 'online',
      },
    ],
    rooms: [
      {
        id: 'pair:alice:bob',
        type: 'pair',
        name: 'Bob (bob)',
        peerSlug: 'bob',
        members: [
          { slug: 'alice', ownerName: 'Alice', endpointUrl: 'https://dock.example.com/s/alice/p/4090' },
          { slug: 'bob', ownerName: 'Bob', endpointUrl: 'https://dock.example.com/s/bob/p/4090' },
        ],
        unreadCount: 1,
      },
    ],
    messages: {
      'pair:alice:bob': [
        {
          id: 'msg_1',
          roomId: 'pair:alice:bob',
          sender: { slug: 'bob', ownerName: 'Bob', actor: 'agent' },
          kind: 'task',
          text: '@alice-agent Ready to sync database schema',
          hop: 1,
          wakeAgent: true,
          delivery: { deliveredTo: ['alice'], pendingPeers: [] },
          createdAt: Date.now(),
        },
      ],
    },
    outboxCount: 0,
    maxAgentHops: 3,
  }

  const controller = createMeshController({
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, state: mockServerState }), { status: 200 }),
  })

  await controller.syncFromHost()
  assert.equal(controller.getSnapshot().state.self.slug, 'alice')
  assert.equal(controller.getSnapshot().selectedRoomId, 'pair:alice:bob')

  // Verify Left-Sidebar Chat Main Page is pure chat + group creation + unified @/# composer (NO pairing box)
  const ChatPage = createMeshChatPage({
    React,
    controller,
    getLocale: () => 'zh-CN',
    subscribeLocale: () => () => {},
  })
  const chatHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(ChatPage, {}))
  assert.ok(chatHtml.includes('协作会话'))
  assert.ok(chatHtml.includes('+ 建群'))
  assert.ok(chatHtml.includes('Bob (bob)'))
  assert.ok(chatHtml.includes('新话题'))
  assert.ok(chatHtml.includes('sm-inline-mention'))
  assert.ok(chatHtml.includes('<svg'))
  assert.ok(chatHtml.includes('@alice-agent'))
  assert.ok(chatHtml.includes('Ready to sync database schema'))
  assert.ok(chatHtml.includes('输入 @ 提及成员，输入 # 发送工作区文件'))
  assert.ok(!chatHtml.includes('同网关短码'), 'Chat view must not contain pairing configuration boxes')

  // Verify Minimalist LLM-Moderated Group Room renders cleanly with New Topic divider
  const moderatedGroupState = {
    ...mockServerState,
    rooms: [
      {
        id: 'grp_mod_1',
        type: 'group',
        name: '前后端联调群',
        createdBy: 'alice',
        moderatorSlug: 'alice',
        activeThreadId: 'thr_2',
        members: mockServerState.rooms[0].members,
        unreadCount: 0,
      },
    ],
    messages: {
      grp_mod_1: [
        {
          id: 'msg_div',
          roomId: 'grp_mod_1',
          threadId: 'thr_2',
          sender: { slug: 'alice', ownerName: 'Alice', actor: 'system' },
          kind: 'system',
          text: '─── Started a new conversation topic (fresh Agent context isolated) ───',
          createdAt: Date.now(),
        },
        {
          id: 'msg_syn',
          roomId: 'grp_mod_1',
          threadId: 'thr_2',
          sender: { slug: 'alice', ownerName: 'Alice', actor: 'agent' },
          kind: 'chat',
          text: '已经协调 @bob 查完接口并修复。',
          createdAt: Date.now(),
        },
        {
          id: 'msg_task_new',
          roomId: 'grp_mod_1',
          threadId: 'thr_3',
          sender: { slug: 'alice', ownerName: 'Alice', actor: 'agent' },
          kind: 'task',
          text: '@bob Check migration status',
          createdAt: Date.now(),
        },
        {
          id: 'msg_task_reply',
          roomId: 'grp_mod_1',
          threadId: 'thr_3',
          sender: { slug: 'bob', ownerName: 'Bob', actor: 'agent' },
          kind: 'chat',
          text: 'Migration is clean',
          createdAt: Date.now(),
        },
      ],
    },
    activeStatuses: {
      grp_mod_1: [
        {
          roomId: 'grp_mod_1',
          slug: 'alice',
          ownerName: 'Alice',
          stage: 'coordinating',
          detail: '',
          isModerator: true,
          updatedAt: Date.now(),
        },
        {
          roomId: 'grp_mod_1',
          slug: 'bob',
          ownerName: 'Bob',
          stage: 'waiting_peer',
          detail: 'alice',
          isModerator: false,
          updatedAt: Date.now(),
        },
      ],
    },
  }
  const grpController = createMeshController({
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, state: moderatedGroupState }), { status: 200 }),
  })
  await grpController.syncFromHost()
  const GrpChatPage = createMeshChatPage({
    React,
    controller: grpController,
    getLocale: () => 'zh-CN',
    subscribeLocale: () => () => {},
  })
  const grpHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(GrpChatPage, {}))
  assert.ok(grpHtml.includes('主持人: @alice'))
  assert.ok(grpHtml.includes('sm-topic-divider'))
  assert.ok(grpHtml.includes('开启新话题（上下文已隔离）'))
  assert.ok(grpHtml.includes('新委托对话（上下文已隔离）'))
  assert.ok(grpHtml.includes('sm-typing-bubble'), 'Active preparing/answering bubble should render')
  assert.ok(grpHtml.includes('sm-typing-dots'), 'Animated bouncing dots should render')
  assert.ok(grpHtml.includes('sm-dot-live'), 'Busy member pill should show live pulsing dot')
  assert.ok(grpHtml.includes('正在统筹调度成员…'))
  assert.ok(grpHtml.includes('正在协同等待 @alice…'))
  assert.ok(MESH_CSS.includes('@keyframes sm-dot-bounce'))
  assert.equal((grpHtml.match(/新委托对话（上下文已隔离）/g) || []).length, 1, 'Replies in same thread must NOT emit duplicate dividers')
  assert.ok(!grpHtml.includes('当前已是全新空话题，无需重复创建'), 'New Topic button must be enabled when active thread has messages')
  assert.ok(!grpHtml.includes('主持有序研讨'), 'Hardcoded roundtable UI button must be removed')

  // Verify New Topic button is disabled when room was just rotated to a fresh empty thread (thr_4)
  const freshTopicState = {
    ...moderatedGroupState,
    rooms: [{ ...moderatedGroupState.rooms[0], activeThreadId: 'thr_4' }],
  }
  const freshController = createMeshController({
    fetchImpl: async () => new Response(JSON.stringify({ ok: true, state: freshTopicState }), { status: 200 }),
  })
  await freshController.syncFromHost()
  const FreshChatPage = createMeshChatPage({
    React,
    controller: freshController,
    getLocale: () => 'zh-CN',
    subscribeLocale: () => () => {},
  })
  const freshHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(FreshChatPage, {}))
  assert.ok(freshHtml.includes('disabled="" title="当前已是全新空话题，无需重复创建"'), 'New Topic button must be disabled on fresh empty thread')
  freshController.dispose()

  // Active thread with existing message allows New Topic; fresh thread forbids duplicate New Topic
  assert.equal(canStartNewTopic({ id: 'g', activeThreadId: 'thr_3' }, moderatedGroupState.messages.grp_mod_1), true)
  assert.equal(canStartNewTopic({ id: 'g', activeThreadId: 'thr_fresh' }, moderatedGroupState.messages.grp_mod_1), false)
  assert.equal(canStartNewTopic({ id: 'g', activeThreadId: 'thr_fresh' }, []), false)
  grpController.dispose()

  // Verify Settings Page contains pairing config & non-wrapping labels
  const SettingsPage = createMeshSettingsPage({
    React,
    controller,
    getLocale: () => 'zh-CN',
    subscribeLocale: () => () => {},
  })
  const settingsHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(SettingsPage, {}))
  assert.ok(settingsHtml.includes('沙箱互联与远程 Agent 名片'))
  assert.ok(settingsHtml.includes('本沙箱 Agent 名片'))
  assert.ok(settingsHtml.includes('https://dock.example.com/s/alice/p/4090'))
  assert.ok(settingsHtml.includes('alice.k8F9mP2xQ7vL4nR1wZ3y'))
  assert.ok(settingsHtml.includes('同网关短码'))
  assert.ok(settingsHtml.includes('测试连接'))
  assert.match(settingsHtml, /<input[^>]*class="sm-invite-code"/i)
  assert.ok(MESH_CSS.includes('.sm-invite-label'))
  assert.ok(MESH_CSS.includes('white-space: nowrap;'))

  // Empty-state onboarding in ChatPage renders direct Quick-Start Pairing UI
  const emptyController = createMeshController({
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      state: { ...mockServerState, peers: [], rooms: [], messages: {} },
    }), { status: 200 }),
  })
  await emptyController.syncFromHost()
  const EmptyChatPage = createMeshChatPage({
    React,
    controller: emptyController,
    getLocale: () => 'zh-CN',
    subscribeLocale: () => () => {},
  })
  const emptyChatHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(EmptyChatPage, {}))
  assert.ok(emptyChatHtml.includes('开始沙箱互联'))
  assert.ok(emptyChatHtml.includes('生成配对码'))
  emptyController.dispose()

  // Unpaired room renders disconnected notice & remove/repair actions instead of composer
  const unpairedController = createMeshController({
    fetchImpl: async () => new Response(JSON.stringify({
      ok: true,
      state: {
        ...mockServerState,
        peers: [],
        rooms: [{ ...mockServerState.rooms[0], unpaired: true, unpairedBy: 'bob' }],
      },
    }), { status: 200 }),
  })
  await unpairedController.syncFromHost()
  const UnpairedChatPage = createMeshChatPage({
    React,
    controller: unpairedController,
    getLocale: () => 'zh-CN',
    subscribeLocale: () => () => {},
  })
  const unpairedHtml = ReactDOMServer.renderToStaticMarkup(React.createElement(UnpairedChatPage, {}))
  assert.ok(unpairedHtml.includes('已解除配对'))
  assert.ok(unpairedHtml.includes('移除会话'))
  assert.ok(unpairedHtml.includes('重新配对'))
  assert.ok(!unpairedHtml.includes('<textarea'))
  unpairedController.dispose()

  controller.dispose()
}

// 1b. Clipboard copy fallback (HTTP non-secure context, rejected Clipboard API, manual fallback) & forgiving invite parsing
{
  const parsedQuoted = parsePairInvite('  `#pair=alice.k8F9mP2xQ7vL4nR1wZ3y`  ', 'https://dock.example.com')
  assert.equal(parsedQuoted?.slug, 'alice')
  assert.equal(parsedQuoted?.shortCode, 'alice.k8F9mP2xQ7vL4nR1wZ3y')

  const parsedSlash = parsePairInvite('http://192.168.1.50:9000/s/bob/p/4090/#pair=bob.abcd1234efgh5678')
  assert.equal(parsedSlash?.slug, 'bob')
  assert.equal(parsedSlash?.endpointUrl, 'http://192.168.1.50:9000/s/bob/p/4090')

  assert.equal(
    resolveBrowserOriginUrl('http://localhost:9000/s/alice/p/4090#pair=alice.123', 'http://192.168.1.50:9000'),
    'http://192.168.1.50:9000/s/alice/p/4090#pair=alice.123',
  )
  assert.equal(
    resolveBrowserOriginUrl('https://dock.example.com/s/alice/p/4090', 'http://192.168.1.50:9000'),
    'https://dock.example.com/s/alice/p/4090',
  )

  // Mock DOM inside a focus-trapped dialog container
  const createMockDom = ({ execResult = true } = {}) => {
    const dialogChildren = []
    const dialogContainer = {
      appendChild(el) { dialogChildren.push(el); el.parentElement = dialogContainer },
    }
    const inputEl = {
      parentElement: dialogContainer,
      focused: false,
      selected: false,
      focus() { this.focused = true },
      select() { this.selected = true },
      setSelectionRange() {},
    }
    const doc = {
      activeElement: inputEl,
      body: { appendChild(el) { el.parentElement = doc.body } },
      execCommandCalls: [],
      createElement(tag) {
        return {
          tagName: tag.toUpperCase(),
          value: '',
          style: {},
          setAttribute() {},
          focus() {},
          select() {},
          setSelectionRange() {},
          remove() {
            const idx = dialogChildren.indexOf(this)
            if (idx >= 0) dialogChildren.splice(idx, 1)
          },
        }
      },
      execCommand(cmd) {
        this.execCommandCalls.push(cmd)
        return execResult
      },
    }
    return { doc, inputEl, dialogChildren }
  }

  // Non-HTTPS context: skips navigator.clipboard and uses synchronous execCommand cleanly
  {
    const { doc, inputEl } = createMockDom({ execResult: true })
    let asyncCalled = false
    const res = await copyTextToClipboard('alice.k8F9mP2xQ7vL4nR1wZ3y', {
      fallbackInput: inputEl,
      win: { isSecureContext: false },
      nav: { clipboard: { writeText: async () => { asyncCalled = true } } },
      doc,
    })
    assert.equal(res.ok, true)
    assert.equal(res.method, 'execCommand')
    assert.equal(asyncCalled, false, 'Non-secure context must use synchronous execCommand immediately')
    assert.deepEqual(doc.execCommandCalls, ['copy'])
  }

  // Secure context where Clipboard API throws: falls back to execCommand
  {
    const { doc, inputEl } = createMockDom({ execResult: true })
    const res = await copyTextToClipboard('https://dock.example.com/s/alice/p/4090#pair=alice.xxx', {
      fallbackInput: inputEl,
      win: { isSecureContext: true },
      nav: { clipboard: { writeText: async () => { throw new Error('NotAllowedError') } } },
      doc,
    })
    assert.equal(res.ok, true)
    assert.equal(res.method, 'execCommand')
  }

  // Both Clipboard API and execCommand blocked: selects fallbackInput cleanly & reports manual
  {
    const { doc, inputEl } = createMockDom({ execResult: false })
    const res = await copyTextToClipboard('alice.xxx', {
      fallbackInput: inputEl,
      win: { isSecureContext: false },
      nav: null,
      doc,
    })
    assert.equal(res.ok, false)
    assert.equal(res.method, 'manual')
    assert.equal(inputEl.selected, true)
  }
}

// 1c. Controller actions (pingPeer, removePeer, leaveGroup, removeRoom) status transitions
{
  const calls = []
  const ctrl = createMeshController({
    fetchImpl: async (url, opts) => {
      calls.push({ url, body: opts?.body ? JSON.parse(opts.body) : null })
      if (url.includes('peer-ping')) {
        return new Response(JSON.stringify({ ok: true, reachable: false, status: 'unpaired-by-peer', state: { peers: [], rooms: [] } }), { status: 200 })
      }
      if (url.includes('peer-remove')) {
        return new Response(JSON.stringify({ ok: true, remoteNotified: false, state: { peers: [], rooms: [] } }), { status: 200 })
      }
      if (url.includes('group-leave')) {
        return new Response(JSON.stringify({ ok: true, state: { peers: [], rooms: [] } }), { status: 200 })
      }
      if (url.includes('room-remove')) {
        return new Response(JSON.stringify({ ok: true, state: { peers: [], rooms: [] } }), { status: 200 })
      }
      return new Response(JSON.stringify({ ok: true, state: { peers: [], rooms: [] } }), { status: 200 })
    },
  })

  await ctrl.pingPeer('bob')
  assert.equal(ctrl.getSnapshot().statusKey, 'statusPingUnpaired')

  await ctrl.removePeer('bob')
  assert.equal(ctrl.getSnapshot().statusKey, 'statusUnpairedOffline')

  await ctrl.leaveGroup('grp_1')
  assert.equal(ctrl.getSnapshot().statusKey, 'statusGroupLeft')

  await ctrl.removeRoom('pair:alice:bob')
  assert.equal(ctrl.getSnapshot().statusKey, 'statusRoomRemoved')

  assert.equal(calls.some((c) => c.url.includes('api/sandbox-mesh.peer-ping') && c.body.slug === 'bob'), true)
  assert.equal(calls.some((c) => c.url.includes('api/sandbox-mesh.peer-remove') && c.body.slug === 'bob'), true)
  assert.equal(calls.some((c) => c.url.includes('api/sandbox-mesh.group-leave') && c.body.roomId === 'grp_1'), true)
  assert.equal(calls.some((c) => c.url.includes('api/sandbox-mesh.room-remove') && c.body.roomId === 'pair:alice:bob'), true)
  ctrl.dispose()
}

// 2. Full client.js VM load + Cordis slot registrations (sidebar.panellist + main + settings.section)
{
  const appendedStyles = []
  globalThis.document = {
    head: {
      querySelector(sel) {
        return appendedStyles.find((s) => sel.includes(s.attributes['data-plugin'])) || null
      },
      appendChild(el) { appendedStyles.push(el) },
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        attributes: {},
        textContent: '',
        setAttribute(k, v) { this.attributes[k] = v },
        remove() {
          const i = appendedStyles.indexOf(this)
          if (i >= 0) appendedStyles.splice(i, 1)
        },
      }
    },
  }

  let entryDef = null
  const bundleSource = readFileSync(join(PLUGIN_DIR, 'client.js'), 'utf8')
  vm.runInNewContext(bundleSource, {
    get document() { return globalThis.document },
    window: {
      __ModuleLoader__: {
        load(def) { entryDef = def },
      },
    },
  })

  const exported = entryDef.factory((spec) => {
    if (spec === 'react') return React
    throw new Error(`Unexpected require ${spec}`)
  })

  const regs = []
  let activeLang = 'en-US'
  const localeListeners = new Set()

  class MockSlots extends Service {
    constructor(ctx) {
      super(ctx, 'slots', true)
    }
    inject(_k, cb) {
      const dispose = cb()
      return this.ctx.effect(() => dispose, 'test inject')
    }
    register(opts, comp) {
      const rec = { opts, comp }
      regs.push(rec)
      return () => {
        const i = regs.indexOf(rec)
        if (i >= 0) regs.splice(i, 1)
      }
    }
  }

  const ctx = new Context()
  const registeredTriggerSources = []
  ctx.plugin(MockSlots)
  ctx.provide('locale', {
    getSnapshot() { return { active: activeLang } },
    subscribe(fn) {
      localeListeners.add(fn)
      return () => localeListeners.delete(fn)
    },
    register() { return () => {} },
  })
  ctx.provide('inputTriggers', {
    registerSource(src) {
      registeredTriggerSources.push(src)
      return () => {
        const i = registeredTriggerSources.indexOf(src)
        if (i >= 0) registeredTriggerSources.splice(i, 1)
      }
    },
  })

  const fiber = ctx.plugin(exported)
  await fiber.inertia
  await new Promise((r) => setTimeout(r, 20))

  assert.equal(appendedStyles.length, 1)
  assert.equal(registeredTriggerSources.length, 1, 'Expected native Session @ trigger source to be registered')
  assert.equal(registeredTriggerSources[0].trigger, '@')
  assert.equal(registeredTriggerSources[0].name, 'sandbox-mesh')

  const serializedRef = await registeredTriggerSources[0].codec.serialize('@[bob](dsh-mesh:bob)')
  assert.equal(serializedRef, '@[bob](dsh-mesh:bob)')
  assert.equal(registeredTriggerSources[0].codec.clipboardText('@[bob](dsh-mesh:bob)'), '@bob')

  assert.ok(regs.some((r) => r.opts.name === 'sidebar.panellist' && r.opts.id === 'sandbox-mesh'))
  assert.ok(regs.some((r) => r.opts.name === 'main' && r.opts.key === 'sandbox-mesh'))
  assert.ok(regs.some((r) => r.opts.name === 'settings.section' && r.opts.id === 'sandbox-mesh' && r.opts.label === 'Sandbox Mesh'))

  activeLang = 'zh-CN'
  for (const fn of localeListeners) fn({ active: activeLang })
  assert.ok(regs.some((r) => r.opts.name === 'settings.section' && r.opts.label === '沙箱互联'))

  await fiber.dispose()
  assert.equal(appendedStyles.length, 0)
  assert.equal(regs.length, 0)
  assert.equal(registeredTriggerSources.length, 0)
  await ctx.fiber.dispose()
}

console.log('client-live ok')
