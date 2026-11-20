import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { pairRoomId } from '../shared/protocol.js'

export function buildCliScript({ defaultPort = 4090, tokenPath }) {
  return `#!/usr/bin/env node
import { readFileSync } from 'node:fs'

const TOKEN_PATH = ${JSON.stringify(tokenPath)}
const PORT = Number(process.env.DSH_MESH_PORT || ${Number(defaultPort) || 4090})
const BASE_URL = \`http://127.0.0.1:\${PORT}/local/cli\`

function usage() {
  console.log(\`Usage: sandbox-peer <command> [args]

Commands:
  status                                    Show self identity, active pair code, peers, and rooms
  pair-code                                 Generate a new 5-minute one-time pair code & Traefik URI
  pair <invite-code-or-url>                 Pair with another sandbox by short code or Traefik URI
  unpair <slug>                             Unpair a sandbox (notifies peer & rotates owned group keys)
  ping <slug>                               Check live reachability & auth status of a paired sandbox
  group-create <name> [slug1,slug2...]      Create a team group room (LLM Moderator controlled)
  group-invite <roomId> <slug1,slug2...>    Invite paired sandboxes into an existing group room
  group-remove <roomId> <slug>              Remove a member from a group and rotate groupSecret
  group-leave <roomId>                      Leave a team group room
  new-topic <roomId>                        Rotate active threadId to start a clean context topic
  rooms                                     List all paired 1v1 and group rooms
  messages <roomId>                         Show message history in a room
  inbox [--ack]                             List unacknowledged @agent or task messages
  send <roomId> <text> [--task] [--hop N]   Send a message as this sandbox's DSH Agent
  send-file <roomId> <path> [caption]       Share a local workspace file to a room
\`)
}

async function main() {
  const args = process.argv.slice(2)
  const cmd = args[0]
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    usage()
    process.exit(0)
  }

  let token = ''
  try {
    token = readFileSync(TOKEN_PATH, 'utf8').trim()
  } catch (err) {
    console.error('sandbox-peer: could not read local auth token at ' + TOKEN_PATH)
    process.exit(1)
  }

  let payload = { action: cmd }
  if (cmd === 'pair') {
    payload.invite = args[1] || ''
  } else if (cmd === 'unpair' || cmd === 'ping') {
    payload.slug = args[1] || ''
  } else if (cmd === 'group-create') {
    payload.name = args[1] || ''
    payload.memberSlugs = (args[2] || '').split(',').map((s) => s.trim()).filter(Boolean)
  } else if (cmd === 'group-invite') {
    payload.roomId = args[1] || ''
    payload.memberSlugs = (args[2] || '').split(',').map((s) => s.trim()).filter(Boolean)
  } else if (cmd === 'group-remove') {
    payload.roomId = args[1] || ''
    payload.slug = args[2] || ''
  } else if (cmd === 'group-leave') {
    payload.roomId = args[1] || ''
  } else if (cmd === 'new-topic') {
    payload.roomId = args[1] || ''
  } else if (cmd === 'messages') {
    payload.roomId = args[1] || ''
  } else if (cmd === 'inbox') {
    payload.ack = args.includes('--ack')
  } else if (cmd === 'send') {
    const roomId = args[1] || ''
    const rest = args.slice(2)
    let kind = 'chat'
    let hop = 0
    const textParts = []
    for (let i = 0; i < rest.length; i += 1) {
      if (rest[i] === '--task') {
        kind = 'task'
      } else if (rest[i] === '--kind' && rest[i + 1]) {
        kind = rest[i + 1]
        i += 1
      } else if (rest[i] === '--hop' && rest[i + 1]) {
        hop = Number(rest[i + 1]) || 0
        i += 1
      } else {
        textParts.push(rest[i])
      }
    }
    payload = {
      action: 'send',
      roomId,
      text: textParts.join(' '),
      kind,
      actor: 'agent',
      hop,
    }
  } else if (cmd === 'send-file') {
    payload = {
      action: 'send-file',
      roomId: args[1] || '',
      filePath: args[2] || '',
      text: args.slice(3).join(' '),
      actor: 'agent',
    }
  }

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: \`Bearer \${token}\`,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({ ok: false, error: \`HTTP \${res.status}\` }))
  if (!res.ok || data.ok === false) {
    console.error('Error:', data.error || \`HTTP \${res.status}\`)
    process.exit(1)
  }
  console.log(JSON.stringify(data, null, 2))
}

main().catch((err) => {
  console.error('sandbox-peer failed:', err?.message || err)
  process.exit(1)
})
`
}

export function buildSkillSummaryMeta(snapshot = null) {
  const peers = snapshot?.peers || []
  const groups = (snapshot?.rooms || []).filter((r) => r.type === 'group' && !r.unpaired)
  const peerBrief = peers.length > 0
    ? `Connected remote sandbox agents: ${peers.map((p) => `@${p.slug}${p.role ? ` (${p.role})` : ''}`).join(', ')}.`
    : 'No remote sandboxes paired yet.'
  const groupBrief = groups.length > 0
    ? ` Active groups: ${groups.map((g) => `"${g.name}" (${g.id}, moderator: @${g.moderatorSlug || g.createdBy})`).join(', ')}.`
    : ''

  return {
    name: 'sandbox-peer',
    description:
      `Collaborate with paired remote DSH sandboxes as remote subagents (1-on-1 delegation, automatic task-based group creation & LLM-moderated team rooms, and file transfer). Handles @[slug](dsh-mesh:slug) and @[group](dsh-mesh-group:roomId) mentions directly. ${peerBrief}${groupBrief}`,
    whenToUse:
      `Use IMMEDIATELY whenever: (1) the user mentions @[slug](dsh-mesh:slug) or @[group](dsh-mesh-group:roomId); (2) the user asks to consult, delegate to, or collaborate with another sandbox/agent (${peers.map((p) => `@${p.slug}${p.role ? ` / ${p.role}` : ''}`).join(', ') || 'peer sandboxes'}); or (3) a complex task in the conversation spans multiple paired sandboxes' specialties or requires multi-container checks/discussion — proactively select the relevant sandboxes and auto-create a task-named group via \`mesh_discuss_group\`.`,
  }
}

export function buildSkillMarkdown(snapshot = null) {
  const meta = buildSkillSummaryMeta(snapshot)
  const self = snapshot?.self || {}
  const peers = snapshot?.peers || []
  const groups = (snapshot?.rooms || []).filter((r) => r.type === 'group' && !r.unpaired)

  const peerRows = peers.length > 0
    ? peers
        .map((p) => {
          const rId = pairRoomId(self.slug || 'sandbox', p.slug)
          return `- **\`@${p.slug}\`** (${p.ownerName || p.slug})\n  - **Role**: ${p.role || 'General Sandbox Agent'}\n  - **Specialty**: ${p.description || '(not specified)'}\n  - **1-on-1 Room ID**: \`${rId}\``
        })
        .join('\n')
    : '- *(No remote sandboxes paired yet. Ask the user to pair in Settings -> Sandbox Mesh or run `sandbox-peer pair <code>`.)*'

  const groupRows = groups.length > 0
    ? groups
        .map(
          (g) =>
            `- **${g.name}** (\`roomId: "${g.id}"\`) — Moderator: \`@${g.moderatorSlug || g.createdBy}\` · Members: ${(g.members || []).map((m) => `@${m.slug}`).join(', ')}`,
        )
        .join('\n')
    : '- *(No multi-sandbox groups created yet.)*'

  return `---
name: ${meta.name}
description: ${JSON.stringify(meta.description)}
whenToUse: ${JSON.stringify(meta.whenToUse)}
---

# Sandbox Mesh — Remote Subagents & LLM-Moderated Group Collaboration

This sandbox (\`@${self.slug || 'sandbox'}\`${self.role ? ` · Role: ${self.role}` : ''}) collaborates with remote DSH sandboxes over Traefik.
Each container keeps heavy tool outputs inside its own Harness Session and only exchanges distilled answers + transferred files across the mesh, isolated per \`threadId\`.

## 1. Connected Remote Sandbox Agents & Specialties

${peerRows}

## 2. Team Discussion Groups (LLM Moderator Controlled)

${groupRows}

## 3. Auto-Creating Task Groups vs 1-on-1 Delegation

Choose the right collaboration mode automatically from the user's conversation task:
- **1-on-1 (\`mesh_ask_peer\`)**: Use when the user mentions \`@[slug](dsh-mesh:<slug>)\` or when only **one** remote sandbox's specialty/container is needed. Do not create unnecessary 2-node groups for simple 1-on-1 lookups.
- **Auto-Create / Reuse Task Group (\`mesh_discuss_group\`)**: Use when the user mentions \`@[name](dsh-mesh-group:<roomId>)\`, asks to form a group/discussion, OR when a task naturally requires **multiple sandboxes** (e.g., frontend + backend + QA, cross-container verification, joint review):
  1. Match connected sandboxes above by their **Role / Specialty** and pass only the relevant \`memberSlugs\` (or omit to include all paired sandboxes for cluster-wide tasks).
  2. Omit \`roomId\` and give a concise task-focused \`groupName\` (or omit \`groupName\` to auto-derive it from \`topic\`). By default (\`reuseExisting: true\`), an active group with the same name & members is reused with a fresh isolated topic; pass \`reuseExisting: false\` to force a dedicated new group.
  3. As local Moderator, \`mesh_discuss_group\` posts the task brief into the room and returns \`roomId\` + \`threadId\`. Call each needed member selectively via \`mesh_ask_peer(roomId, threadId, targetSlug, question)\`, then post your synthesized conclusion via \`mesh_send_message(roomId, threadId, text)\` and report the outcome to the user.

## 4. Native Harness Tools

1. **\`mesh_ask_peer\`** — Call a specific remote sandbox Agent (1-on-1 OR inside a group room):
   - Pass \`targetSlug\`, \`question\` (write clear natural-language goals; avoid pasting long raw shell one-liners), optional \`roomId\` (pair room or \`grp_...\`), optional \`threadId\`, and optional \`files\`.
   - Omit \`threadId\` on 1-on-1 tasks to start a clean isolated Session on the remote container; pass the returned \`threadId\` for multi-turn follow-ups on the same topic.
   - Inside a group room, calling \`mesh_ask_peer(roomId="grp_...", targetSlug=...)\` wakes ONLY that member without disturbing others.
2. **\`mesh_discuss_group\`** — Auto-create or reuse a task-focused group room for LLM-moderated collaboration:
   - Parameters: \`topic\`, optional \`roomId\`, optional \`groupName\`, optional \`memberSlugs\`, optional \`moderatorSlug\`, optional \`reuseExisting\` (default \`true\`), optional \`threadId\`.
   - If you (self) are Moderator, posts the opening brief and returns \`roomId\`, \`threadId\`, and member specialties so you decide dynamically whom to consult via \`mesh_ask_peer\`.
   - If a remote sandbox is Moderator, delegates the topic to \`@moderator\` and returns its synthesized conclusion.
3. **\`mesh_share_file\`** — Send a workspace file (\`roomId\`, \`filePath\`, \`caption\`).
4. **\`mesh_list_peers\`** — Refresh connected sandboxes, specialties, and groups.
`
}

export function syncSkillFile({ config = {}, env = process.env, snapshot = null } = {}) {
  const home = String(config.homeDir || env.HOME || '').trim() || homedir()
  const dshHome = String(config.dshHome || env.DSH_HOME || '').trim() || join(home, '.dsh')
  const skillPath = config.skillPath || join(dshHome, 'skills', 'sandbox-peer', 'SKILL.md')
  try {
    mkdirSync(dirname(skillPath), { recursive: true })
    writeFileSync(skillPath, buildSkillMarkdown(snapshot), 'utf8')
  } catch {}
  return skillPath
}

export function installAgentBridge({
  config = {},
  env = process.env,
  localToken,
  meshPort = 4090,
  snapshot = null,
}) {
  const home = String(config.homeDir || env.HOME || '').trim() || homedir()
  const dshHome = String(config.dshHome || env.DSH_HOME || '').trim() || join(home, '.dsh')
  const tokenPath = config.localTokenPath || join(dshHome, 'sandbox-mesh.local-token')
  const cliPath = config.cliPath || join(home, '.local', 'bin', 'sandbox-peer')
  const skillPath = config.skillPath || join(dshHome, 'skills', 'sandbox-peer', 'SKILL.md')

  try {
    mkdirSync(dirname(tokenPath), { recursive: true })
    writeFileSync(tokenPath, `${localToken}\n`, { encoding: 'utf8', mode: 0o600 })
    try { chmodSync(tokenPath, 0o600) } catch {}

    mkdirSync(dirname(cliPath), { recursive: true })
    writeFileSync(
      cliPath,
      buildCliScript({ defaultPort: meshPort, tokenPath }),
      { encoding: 'utf8', mode: 0o755 },
    )
    try { chmodSync(cliPath, 0o755) } catch {}

    syncSkillFile({ config, env, snapshot })
  } catch {
    // Non-fatal in read-only or restricted test environments
  }

  return { tokenPath, cliPath, skillPath }
}
