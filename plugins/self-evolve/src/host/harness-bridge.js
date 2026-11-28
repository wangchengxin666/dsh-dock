import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const GLOBAL_DSH_NM = '/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'

async function importDshPkg(pkgShortName, fullPkgName) {
  try {
    return await import(fullPkgName)
  } catch {
    const candidate = `${GLOBAL_DSH_NM}/${pkgShortName}/lib/index.js`
    if (existsSync(candidate)) return import(pathToFileURL(candidate).href)
    return null
  }
}

export const SELF_EVOLVE_TOOL_NAMES = [
  'evolve_list',
  'evolve_save_skill',
  'evolve_rollback',
  'evolve_record_lesson',
]

export function buildSelfEvolveSkillMarkdown() {
  return [
    '---',
    'name: self-evolve',
    'description: Safely evolve this AI workbench by creating or updating ~/.dsh/skills/<name>/ skills with automatic snapshots, verification test gates, and 1-click rollback.',
    'whenToUse: The user asks you to remember/codify a reusable workflow as a Skill, improve your own capabilities/scripts safely, inspect past evolutions, or roll back a broken skill update.',
    '---',
    '',
    '# Safe Self-Evolution Protocol',
    '',
    'Follow this loop whenever improving your workbench capabilities:',
    '1. Inspect current skills & evolution history with `evolve_list`.',
    '2. Write focused, reusable Skills via `evolve_save_skill(slug, skillMd, extraFiles?, reason?, verifyCommand?)`. Always pass a real `verifyCommand` when shipping helper scripts (`extraFiles.scripts/...`) so any broken script triggers an automatic rollback.',
    '3. Keep skills concise (clear triggers in `whenToUse`, exact commands, zero bloated filler).',
    '4. Record non-trivial engineering lessons or pitfalls using `evolve_record_lesson`.',
    '5. If a later symptom reveals a regression, restore immediately via `evolve_rollback(evolutionId)`.',
  ].join('\n')
}

export function wireHarnessRuntime(ctx, service, { logger } = {}) {
  ctx.inject(['skills'], (skillCtx) => {
    service.setSkillsInvalidator(() => skillCtx.skills.invalidate?.())
    let invalidated = false
    const unregister = skillCtx.skills.registerProvider({
      name: 'self-evolve',
      list() {
        return [{
          name: 'self-evolve',
          description: 'Manage ~/.dsh/skills/ safely with backup snapshots, test verification gates, and rollback.',
          whenToUse: 'Use when authoring or updating workbench skills, recording lessons, or rolling back an evolution.',
          locator: 'plugin://self-evolve/guide',
        }]
      },
      get() {
        return { content: buildSelfEvolveSkillMarkdown() }
      },
    })
    skillCtx.effect(() => {
      if (!invalidated) {
        invalidated = true
        skillCtx.skills.invalidate?.()
      }
      return () => {
        service.setSkillsInvalidator(null)
        try { unregister?.() } catch {}
      }
    }, 'self-evolve: skill')
  })

  ctx.inject(['tools'], (toolCtx) => {
    const disposers = []
    let disposed = false

    ;(async () => {
      const toolsMod = await importDshPkg('dsh-tools', '@deepseek-ai/dsh-tools')
      const defineTool = toolsMod?.defineTool || ((spec) => spec)
      if (disposed) return

      const reg = (spec) => {
        const d = toolCtx.tools.register(defineTool(spec))
        if (typeof d === 'function') disposers.push(d)
      }

      reg({
        name: 'evolve_list',
        description: 'Inspect installed workspace skills (~/.dsh/skills/) and recent self-evolution entries/status.',
        parameters: {},
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok || !val?.state) return [{ type: 'text', text: 'Failed to inspect self-evolution state.' }]
            const { skills = [], entries = [] } = val.state
            return [{
              type: 'text',
              text: [
                `Self-Evolve Status (${skills.length} skills, ${entries.length} log entries):`,
                `Skills: ${skills.map((s) => `${s.slug} (${s.files?.length || 1} files)`).join(', ') || 'none'}`,
                ...entries.slice(0, 8).map((e) => `- ${e.id} [${e.status}] ${e.title}`),
              ].join('\n'),
            }]
          },
        },
        async execute() {
          return { ok: true, state: service.getStateSnapshot() }
        },
        presentCall: () => ({ card: 'generic', title: 'Inspect self-evolution skills & log', kind: 'other' }),
      })

      reg({
        name: 'evolve_save_skill',
        description: 'Create or update a persistent DSH skill under ~/.dsh/skills/<slug>/ with automatic pre-edit snapshot and optional verification command (auto-rolls back on test failure).',
        parameters: {
          slug: { type: 'string', required: true, description: 'Skill directory slug (lowercase letters, digits, hyphens).' },
          skillMd: { type: 'string', required: true, description: 'Full SKILL.md Markdown content (including YAML frontmatter).' },
          extraFiles: { type: 'object', additionalProperties: true, description: 'Optional map of relative path -> file content (e.g. {"scripts/run.sh": "#!/usr/bin/env bash..."}).' },
          reason: { type: 'string', description: 'Why this skill was added or updated.' },
          verifyCommand: { type: 'string', description: 'Optional shell verification command; non-zero exit triggers automatic rollback.' },
          cwd: { type: 'string', description: 'Optional working directory for verifyCommand.' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok) {
              return [{ type: 'text', text: `${val?.error || 'Skill evolution failed'}${val?.verify_output ? `\n${val.verify_output}` : ''}` }]
            }
            return [{
              type: 'text',
              text: `Evolution ${val.evolution_id} [${val.entry?.status}]: ${val.entry?.title}`,
            }]
          },
        },
        async execute(args) {
          return service.saveSkill({
            slug: args?.slug,
            skillMd: args?.skillMd,
            extraFiles: args?.extraFiles,
            reason: args?.reason || '',
            verifyCommand: args?.verifyCommand || '',
            cwd: args?.cwd || '',
          })
        },
        presentCall: (args) => ({ card: 'generic', title: `Evolve skill: ${args?.slug || ''}`, kind: 'other' }),
      })

      reg({
        name: 'evolve_rollback',
        description: 'Roll back a recorded self-evolution snapshot by evolutionId.',
        parameters: {
          evolutionId: { type: 'string', required: true, description: 'Evolution ID (e.g. evo_1a2b3c4d).' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok) return [{ type: 'text', text: `Rollback failed: ${val?.error || 'unknown error'}` }]
            return [{ type: 'text', text: `Rolled back ${val.entry?.id}: ${val.entry?.title}` }]
          },
        },
        async execute(args) {
          return service.rollbackEvolution({ evolutionId: args?.evolutionId })
        },
        presentCall: (args) => ({ card: 'generic', title: `Rollback ${args?.evolutionId || ''}`, kind: 'other' }),
      })

      reg({
        name: 'evolve_record_lesson',
        description: 'Record a concise evolution lesson, improvement note, or regression fix into the evolution journal.',
        parameters: {
          title: { type: 'string', required: true, description: 'Concise milestone or lesson title.' },
          summary: { type: 'string', description: 'Details, root cause, or rule going forward.' },
          category: { type: 'string', description: 'One of: lesson, fix, workflow, automation, skill.' },
        },
        output: {
          schema: { type: 'object', additionalProperties: true },
          render: (_args, val) => {
            if (!val?.ok) return [{ type: 'text', text: `Failed to record lesson: ${val?.error || 'unknown error'}` }]
            return [{ type: 'text', text: `Recorded evolution ${val.evolution_id}: "${val.entry?.title}"` }]
          },
        },
        async execute(args) {
          return service.recordLesson({
            title: args?.title,
            summary: args?.summary || '',
            category: args?.category || 'lesson',
          })
        },
        presentCall: (args) => ({ card: 'generic', title: `Log lesson: ${args?.title || ''}`, kind: 'other' }),
      })
    })().catch((err) => {
      logger?.warn?.(`Failed to register self-evolve tools: ${err?.message || err}`)
    })

    toolCtx.effect(() => () => {
      disposed = true
      for (const d of disposers) { try { d() } catch {} }
    }, 'self-evolve: harness tools')
  })
}
