import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DEFAULT_MAX_FILE_BYTES } from '../shared/protocol.js'

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.cache',
  '.npm',
  '.npm-global',
  '.pnpm-store',
  '.venv',
  'venv',
  '__pycache__',
])

// Directories that must never leave the sandbox via mesh file sharing, regardless of actor.
export const ALWAYS_DENIED_SEGMENTS = new Set([
  '.ssh',
  '.gnupg',
  '.dsh',
  '.dsh-sandbox',
  '.aws',
  '.kube',
  '.docker',
])

// Extra credential/key patterns refused when initiated by an Agent (prompt-injection exfiltration guard).
export const AGENT_DENIED_BASENAME = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|keystore)|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?|\.netrc|\.npmrc|\.pypirc|\.git-credentials)$/i

export function realpathOrResolve(targetPath) {
  try {
    return realpathSync(targetPath)
  } catch {
    return resolve(targetPath)
  }
}

export function isWithin(parent, child) {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export function safeFileName(rawName) {
  const base = basename(String(rawName || 'file.bin').trim())
  const cleaned = base.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/g, '_').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'shared-file.bin'
  return cleaned.slice(0, 180)
}

/** Pick a non-existing path inside `dir` (`report.txt`, `report-1.txt`, ...) so incoming shares never overwrite. */
export function uniqueFilePath(dir, fileName) {
  const first = join(dir, fileName)
  if (!existsSync(first)) return first
  const ext = extname(fileName)
  const stem = ext ? fileName.slice(0, -ext.length) : fileName
  for (let i = 1; i < 1000; i += 1) {
    const candidate = join(dir, `${stem}-${i}${ext}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(dir, `${stem}-${Date.now().toString(36)}${ext}`)
}

/** Base64 inflates payloads by 4/3; add headroom for the JSON envelope + message metadata. */
export function maxMeshBodyBytes(maxFileBytes = DEFAULT_MAX_FILE_BYTES) {
  return Math.ceil((Number(maxFileBytes) || DEFAULT_MAX_FILE_BYTES) * 4 / 3) + 1024 * 1024
}

/**
 * Search workspace files for `#` autocomplete, strictly confined inside `rootDir`
 * and skipping dependency caches and credential directories.
 */
export function searchWorkspaceFiles(rootDir, query = '', limit = 40) {
  if (!rootDir || !existsSync(rootDir)) return []
  const rawQuery = String(query || '').trim().replace(/^#/, '')
  const isAbsQuery = rawQuery.startsWith('/')
  const needle = rawQuery.toLowerCase()
  const rootReal = realpathOrResolve(rootDir)

  let startDir = rootDir
  let subNeedle = needle
  const lastSlash = rawQuery.lastIndexOf('/')
  if (isAbsQuery) {
    const dirPart = rawQuery.slice(0, lastSlash + 1)
    if (!isWithin(rootReal, realpathOrResolve(resolve(dirPart)))) return []
  }
  if (lastSlash >= 0) {
    const dirPart = rawQuery.slice(0, lastSlash + 1)
    const candidateDir = isAbsQuery ? resolve(dirPart) : resolve(rootDir, dirPart)
    if (existsSync(candidateDir) && isWithin(rootReal, realpathOrResolve(candidateDir))) {
      try {
        if (statSync(candidateDir).isDirectory()) {
          startDir = candidateDir
          subNeedle = rawQuery.slice(lastSlash + 1).toLowerCase()
        }
      } catch {}
    }
  }
  if (startDir === '/') return []

  const queue = [{ dir: startDir, depth: 0 }]
  const results = []
  let visited = 0
  const maxDepth = 5

  while (queue.length > 0 && results.length < limit && visited < 2500) {
    const { dir: current, depth } = queue.shift()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? 1 : -1
      return a.name.localeCompare(b.name)
    })

    for (const entry of entries) {
      if (results.length >= limit || visited >= 2500) break
      visited += 1
      const entryName = entry.name
      if (entry.isDirectory() && (IGNORED_DIRS.has(entryName) || ALWAYS_DENIED_SEGMENTS.has(entryName))) continue

      const fullPath = join(current, entryName)
      const relPath = isAbsQuery
        ? fullPath.split(sep).join('/')
        : relative(rootDir, fullPath).split(sep).join('/')

      const matchTarget = startDir !== rootDir ? entryName.toLowerCase() : relPath.toLowerCase()
      const matches = !subNeedle || matchTarget.includes(subNeedle) || entryName.toLowerCase().includes(subNeedle)

      if (entry.isDirectory()) {
        if (depth < maxDepth) {
          queue.push({ dir: fullPath, depth: depth + 1 })
        }
        if (matches) {
          results.push({
            name: entryName,
            relativePath: relPath.endsWith('/') ? relPath : `${relPath}/`,
            path: fullPath,
            type: 'directory',
            size: 0,
          })
        }
      } else if (entry.isFile() && matches) {
        let size = 0
        try {
          size = statSync(fullPath).size
        } catch {}
        results.push({
          name: entryName,
          relativePath: relPath,
          path: fullPath,
          type: 'file',
          size,
        })
      }
    }
  }

  results.sort((a, b) => {
    const aHidden = a.relativePath.startsWith('.') || a.relativePath.includes('/.')
    const bHidden = b.relativePath.startsWith('.') || b.relativePath.includes('/.')
    if (aHidden !== bHidden && !needle.startsWith('.')) return aHidden ? 1 : -1
    if (a.type !== b.type) return a.type === 'file' ? -1 : 1
    return a.relativePath.localeCompare(b.relativePath)
  })

  return results.slice(0, limit)
}

/**
 * Create a path confinement guard verifying that any file shared over the mesh lives within
 * `shareRoots` (after resolving symlinks) and is not a protected credential/config file.
 */
export function createFileShareGuard({ homeDir, shareRoots, protectedFiles }) {
  const normalizedRoots = (Array.isArray(shareRoots) && shareRoots.length > 0 ? shareRoots : [homeDir])
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .map(realpathOrResolve)
  const deniedFiles = new Set((protectedFiles || []).filter(Boolean).map(realpathOrResolve))

  return function resolveShareableFile(rawRef, actor = 'human') {
    const trimmed = String(rawRef || '').trim().replace(/^#/, '')
    if (!trimmed) return { ok: false, status: 400, error: 'A local file path is required' }
    let candidate = isAbsolute(trimmed) ? resolve(trimmed) : resolve(homeDir, trimmed)
    if (!isAbsolute(trimmed) && !existsSync(candidate)) {
      const collabCandidate = resolve(homeDir, 'collab-space', trimmed)
      if (existsSync(collabCandidate)) candidate = collabCandidate
    }
    if (!existsSync(candidate)) return { ok: false, status: 404, error: `File not found: ${trimmed}` }

    const real = realpathOrResolve(candidate)
    const matchedRoot = normalizedRoots.find((r) => isWithin(r, real))
    if (!matchedRoot) {
      return { ok: false, status: 403, error: `Refusing to share files outside the workspace: ${trimmed}` }
    }
    const segments = relative(matchedRoot, real).split(sep)
    if (deniedFiles.has(real) || segments.some((s) => ALWAYS_DENIED_SEGMENTS.has(s))) {
      return { ok: false, status: 403, error: `Refusing to share a protected credential/config path: ${trimmed}` }
    }
    if (actor !== 'human' && AGENT_DENIED_BASENAME.test(basename(real))) {
      return {
        ok: false,
        status: 403,
        error: `Agents may not share secret-like files (${basename(real)}); ask the human to share it explicitly`,
      }
    }
    return { ok: true, path: real }
  }
}

const IMAGE_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
}

const TEXT_PREVIEW_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.csv', '.tsv', '.log', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.js', '.mjs', '.cjs',
  '.ts', '.mts', '.cts', '.jsx', '.tsx', '.css', '.scss', '.less', '.html', '.htm', '.xml', '.svg',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sql',
  '.swift', '.dart', '.lua', '.r', '.diff', '.patch', '.sha256', '.lock', '.env', '.gitignore',
])

const TEXT_PREVIEW_NAMES = new Set([
  'readme', 'license', 'dockerfile', 'makefile', 'changelog',
])

/**
 * Classify a shared attachment for safe download or inline preview.
 * HTML/SVG are intentionally served as `text/plain` inline so preview never executes embedded scripts.
 */
export function classifyAttachmentFile(fileName) {
  const base = basename(String(fileName || 'file.bin')).toLowerCase()
  const ext = extname(base).toLowerCase()
  if (IMAGE_MIME_BY_EXT[ext]) {
    return {
      kind: 'image',
      mimeType: IMAGE_MIME_BY_EXT[ext],
      inlineMimeType: IMAGE_MIME_BY_EXT[ext],
    }
  }
  if (ext === '.md' || ext === '.markdown') {
    return {
      kind: 'markdown',
      mimeType: 'text/markdown; charset=utf-8',
      inlineMimeType: 'text/plain; charset=utf-8',
    }
  }
  if (ext === '.json') {
    return {
      kind: 'text',
      mimeType: 'application/json; charset=utf-8',
      inlineMimeType: 'text/plain; charset=utf-8',
    }
  }
  if (ext === '.csv') {
    return {
      kind: 'text',
      mimeType: 'text/csv; charset=utf-8',
      inlineMimeType: 'text/plain; charset=utf-8',
    }
  }
  if (TEXT_PREVIEW_EXTS.has(ext) || TEXT_PREVIEW_NAMES.has(base)) {
    return {
      kind: 'text',
      mimeType: 'text/plain; charset=utf-8',
      inlineMimeType: 'text/plain; charset=utf-8',
    }
  }
  if (ext === '.pdf') {
    return {
      kind: 'binary',
      mimeType: 'application/pdf',
      inlineMimeType: 'application/octet-stream',
    }
  }
  return {
    kind: 'binary',
    mimeType: 'application/octet-stream',
    inlineMimeType: 'application/octet-stream',
  }
}
