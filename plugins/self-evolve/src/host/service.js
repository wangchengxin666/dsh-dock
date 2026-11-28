import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import { join, resolve, sep } from 'node:path'
import {
  SKILL_SLUG_RE,
  VALID_CATEGORIES,
  normalizeSkillSlug,
  parseSkillFrontmatter,
} from '../shared/model.js'

const MAX_LOG_ENTRIES = 200

function atomicWrite(filePath, content, mode = 0o644) {
  mkdirSync(join(filePath, '..'), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmpPath, content, { mode })
  renameSync(tmpPath, filePath)
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!existsSync(filePath)) return fallback
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

export function createSelfEvolveService(options = {}) {
  const env = options.env || process.env
  const homeDir = options.homeDir || env.HOME || os.homedir()
  const dshHome = options.dshHome || (options.homeDir ? join(homeDir, '.dsh') : (env.DSH_HOME || join(homeDir, '.dsh')))
  const sandboxDir = options.sandboxDir || join(homeDir, '.dsh-sandbox')
  const skillsDir = options.skillsDir || join(dshHome, 'skills')
  const defaultCwd = options.workspaceDir || join(homeDir, 'default-workspace')
  const backupsDir = options.backupsDir || join(sandboxDir, 'evolve-backups')
  const logPath = options.evolutionLogPath || join(sandboxDir, 'evolution-log.json')
  let onSkillsMutated = options.onSkillsMutated || null

  function setSkillsInvalidator(fn) {
    onSkillsMutated = fn
  }

  function readLogDoc() {
    const raw = readJsonSafe(logPath, { version: 1, entries: [] })
    const entries = Array.isArray(raw?.entries) ? raw.entries.filter((e) => e && typeof e === 'object') : []
    return { version: 1, entries }
  }

  function writeLogDoc(entries) {
    atomicWrite(logPath, `${JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      entries: entries.slice(0, MAX_LOG_ENTRIES),
    }, null, 2)}\n`)
  }

  function appendEntry(entry) {
    const doc = readLogDoc()
    doc.entries.unshift(entry)
    writeLogDoc(doc.entries)
    return entry
  }

  function updateEntry(evolutionId, patch) {
    const doc = readLogDoc()
    const target = doc.entries.find((e) => e.id === evolutionId)
    if (!target) return null
    Object.assign(target, patch)
    writeLogDoc(doc.entries)
    return target
  }

  function listInstalledSkills() {
    if (!existsSync(skillsDir)) return []
    const items = []
    let names = []
    try {
      names = readdirSync(skillsDir).sort()
    } catch {
      return []
    }
    for (const slug of names) {
      if (!SKILL_SLUG_RE.test(slug)) continue
      const dir = join(skillsDir, slug)
      const skillFile = join(dir, 'SKILL.md')
      if (!existsSync(skillFile)) continue
      try {
        const st = statSync(skillFile)
        const content = readFileSync(skillFile, 'utf8')
        const meta = parseSkillFrontmatter(content)
        const files = []
        const walk = (cur, prefix) => {
          for (const ent of readdirSync(cur, { withFileTypes: true })) {
            const rel = prefix ? `${prefix}/${ent.name}` : ent.name
            if (ent.isDirectory()) walk(join(cur, ent.name), rel)
            else files.push(rel)
          }
        }
        walk(dir, '')
        items.push({
          slug,
          name: meta.name || slug,
          description: meta.description || '',
          path: dir,
          files,
          updated_at: st.mtime.toISOString(),
          skill_md_preview: content.slice(0, 600),
        })
      } catch {}
    }
    return items
  }

  function takeSkillBackup(slug, evolutionId) {
    const targetDir = resolve(skillsDir, slug)
    const existed = existsSync(targetDir)
    const snapRoot = join(backupsDir, evolutionId)
    const snapSkillDir = join(snapRoot, 'skill')
    mkdirSync(snapRoot, { recursive: true })
    if (existed) {
      cpSync(targetDir, snapSkillDir, { recursive: true })
    }
    atomicWrite(join(snapRoot, 'manifest.json'), `${JSON.stringify({
      version: 1,
      kind: 'skill',
      slug,
      existed,
      target_dir: targetDir,
      snapshot_dir: existed ? snapSkillDir : null,
      created_at: new Date().toISOString(),
    }, null, 2)}\n`)
    return { snapRoot, snapSkillDir, existed }
  }

  function restoreFromBackup(manifest) {
    if (!manifest || manifest.kind !== 'skill' || !SKILL_SLUG_RE.test(manifest.slug || '')) {
      throw new Error('Invalid backup manifest')
    }
    const targetDir = resolve(skillsDir, manifest.slug)
    if (!targetDir.startsWith(resolve(skillsDir) + sep)) {
      throw new Error('Backup target outside skills directory')
    }
    rmSync(targetDir, { recursive: true, force: true })
    if (manifest.existed && manifest.snapshot_dir && existsSync(manifest.snapshot_dir)) {
      mkdirSync(targetDir, { recursive: true })
      cpSync(manifest.snapshot_dir, targetDir, { recursive: true })
    }
    try { onSkillsMutated?.() } catch {}
  }

  function runVerification(verifyCommand, cwd) {
    if (options.runVerify) {
      return options.runVerify(verifyCommand, cwd)
    }
    try {
      const stdout = execFileSync('bash', ['-lc', verifyCommand], {
        cwd: existsSync(cwd) ? cwd : defaultCwd,
        encoding: 'utf8',
        timeout: 30000,
        env: { ...env, HOME: homeDir, DSH_HOME: dshHome },
      })
      return { ok: true, output: String(stdout || '').trim() }
    } catch (err) {
      const out = [err?.stdout?.toString() || '', err?.stderr?.toString() || '', err?.message || '']
        .map((s) => s.trim())
        .filter(Boolean)
        .join('\n')
      return { ok: false, output: out.slice(0, 2000) }
    }
  }

  function saveSkill({ slug, skillMd, extraFiles = {}, reason = '', verifyCommand = '', cwd = '' }) {
    const cleanSlug = normalizeSkillSlug(slug)
    if (!SKILL_SLUG_RE.test(cleanSlug)) {
      return { ok: false, status: 400, error: 'Skill slug must be lowercase alphanumeric + hyphens (e.g. my-tool)' }
    }
    const bodyMd = String(skillMd || '').trim()
    if (!bodyMd) {
      return { ok: false, status: 400, error: 'SKILL.md content is required' }
    }

    mkdirSync(skillsDir, { recursive: true })
    const resolvedRoot = resolve(skillsDir)
    const skillDir = resolve(skillsDir, cleanSlug)
    if (!skillDir.startsWith(resolvedRoot + sep)) {
      return { ok: false, status: 400, error: 'Invalid skill path' }
    }

    const evolutionId = `evo_${randomUUID().slice(0, 8)}`
    const backup = takeSkillBackup(cleanSlug, evolutionId)

    try {
      const stagedExtras = []
      if (extraFiles && typeof extraFiles === 'object') {
        for (const [rawRel, content] of Object.entries(extraFiles)) {
          const rel = String(rawRel || '').replace(/\\/g, '/').replace(/^\/+/, '')
          if (!rel || rel.toLowerCase() === 'skill.md' || rel.split('/').includes('..')) continue
          const abs = resolve(skillDir, rel)
          if (!abs.startsWith(skillDir + sep)) continue
          stagedExtras.push([rel, abs, String(content || '')])
        }
      }

      rmSync(skillDir, { recursive: true, force: true })
      mkdirSync(skillDir, { recursive: true })
      atomicWrite(join(skillDir, 'SKILL.md'), `${bodyMd}\n`, 0o644)

      for (const [rel, abs, text] of stagedExtras) {
        const isExec = rel.startsWith('scripts/') || /\.(sh|bash|py)$/i.test(rel) || text.startsWith('#!')
        atomicWrite(abs, text, isExec ? 0o755 : 0o644)
      }
      try { onSkillsMutated?.() } catch {}
    } catch (err) {
      const manifest = readJsonSafe(join(backup.snapRoot, 'manifest.json'), null)
      if (manifest) { try { restoreFromBackup(manifest) } catch {} }
      return { ok: false, status: 500, error: err?.message || 'Failed to write skill files' }
    }

    const cleanVerify = String(verifyCommand || '').trim()
    let status = 'applied'
    let verifyOutput = ''
    if (cleanVerify) {
      const vr = runVerification(cleanVerify, String(cwd || '').trim() || defaultCwd)
      verifyOutput = vr.output || ''
      if (!vr.ok) {
        const manifest = readJsonSafe(join(backup.snapRoot, 'manifest.json'), null)
        if (manifest) { try { restoreFromBackup(manifest) } catch {} }
        const failedEntry = appendEntry({
          id: evolutionId,
          kind: 'skill',
          category: 'skill',
          target: cleanSlug,
          title: `${backup.existed ? 'Update' : 'Create'} skill "${cleanSlug}" (verification failed)`,
          summary: String(reason || '').trim() || 'Skill update failed verification and was automatically rolled back.',
          status: 'failed_rolled_back',
          verify_command: cleanVerify,
          verify_output: verifyOutput,
          backup_manifest_path: join(backup.snapRoot, 'manifest.json'),
          can_rollback: false,
          created_at: new Date().toISOString(),
          rolled_back_at: new Date().toISOString(),
        })
        return {
          ok: false,
          status: 422,
          rolled_back: true,
          error: `Verification failed; automatically rolled back skill "${cleanSlug}"`,
          verify_output: verifyOutput,
          entry: failedEntry,
          state: getStateSnapshot(),
        }
      }
      status = 'verified'
    }

    const entry = appendEntry({
      id: evolutionId,
      kind: 'skill',
      category: 'skill',
      target: cleanSlug,
      title: `${backup.existed ? 'Update' : 'Create'} skill "${cleanSlug}"`,
      summary: String(reason || '').trim() || parseSkillFrontmatter(bodyMd).description || `Saved ~/.dsh/skills/${cleanSlug}/SKILL.md`,
      status,
      verify_command: cleanVerify || null,
      verify_output: verifyOutput || null,
      backup_manifest_path: join(backup.snapRoot, 'manifest.json'),
      can_rollback: true,
      created_at: new Date().toISOString(),
      rolled_back_at: null,
    })

    return { ok: true, evolution_id: evolutionId, entry, skill_dir: skillDir, state: getStateSnapshot() }
  }

  function deleteSkill({ slug, reason = '' }) {
    const cleanSlug = normalizeSkillSlug(slug)
    if (!SKILL_SLUG_RE.test(cleanSlug)) {
      return { ok: false, status: 400, error: 'Invalid skill slug' }
    }
    const skillDir = resolve(skillsDir, cleanSlug)
    if (!existsSync(skillDir)) {
      return { ok: false, status: 404, error: `Skill not found: ${cleanSlug}` }
    }

    const evolutionId = `evo_${randomUUID().slice(0, 8)}`
    const backup = takeSkillBackup(cleanSlug, evolutionId)
    rmSync(skillDir, { recursive: true, force: true })
    try { onSkillsMutated?.() } catch {}

    const entry = appendEntry({
      id: evolutionId,
      kind: 'skill',
      category: 'skill',
      target: cleanSlug,
      title: `Remove skill "${cleanSlug}"`,
      summary: String(reason || '').trim() || 'Removed skill (snapshot preserved for rollback)',
      status: 'applied',
      backup_manifest_path: join(backup.snapRoot, 'manifest.json'),
      can_rollback: true,
      created_at: new Date().toISOString(),
      rolled_back_at: null,
    })
    return { ok: true, evolution_id: evolutionId, entry, state: getStateSnapshot() }
  }

  function recordLesson({ title, summary = '', category = 'lesson', tags = [] }) {
    const cleanTitle = String(title || '').trim()
    if (!cleanTitle) return { ok: false, status: 400, error: 'title is required' }
    const cat = VALID_CATEGORIES.has(String(category || '').toLowerCase())
      ? String(category).toLowerCase()
      : 'lesson'
    const entry = appendEntry({
      id: `evo_${randomUUID().slice(0, 8)}`,
      kind: 'lesson',
      category: cat,
      target: '',
      title: cleanTitle,
      summary: String(summary || '').trim(),
      tags: Array.isArray(tags) ? tags.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 8) : [],
      status: 'noted',
      can_rollback: false,
      created_at: new Date().toISOString(),
      rolled_back_at: null,
    })
    return { ok: true, evolution_id: entry.id, entry, state: getStateSnapshot() }
  }

  function rollbackEvolution({ evolutionId }) {
    const id = String(evolutionId || '').trim()
    if (!id) return { ok: false, status: 400, error: 'evolutionId is required' }
    const doc = readLogDoc()
    const entry = doc.entries.find((e) => e.id === id)
    if (!entry) return { ok: false, status: 404, error: `Evolution record not found: ${id}` }
    if (!entry.can_rollback || !entry.backup_manifest_path) {
      return { ok: false, status: 400, error: `Evolution ${id} cannot be rolled back (status=${entry.status})` }
    }
    const manifest = readJsonSafe(entry.backup_manifest_path, null)
    if (!manifest) return { ok: false, status: 404, error: 'Backup manifest missing on disk' }

    try {
      restoreFromBackup(manifest)
    } catch (err) {
      return { ok: false, status: 500, error: err?.message || 'Rollback restore failed' }
    }

    const updated = updateEntry(id, {
      status: 'rolled_back',
      can_rollback: false,
      rolled_back_at: new Date().toISOString(),
    })
    return { ok: true, entry: updated, state: getStateSnapshot() }
  }

  function getStateSnapshot() {
    const skills = listInstalledSkills()
    const entries = readLogDoc().entries
    return {
      skills_dir: skillsDir,
      backups_dir: backupsDir,
      skills,
      entries: entries.slice(0, 80),
      stats: {
        skills_count: skills.length,
        evolutions_count: entries.length,
        verified_count: entries.filter((e) => e.status === 'verified').length,
        rolled_back_count: entries.filter((e) => e.status === 'rolled_back' || e.status === 'failed_rolled_back').length,
      },
      updated_at: new Date().toISOString(),
    }
  }

  return {
    setSkillsInvalidator,
    getStateSnapshot,
    listInstalledSkills,
    saveSkill,
    deleteSkill,
    recordLesson,
    rollbackEvolution,
  }
}
