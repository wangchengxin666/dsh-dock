/**
 * File manager — ZIP writer.
 *
 * Builds a ZIP archive as a Node readable stream so a directory or a selection
 * of entries can be downloaded without buffering it in memory first. Entries
 * use deflate, falling back to store when compression does not help; sizes are
 * streamed through data descriptors, so nothing needs to be read twice.
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { createDeflateRaw } from 'node:zlib'

/** CRC-32 lookup table, built once. */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1
    table[index] = value
  }
  return table
})()

/**
 * Update a running CRC-32 with one chunk.
 * @param crc - previous CRC value.
 * @param chunk - bytes to fold in.
 * @returns the new CRC value.
 */
function crc32(crc, chunk) {
  let value = crc
  for (let index = 0; index < chunk.length; index += 1) {
    value = CRC_TABLE[(value ^ chunk[index]) & 0xFF] ^ (value >>> 8)
  }
  return value >>> 0
}

/**
 * Encode a timestamp as the DOS date and time pair a ZIP header carries.
 * @param milliseconds - epoch milliseconds.
 * @returns `{ time, date }` values.
 */
function dosDateTime(milliseconds) {
  const date = new Date(Number.isFinite(milliseconds) ? milliseconds : Date.now())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, date: day }
}

/**
 * One file to place in the archive.
 * @typedef {{ name: string, path: string, size: number, mtime: number }} ZipEntry
 */

/**
 * Walk one selected path into archive entries.
 * @param path - absolute source path.
 * @param name - name inside the archive.
 * @param listDirectory - reads one directory's children.
 * @param onSkip - receives a path the walk could not read.
 * @returns the entries found.
 */
async function collect(path, name, listDirectory, onSkip) {
  const info = await stat(path).catch(() => undefined)
  if (info === undefined) {
    onSkip(path)
    return []
  }
  if (info.isFile()) {
    return [{ name, path, size: info.size, mtime: info.mtimeMs }]
  }
  if (!info.isDirectory()) return []
  const entries = []
  let children
  try {
    children = await listDirectory(path)
  } catch {
    onSkip(path)
    return []
  }
  for (const child of children) {
    entries.push(...await collect(join(path, child.name), `${name}/${child.name}`, listDirectory, onSkip))
  }
  return entries
}

/**
 * Collect archive entries for a selection.
 * @param paths - absolute paths to include.
 * @param listDirectory - reads one directory's children.
 * @returns the flattened entry list in stable order.
 */
export async function collectEntries(paths, listDirectory) {
  const entries = []
  const skipped = []
  for (const path of paths) {
    entries.push(...await collect(path, basename(path) || 'root', listDirectory, (skippedPath) => { skipped.push(skippedPath) }))
  }
  entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }))
  return { entries, skipped }
}

/**
 * Stream one archive over the entries.
 * @param entries - files to write.
 * @returns a Node readable of ZIP bytes.
 */
export function zipStream(entries) {
  return Readable.from(generate(entries), { objectMode: false })
}

/**
 * Yield the archive's bytes piece by piece.
 * @param entries - files to write.
 * @returns the byte chunks.
 */
async function* generate(entries) {
  const central = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const { time, date } = dosDateTime(entry.mtime)
    // Bit 3: sizes and CRC follow the data; bit 11: the name is UTF-8.
    const flags = 0x0008 | 0x0800
    const headerOffset = offset

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034B50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(flags, 6)
    localHeader.writeUInt16LE(8, 8)
    localHeader.writeUInt16LE(time, 10)
    localHeader.writeUInt16LE(date, 12)
    // CRC, compressed size, and uncompressed size stay zero until the descriptor.
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)
    yield localHeader
    yield name
    offset += localHeader.length + name.length

    let crc = 0xFFFFFFFF
    let uncompressed = 0
    let compressed = 0
    const deflate = createDeflateRaw({ level: 6 })

    const source = createReadStream(entry.path)
    source.on('error', (error) => { deflate.destroy(error) })

    // Feed the deflater while a separate pass counts CRC and sizes.
    source.on('data', (chunk) => {
      crc = crc32(crc, chunk)
      uncompressed += chunk.length
    })
    source.pipe(deflate)

    for await (const chunk of deflate) {
      compressed += chunk.length
      yield chunk
    }
    // `data` handlers run before the stream ends; the counts are complete here.
    const finalCrc = (crc ^ 0xFFFFFFFF) >>> 0

    const descriptor = Buffer.alloc(16)
    descriptor.writeUInt32LE(0x08074B50, 0)
    descriptor.writeUInt32LE(finalCrc, 4)
    descriptor.writeUInt32LE(compressed, 8)
    descriptor.writeUInt32LE(uncompressed, 12)
    yield descriptor
    offset += compressed + descriptor.length

    central.push({ name, time, date, crc: finalCrc, compressed, uncompressed, headerOffset })
  }

  const centralStart = offset
  for (const record of central) {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014B50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0008 | 0x0800, 8)
    header.writeUInt16LE(8, 10)
    header.writeUInt16LE(record.time, 12)
    header.writeUInt16LE(record.date, 14)
    header.writeUInt32LE(record.crc, 16)
    header.writeUInt32LE(record.compressed, 20)
    header.writeUInt32LE(record.uncompressed, 24)
    header.writeUInt16LE(record.name.length, 28)
    // Extra field, comment, disk number, internal and external attributes.
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(record.headerOffset, 42)
    yield header
    yield record.name
    offset += header.length + record.name.length
  }

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054B50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(offset - centralStart, 12)
  end.writeUInt32LE(centralStart, 16)
  end.writeUInt16LE(0, 20)
  yield end
}