/**
 * File manager — Host half.
 *
 * Owns the server-side file operations the browser page calls over the
 * `fileManager` Remote namespace, plus three exact Fetch routes for bytes the
 * Remote protocol cannot carry itself:
 *
 * - `GET/HEAD /api/file-manager.download` streams one file to the browser.
 * - `GET/HEAD /api/file-manager.raw` serves one file inline for image and PDF
 *   previews.
 * - `POST /api/file-manager.upload` receives a raw multipart body and writes
 *   each file part into a server directory.
 *
 * The routes come from Connection's exact-route registry, so they inherit the
 * same loopback/Origin trust fence, signed browser cookie, and owner-only rule
 * every other `/api` route uses. Every path the page names is checked against
 * the configured roots here, on the Host, so the browser cannot widen its own
 * reach.
 */

import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { Readable } from 'node:stream'
import { collectEntries, zipStream } from './src/zip.js'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** Default directory entries returned by one listing. */
const DEFAULT_MAX_ENTRIES = 5000
/** Default cap on one text file returned for the inline preview. */
const DEFAULT_MAX_PREVIEW_BYTES = 1024 * 1024
/** Default cap on one image or PDF returned for the inline preview. */
const DEFAULT_MAX_BINARY_PREVIEW_BYTES = 8 * 1024 * 1024
/** Default cap on one upload. */
const DEFAULT_MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
/** Default cap on the number of files one archive may contain. */
const DEFAULT_MAX_ARCHIVE_ENTRIES = 20000
/** The multipart envelope's own overhead allowance. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

/** Extensions presented as text. */
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'json5', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env',
  'js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx', 'vue', 'svelte', 'css', 'scss', 'sass', 'less',
  'html', 'htm', 'xml', 'svg', 'csv', 'tsv', 'log', 'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'lua', 'sql',
  'swift', 'dart', 'scala', 'clj', 'ex', 'exs', 'erl', 'hs', 'ml', 'r', 'pl', 'vim', 'properties',
  'gradle', 'lock', 'diff', 'patch', 'graphql', 'proto',
])

/** Names that are text without carrying an extension. */
const TEXT_NAMES = new Set([
  'dockerfile', 'makefile', 'readme', 'license', 'licence', 'changelog', 'cmakelists', '.gitignore', '.env',
])

/** Media types for presented image previews. */
const IMAGE_MEDIA_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

/** A `file-manager/*` failure carrying a stable code the page branches on. */
class FileManagerError extends Error {
  /**
   * @param code - stable wire code.
   * @param message - human-readable detail.
   */
  constructor(code, message) {
    super(message)
    this.name = 'FileManagerError'
    this.code = code
  }
}

/**
 * Read the deployment knobs out of the bundle row's `config`.
 * @param config - raw config object from the patch row.
 * @returns the normalized settings.
 */
function settings(config) {
  const raw = config ?? {}
  const positive = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback)
  return {
    roots: Array.isArray(raw.roots) ? raw.roots.filter(root => typeof root === 'string' && root.trim() !== '') : [],
    startPath: typeof raw.startPath === 'string' ? raw.startPath : '',
    allowOutsideRoots: raw.allowOutsideRoots === true,
    maxEntries: positive(raw.maxEntries, DEFAULT_MAX_ENTRIES),
    maxPreviewBytes: positive(raw.maxPreviewBytes, DEFAULT_MAX_PREVIEW_BYTES),
    maxBinaryPreviewBytes: positive(raw.maxBinaryPreviewBytes, DEFAULT_MAX_BINARY_PREVIEW_BYTES),
    maxUploadBytes: positive(raw.maxUploadBytes, DEFAULT_MAX_UPLOAD_BYTES),
    maxArchiveEntries: positive(raw.maxArchiveEntries, DEFAULT_MAX_ARCHIVE_ENTRIES),
    showHidden: raw.showHidden === true,
  }
}

/**
 * Resolve a real path, falling back to the input when it does not exist yet.
 * @param path - candidate path.
 * @returns the real path, or the input.
 */
async function realpathOrSelf(path) {
  try {
    return await realpath(path)
  } catch {
    return path
  }
}

/**
 * Resolve one path against the configured roots and refuse everything outside
 * them. Containment is decided on real paths, so a symlink cannot escape.
 * @param config - normalized settings.
 * @param raw - the path the browser named.
 * @returns the absolute path to use.
 */
async function confine(config, raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new FileManagerError('file-manager/invalid-name', 'A path is required')
  }
  const target = resolve(raw)
  if (config.allowOutsideRoots || config.roots.length === 0) return target
  const [roots, real] = await Promise.all([
    Promise.all(config.roots.map(root => realpathOrSelf(resolve(root)))),
    realpathOrSelf(target),
  ])
  const inside = roots.some((root) => {
    const normalized = root.endsWith(sep) ? root : `${root}${sep}`
    return real === root || real.startsWith(normalized)
  })
  if (!inside) {
    throw new FileManagerError('file-manager/not-allowed', `"${raw}" is outside the browsable roots`)
  }
  return real
}

/**
 * Refuse a name that would not stay a direct child of its directory.
 * @param name - proposed entry name.
 * @returns the trimmed name.
 */
function validName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed === '' || trimmed === '.' || trimmed === '..' || trimmed.includes('/') || trimmed.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new FileManagerError('file-manager/invalid-name', `"${name}" is not a valid name`)
  }
  return trimmed
}

/**
 * Media type for an inline preview or download by extension.
 * @param name - file name.
 * @returns the media type.
 */
function mediaTypeOf(name) {
  const ext = extname(name).slice(1).toLowerCase()
  if (ext === 'pdf') return 'application/pdf'
  return IMAGE_MEDIA_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * Stat one path into the plugin's own vocabulary.
 * @param path - absolute path.
 * @returns type and size, or `undefined` when absent.
 */
async function statInfo(path) {
  try {
    const info = await stat(path)
    const modified = info.mtimeMs
    if (info.isDirectory()) return { type: 'directory', size: 0, modified }
    if (info.isFile()) return { type: 'file', size: info.size, modified }
    return { type: 'other', size: 0, modified }
  } catch {
    return undefined
  }
}

/**
 * Read one byte window of a file.
 * @param path - absolute file path.
 * @param offset - zero-based first byte.
 * @param length - maximum byte count.
 * @returns the bytes.
 */
async function readRange(path, offset, length) {
  if (length <= 0) return Buffer.alloc(0)
  const chunks = []
  for await (const chunk of createReadStream(path, { start: offset, end: offset + length - 1 })) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/**
 * Turn a Node read stream into a web stream a Fetch response can carry.
 * @param stream - Node readable.
 * @returns the web body.
 */
function streamBody(stream) {
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => { controller.enqueue(new Uint8Array(chunk)) })
      stream.on('end', () => { controller.close() })
      stream.on('error', (error) => { controller.error(error) })
    },
    cancel() {
      stream.destroy()
    },
  })
}

/**
 * JSON failure response for the byte routes.
 * @param status - HTTP status.
 * @param message - the message the page shows.
 * @returns the response.
 */
function jsonError(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Map a failure to its HTTP status.
 * @param cause - the thrown value.
 * @returns the status code.
 */
function statusOf(cause) {
  if (cause instanceof FileManagerError) {
    switch (cause.code) {
      case 'file-manager/not-found': return 404
      case 'file-manager/not-allowed': return 403
      case 'file-manager/already-exists': return 409
      case 'file-manager/too-large': return 413
      case 'file-manager/invalid-name': return 400
      default: return 500
    }
  }
  return 500
}

/**
 * Present a caught value as a message.
 * @param cause - the thrown value.
 * @returns the message.
 */
function messageOf(cause) {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * Plain text response helper.
 * @param status - HTTP status.
 * @param message - message the page shows.
 * @returns the response.
 */
function plainText(status, message) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/**
 * Read the Node error code of a caught value.
 * @param cause - the thrown value.
 * @returns the code, when present.
 */
function errorCodeOf(cause) {
  return typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : undefined
}

/**
 * Read the multipart boundary out of a content type.
 * @param contentType - request content type.
 * @returns the boundary, or `undefined`.
 */
function boundaryOf(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  return (match?.[1] ?? match?.[2])?.trim() || undefined
}

/**
 * Write one block into an open sink, respecting backpressure.
 * @param stream - the part's write stream.
 * @param chunk - bytes to write.
 * @returns once the block is accepted.
 */
function writeChunk(stream, chunk) {
  if (chunk.length === 0) return Promise.resolve()
  return new Promise((resolveWrite, rejectWrite) => {
    stream.write(chunk, (error) => { error ? rejectWrite(error) : resolveWrite() })
  })
}

/**
 * Drop one multipart part's own trailing CRLF.
 * @param chunk - the part body captured before the delimiter.
 * @returns the body without its final CRLF.
 */
function withoutTrailingCrlf(chunk) {
  return chunk.length >= 2 && chunk[chunk.length - 2] === 13 && chunk[chunk.length - 1] === 10
    ? chunk.subarray(0, chunk.length - 2)
    : chunk
}

/**
 * Parse one multipart body and write each file part into the target directory.
 * @param body - the request body stream.
 * @param boundary - multipart boundary.
 * @param directory - destination directory.
 * @param maxBytes - cap on the whole upload.
 * @returns one acknowledgment per written file.
 */
async function writeMultipart(body, boundary, directory, maxBytes, overwrite) {
  const reader = body.getReader()
  const decoder = new TextDecoder('latin1')
  const breakBytes = Buffer.from(`\r\n--${boundary}`)
  let pending = Buffer.alloc(0)
  let seen = 0
  let stream
  let sink
  let filename
  let inHeaders = true
  const written = []
  const conflicts = []
  let aborted = false

  const finishPart = async () => {
    if (stream === undefined) return
    const current = stream
    stream = undefined
    current.end()
    await sink
    if (filename !== undefined) written.push({ path: join(directory, filename) })
  }

  const startPart = async (headerText) => {
    inHeaders = false
    filename = undefined
    const match = /(?:filename\*=(?:UTF-8'')?"?([^";\r\n]+)"?|filename="([^"\r\n]+)")/i.exec(headerText)
    const raw = (match?.[1] ?? match?.[2])?.trim()
    if (raw === undefined || raw === '') return
    filename = validName(decodeURIComponent(raw))
    if (!overwrite) {
      if (await statInfo(join(directory, filename)) !== undefined) {
        // Record the clash and stop reading; the caller answers 409 and no file
        // is touched, so an upload can never silently replace existing data.
        conflicts.push(filename)
        filename = undefined
        aborted = true
        return
      }
    }
    stream = createWriteStream(join(directory, filename), { flags: overwrite ? 'w' : 'wx' })
    sink = new Promise((resolveSink, rejectSink) => {
      stream.on('finish', () => { resolveSink() })
      stream.on('error', rejectSink)
    })
  }

  const fill = async () => {
    const next = await reader.read()
    if (next.done) return false
    seen += next.value.byteLength
    if (seen > maxBytes + MULTIPART_OVERHEAD_BYTES) {
      throw new FileManagerError('file-manager/too-large', `Upload exceeds the ${maxBytes} byte limit`)
    }
    pending = Buffer.concat([pending, Buffer.from(next.value)])
    return true
  }

  try {
    for (;;) {
      if (inHeaders) {
        const end = pending.indexOf('\r\n\r\n')
        if (end < 0) {
          if (!await fill()) break
          continue
        }
        const headerText = decoder.decode(pending.subarray(0, end))
        pending = pending.subarray(end + 4)
        await startPart(headerText)
        if (aborted) break
        continue
      }
      const next = pending.indexOf(breakBytes)
      if (next < 0) {
        // Hold back the bytes that could still begin the delimiter.
        const keep = Math.min(pending.length, breakBytes.length - 1)
        const cut = pending.length - keep
        if (cut > 0) {
          await writeChunk(stream, pending.subarray(0, cut))
          pending = pending.subarray(cut)
        }
        if (!await fill()) {
          // The body ended before the closing delimiter: the part is incomplete.
          throw new FileManagerError('file-manager/invalid-name', 'The upload body ended before its closing boundary')
        }
        continue
      }
      await writeChunk(stream, pending.subarray(0, next))
      pending = pending.subarray(next + breakBytes.length)
      await finishPart()
      if (aborted) break
      if (pending.subarray(0, 2).toString('latin1') === '--') break
      if (pending.subarray(0, 2).toString('latin1') === '\r\n') pending = pending.subarray(2)
      inHeaders = true
    }
    if (aborted) {
      // Remove whatever an interrupted body already wrote before the clash.
      for (const entry of written) await rm(entry.path, { force: true }).catch(() => {})
      return { written: [], conflicts }
    }
    await finishPart()
    return { written, conflicts }
  } finally {
    reader.releaseLock()
    if (stream !== undefined) stream.destroy()
  }
}

/** Symbol slot the Typert protocol stores its Remote method markers in. */
const REMOTE_METHOD_DESCRIPTOR = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Methods exported on the `fileManager` Remote namespace. */
const EXPORTED_METHODS = ['list', 'createDirectory', 'rename', 'deleteEntries', 'preview', 'startPath']

/**
 * Record the same prototype marker `@Remote` leaves behind on a compiled
 * service, for a module authored as plain JavaScript.
 * @param serviceClass - the service class to mark.
 * @param methods - method names exposed on the Remote namespace.
 */
function markRemoteMethods(serviceClass, methods) {
  const current = Object.getOwnPropertyDescriptor(serviceClass.prototype, REMOTE_METHOD_DESCRIPTOR)?.value
  const markers = methods.map(method => Object.freeze({
    method,
    invocation: Object.freeze({ kind: 'direct' }),
  }))
  Object.defineProperty(serviceClass.prototype, REMOTE_METHOD_DESCRIPTOR, {
    configurable: true,
    value: Object.freeze({ version: 1, methods: Object.freeze([...(current?.methods ?? []), ...markers]) }),
  })
}

/**
 * The server-side file manager: one Cordis service and one Remote namespace.
 *
 * Cordis rebinds `this.ctx` to the accessing Context, so the route
 * registrations and the Remote methods both run as effects of the plugin's
 * own fiber and disappear together when it unloads.
 */
export class FileManager extends TypertRemoteService {
  static inject = ['connection']

  /**
   * @param ctx - Host plugin context.
   * @param rawConfig - the bundle row's config.
   */
  constructor(ctx, rawConfig) {
    super(ctx, 'fileManager')
    this.config = settings(rawConfig)
    // `this.ctx` is only assigned once Service's constructor returns, so the
    // effect registers through the context Cordis passed in.
    ctx.effect(() => this.registerRoutes(ctx), 'file-manager: routes')
  }

  /**
   * List one directory.
   * @param path - absolute directory path.
   * @param showHidden - whether dot entries are included; the config value applies when omitted.
   * @returns entries, the parent to offer, and the browsable roots.
   */
  list(path, showHidden) {
    const config = this.config
    const includeHidden = config.showHidden || showHidden === true
    return (async () => {
      const target = await confine(config, path)
      const info = await statInfo(target)
      if (info === undefined) throw new FileManagerError('file-manager/not-found', `"${target}" does not exist`)
      if (info.type !== 'directory') {
        throw new FileManagerError('file-manager/not-directory', `"${target}" is not a directory`)
      }
      let children
      try {
        children = await readdir(target, { withFileTypes: true, encoding: 'buffer' })
      } catch (cause) {
        throw new FileManagerError('file-manager/io', `cannot list "${target}": ${messageOf(cause)}`)
      }
      const entries = []
      let unaddressable = 0
      for (const child of children) {
        const name = child.name.toString('utf8')
        // A name whose bytes are not valid UTF-8 cannot be named back to the
        // Host, so it is left out rather than offered as a broken row.
        if (!Buffer.from(name, 'utf8').equals(child.name)) {
          unaddressable += 1
          continue
        }
        if (!includeHidden && name.startsWith('.')) continue
        const childPath = join(target, name)
        const childInfo = await statInfo(childPath)
        entries.push({
          name,
          path: childPath,
          type: childInfo?.type ?? 'other',
          size: childInfo?.size ?? 0,
          modified: childInfo?.modified ?? 0,
        })
      }
      entries.sort((a, b) => {
        if (a.type !== b.type) {
          if (a.type === 'directory') return -1
          if (b.type === 'directory') return 1
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      return {
        path: target,
        parent: parentOf(config, target),
        roots: config.roots.map(root => resolve(root)),
        entries: entries.slice(0, config.maxEntries),
        truncated: entries.length > config.maxEntries,
        unaddressable,
        // True when the Host shows dot entries regardless of the page's toggle.
        hiddenForced: config.showHidden,
      }
    })()
  }

  /**
   * Create one directory.
   * @param parent - absolute parent directory.
   * @param name - new directory name.
   * @returns the created path.
   */
  async createDirectory(parent, name) {
    const directory = await confine(this.config, parent)
    const created = join(directory, validName(name))
    try {
      await mkdir(created)
    } catch (cause) {
      if (errorCodeOf(cause) === 'EEXIST') {
        throw new FileManagerError('file-manager/already-exists', `"${created}" already exists`)
      }
      throw new FileManagerError('file-manager/io', `cannot create "${created}": ${messageOf(cause)}`)
    }
    return { path: created }
  }

  /**
   * Rename one file or directory in place.
   * @param path - absolute path to rename.
   * @param name - the new base name.
   * @returns the renamed path.
   */
  async rename(path, name) {
    const source = await confine(this.config, path)
    if (await statInfo(source) === undefined) {
      throw new FileManagerError('file-manager/not-found', `"${source}" does not exist`)
    }
    if (isBrowsableRoot(this.config, source)) {
      throw new FileManagerError('file-manager/not-allowed', `"${source}" is a browsable root and cannot be renamed`)
    }
    const next = validName(name)
    if (next === basename(source)) return { path: source }
    const destination = join(dirname(source), next)
    if (await statInfo(destination) !== undefined) {
      throw new FileManagerError('file-manager/already-exists', `"${destination}" already exists`)
    }
    try {
      await rename(source, destination)
    } catch (cause) {
      throw new FileManagerError('file-manager/io', `cannot rename "${source}": ${messageOf(cause)}`)
    }
    return { path: destination }
  }

  /**
   * Delete files and directories; a directory is removed with its contents,
   * which is what the page's confirmation states.
   * @param paths - absolute paths to delete.
   * @returns one entry per deleted path.
   */
  async deleteEntries(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new FileManagerError('file-manager/invalid-name', 'Nothing to delete')
    }
    // Every path is attempted and reported: a partial deletion must be visible
    // to the page, never guessed from one overall failure.
    const done = []
    for (const raw of paths) {
      try {
        const target = await confine(this.config, raw)
        if (isBrowsableRoot(this.config, target)) {
          throw new FileManagerError('file-manager/not-allowed', `"${target}" is a browsable root and cannot be deleted`)
        }
        if (await statInfo(target) === undefined) {
          // A child of an entry this request already deleted counts as gone.
          if (done.some(entry => entry.ok && target.startsWith(`${entry.path}${sep}`))) {
            done.push({ path: target, ok: true })
            continue
          }
          throw new FileManagerError('file-manager/not-found', `"${target}" does not exist`)
        }
        await rm(target, { recursive: true, force: false })
        done.push({ path: target, ok: true })
      } catch (cause) {
        done.push({ path: String(raw), ok: false, error: messageOf(cause) })
      }
    }
    return done
  }

  /**
   * Read one file for an inline preview.
   * @param path - absolute file path.
   * @returns a text prefix, image/PDF bytes, or a binary notice.
   */
  async preview(path) {
    const target = await confine(this.config, path)
    const info = await statInfo(target)
    if (info === undefined) throw new FileManagerError('file-manager/not-found', `"${target}" does not exist`)
    if (info.type !== 'file') {
      throw new FileManagerError('file-manager/not-file', `"${target}" is not a regular file`)
    }
    const size = info.size
    const ext = extname(target).slice(1).toLowerCase()
    const imageType = IMAGE_MEDIA_TYPES[ext]
    if (imageType !== undefined) {
      return { path: target, kind: 'image', mediaType: imageType, size, truncated: false }
    }
    if (ext === 'pdf') {
      return { path: target, kind: 'pdf', mediaType: 'application/pdf', size, truncated: false }
    }
    const declaredText = TEXT_EXTENSIONS.has(ext) || TEXT_NAMES.has(basename(target).toLowerCase())
    if (!declaredText) {
      const head = await readRange(target, 0, Math.min(size, 4096))
      if (head.includes(0)) {
        return { path: target, kind: 'binary', mediaType: mediaTypeOf(target), size, truncated: false }
      }
    }
    const limit = this.config.maxPreviewBytes
    const bytes = await readRange(target, 0, Math.min(size, limit))
    return {
      path: target,
      kind: 'text',
      mediaType: 'text/plain',
      text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
      size,
      truncated: size > limit,
    }
  }

  /**
   * The directory the page opens at when it has no other preference.
   * @returns the configured start path, the first root, or the filesystem root.
   */
  async startPath() {
    const configured = this.config.startPath.trim()
    const candidates = configured !== ''
      ? [resolve(configured)]
      : this.config.roots.length > 0
        ? [resolve(this.config.roots[0])]
        : [resolve(homedir()), resolve('/')]
    for (const candidate of candidates) {
      try {
        const info = await statInfo(candidate)
        if (info?.type === 'directory') return await confine(this.config, candidate)
      } catch {
        // A start path the roots refuse falls through to the next candidate.
      }
    }
    return this.config.roots.length > 0 ? resolve(this.config.roots[0]) : resolve('/')
  }

  /**
   * Register the transfer routes.
   * @returns the disposer of both registrations.
   */
  registerRoutes(ctx) {
    const { config } = this
    if (config.allowOutsideRoots && config.roots.length === 0) {
      ctx.logger.info('[file-manager] whole-filesystem mode: this page can write any directory the Host process can')
    }
    const disposers = [
      ctx.connection.fetch.register({
        path: '/api/file-manager.download',
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: request => this.download(request),
      }),
      ctx.connection.fetch.register({
        path: '/api/file-manager.raw',
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: request => this.raw(request),
      }),
      ctx.connection.fetch.register({
        path: '/api/file-manager.zip',
        methods: ['GET', 'HEAD'],
        requestBody: 'buffered',
        fetch: request => this.zip(request),
      }),
      ctx.connection.fetch.register({
        path: '/api/file-manager.upload',
        methods: ['POST'],
        requestBody: 'streaming',
        fetch: request => this.upload(request),
      }),
    ]
    return () => {
      for (const dispose of disposers) void dispose()
    }
  }

  /**
   * Stream one file to the browser as a download.
   * @param request - authenticated GET/HEAD carrying `path`.
   * @returns the file response.
   */
  async download(request) {
    const url = new URL(request.url)
    try {
      const target = await confine(this.config, url.searchParams.get('path') ?? '')
      const info = await stat(target)
      if (!info.isFile()) return plainText(404, `"${target}" is not a regular file`)
      const name = basename(target)
      const headers = {
        'content-type': mediaTypeOf(name),
        'content-length': String(info.size),
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      }
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
      return new Response(streamBody(createReadStream(target)), { status: 200, headers })
    } catch (cause) {
      return plainText(statusOf(cause), messageOf(cause))
    }
  }

  /**
   * Stream a ZIP of the selected paths; a directory is added with its contents.
   * @param request - authenticated GET/HEAD carrying repeated `path` parameters.
   * @returns the archive response.
   */
  async zip(request) {
    const url = new URL(request.url)
    try {
      const requested = url.searchParams.getAll('path')
      if (requested.length === 0) return jsonError(400, 'expected at least one path')
      const targets = []
      for (const raw of requested) targets.push(await confine(this.config, raw))
      const skipped = []
      const { entries, skipped: unreadable } = await collectEntries(targets, async (directory) => {
        const children = await readdir(directory, { withFileTypes: true })
        return children.map(child => ({ name: child.name.toString('utf8') }))
      })
      skipped.push(...unreadable)
      if (entries.length === 0) return jsonError(404, 'nothing to archive')
      if (entries.length > this.config.maxArchiveEntries) {
        return jsonError(413, `the selection exceeds ${this.config.maxArchiveEntries} files`)
      }
      const name = requested.length === 1
        ? `${basename(targets[0]) || 'files'}.zip`
        : `selection-${new Date().toISOString().slice(0, 10)}.zip`
      const headers = {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      }
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
      const body = Readable.toWeb(zipStream(entries))
      return new Response(body, { status: 200, headers })
    } catch (cause) {
      return jsonError(statusOf(cause), messageOf(cause))
    }
  }

  /**
   * Serve one file inline for the page's image and PDF previews.
   * @param request - authenticated GET/HEAD carrying `path`.
   * @returns the file response without a download disposition.
   */
  async raw(request) {
    const url = new URL(request.url)
    try {
      const target = await confine(this.config, url.searchParams.get('path') ?? '')
      const info = await stat(target)
      if (!info.isFile()) return plainText(404, `"${target}" is not a regular file`)
      const headers = {
        'content-type': mediaTypeOf(basename(target)),
        'content-length': String(info.size),
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      }
      if (request.method === 'HEAD') return new Response(null, { status: 200, headers })
      return new Response(streamBody(createReadStream(target)), { status: 200, headers })
    } catch (cause) {
      return plainText(statusOf(cause), messageOf(cause))
    }
  }

  /**
   * Receive one raw multipart body and write each file part into `dir`.
   * @param request - authenticated POST whose body is `multipart/form-data`.
   * @returns one acknowledgment per written file.
   */
  async upload(request) {
    const url = new URL(request.url)
    try {
      const directory = await confine(this.config, url.searchParams.get('dir') ?? '')
      const info = await statInfo(directory)
      if (info === undefined) throw new FileManagerError('file-manager/not-found', `"${directory}" does not exist`)
      if (info.type !== 'directory') {
        throw new FileManagerError('file-manager/not-directory', `"${directory}" is not a directory`)
      }
      const boundary = boundaryOf(request.headers.get('content-type') ?? '')
      if (boundary === undefined) return jsonError(400, 'expected a multipart/form-data body')
      if (request.body === null) return jsonError(400, 'expected an upload body')
      const overwrite = url.searchParams.get('overwrite') === '1'
      const files = await writeMultipart(request.body, boundary, directory, this.config.maxUploadBytes, overwrite)
      if (files.conflicts.length > 0) {
        // Nothing was written: the page asks the reader and repeats with overwrite.
        return new Response(JSON.stringify({ conflicts: files.conflicts }), {
          status: 409,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      return new Response(JSON.stringify({ files: files.written }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    } catch (cause) {
      return jsonError(statusOf(cause), messageOf(cause))
    }
  }
}

// The decorator pipeline is not available to a hand-authored module, so the
// exported methods carry the same protocol marker `@Remote` would record.
markRemoteMethods(FileManager, EXPORTED_METHODS)

/**
 * Whether a path is one of the configured browsable roots, or the filesystem
 * root. Such a path stays even in whole-filesystem mode, so the page cannot
 * delete or rename the place it browses from.
 * @param config - normalized settings.
 * @param path - absolute path.
 * @returns whether the path is a browsable root.
 */
function isBrowsableRoot(config, path) {
  const target = resolve(path)
  return target === resolve('/') || config.roots.some(root => resolve(root) === target)
}

/**
 * The directory one level up, or `null` when the directory is a boundary.
 * @param config - normalized settings.
 * @param path - absolute directory path.
 * @returns the parent to offer.
 */
function parentOf(config, path) {
  const parent = dirname(path)
  if (parent === path) return null
  if (config.allowOutsideRoots || config.roots.length === 0) return parent
  const roots = config.roots.map(root => resolve(root))
  if (roots.includes(path)) return null
  const inside = roots.some((root) => {
    const normalized = root.endsWith(sep) ? root : `${root}${sep}`
    return parent === root || parent.startsWith(normalized)
  })
  return inside ? parent : null
}

export default FileManager