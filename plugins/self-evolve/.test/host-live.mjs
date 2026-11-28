import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  LESSON_ADD_ENDPOINT,
  ROLLBACK_ENDPOINT,
  SELF_EVOLVE_TOOL_NAMES,
  SKILL_DELETE_ENDPOINT,
  SKILL_SAVE_ENDPOINT,
  STATE_ENDPOINT,
  createSelfEvolveService,
} from '../index.js'
import { wireHarnessRuntime } from '../src/host/harness-bridge.js'

const ENDPOINT_RE = /^\/api\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/
for (const ep of [
  STATE_ENDPOINT,
  SKILL_SAVE_ENDPOINT,
  SKILL_DELETE_ENDPOINT,
  LESSON_ADD_ENDPOINT,
  ROLLBACK_ENDPOINT,
]) {
  assert.match(ep, ENDPOINT_RE)
}

const tmpHome = mkdtempSync(join(tmpdir(), 'se-host-test-'))
try {
  let invalidations = 0
  let verifyFailNext = false
  const service = createSelfEvolveService({
    homeDir: tmpHome,
    onSkillsMutated: () => { invalidations += 1 },
    runVerify: (cmd) => {
      if (verifyFailNext) return { ok: false, output: `Command failed: ${cmd}` }
      return { ok: true, output: `PASS: ${cmd}` }
    },
  })

  // 1. Save verified v1 skill
  const v1 = service.saveSkill({
    slug: 'deploy-check',
    skillMd: '---\nname: deploy-check\ndescription: v1 check\n---\n# v1\n',
    extraFiles: { 'scripts/check.sh': '#!/usr/bin/env bash\necho v1\n' },
    reason: 'Initial skill',
    verifyCommand: 'bash scripts/check.sh',
  })
  assert.equal(v1.ok, true)
  assert.equal(v1.entry.status, 'verified')
  assert.equal(v1.state.skills.length, 1)
  assert.ok(invalidations >= 1)

  // 2. Failing verification automatically rolls back to v1!
  verifyFailNext = true
  const v2Broken = service.saveSkill({
    slug: 'deploy-check',
    skillMd: '---\nname: deploy-check\ndescription: broken v2\n---\n# broken\n',
    reason: 'Broken experiment',
    verifyCommand: 'bash scripts/fail.sh',
  })
  assert.equal(v2Broken.ok, false)
  assert.equal(v2Broken.rolled_back, true)
  assert.equal(v2Broken.entry.status, 'failed_rolled_back')
  const curContent = readFileSync(join(tmpHome, '.dsh', 'skills', 'deploy-check', 'SKILL.md'), 'utf8')
  assert.ok(curContent.includes('v1 check'), 'failed update must auto-rollback to v1')

  // 3. Passing v2 + manual 1-click rollback back to v1!
  verifyFailNext = false
  const v2Ok = service.saveSkill({
    slug: 'deploy-check',
    skillMd: '---\nname: deploy-check\ndescription: v2 check\n---\n# v2\n',
    reason: 'Good upgrade',
    verifyCommand: 'bash scripts/pass.sh',
  })
  assert.equal(v2Ok.ok, true)
  assert.ok(readFileSync(join(tmpHome, '.dsh', 'skills', 'deploy-check', 'SKILL.md'), 'utf8').includes('v2 check'))

  const rb = service.rollbackEvolution({ evolutionId: v2Ok.evolution_id })
  assert.equal(rb.ok, true)
  assert.equal(rb.entry.status, 'rolled_back')
  assert.ok(readFileSync(join(tmpHome, '.dsh', 'skills', 'deploy-check', 'SKILL.md'), 'utf8').includes('v1 check'))

  // 4. Rolling back v1 removes newly created skill cleanly
  const rb1 = service.rollbackEvolution({ evolutionId: v1.evolution_id })
  assert.equal(rb1.ok, true)
  assert.equal(existsSync(join(tmpHome, '.dsh', 'skills', 'deploy-check')), false)

  // 5. Path traversal guard
  const badPath = service.saveSkill({ slug: '../etc', skillMd: 'nope' })
  assert.equal(badPath.ok, false)

  // 6. Lessons + Harness runtime wiring
  const lRes = service.recordLesson({ title: 'Prefer Caddy validate before reload', category: 'lesson' })
  assert.equal(lRes.ok, true)

  const tools = new Map()
  let skillProv = null
  wireHarnessRuntime({
    inject(deps, fn) {
      if (deps.includes('skills')) fn({ skills: { registerProvider: (p) => { skillProv = p; return () => {} }, invalidate() {} }, effect() {} })
      if (deps.includes('tools')) fn({ tools: { register: (t) => { tools.set(t.name, t); return () => {} } }, effect() {} })
    },
  }, service)
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(skillProv)
  assert.deepEqual([...tools.keys()].sort(), [...SELF_EVOLVE_TOOL_NAMES].sort())

  console.log('self-evolve host-live ok')
} finally {
  rmSync(tmpHome, { recursive: true, force: true })
}
