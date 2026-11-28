/** The manifest's icon must be a self-contained SVG the Plugin Manager can decode. */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const svg = readFileSync(join(root, 'icon.svg'), 'utf8')
const problems = []
if (!/viewBox="0 0 36 36"/.test(svg)) problems.push('icon must use the 36-unit canvas')
for (const banned of ['<script', '<text', '<image', '<foreignObject', '<style', 'onload']) {
  if (svg.includes(banned)) problems.push(`icon must not contain ${banned}`)
}
if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) problems.push('icon needs the SVG namespace')
console.log(problems.length === 0 ? 'ok   icon is a self-contained 36-unit SVG' : `FAIL ${problems.join('; ')}`)
process.exitCode = problems.length === 0 ? 0 : 1
