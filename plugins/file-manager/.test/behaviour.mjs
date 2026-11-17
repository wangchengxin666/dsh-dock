import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import './deps.mjs'
const { Context } = await import('@deepseek-ai/cordis')
const { FileManager, default: FileManagerClass } = await import('../index.js')

const root = join(tmpdir(), 'fm-test-' + process.pid)
rmSync(root, { recursive: true, force: true })
mkdirSync(join(root, 'sub'), { recursive: true })
mkdirSync(join(root, '.hidden'), { recursive: true })
writeFileSync(join(root, 'a.txt'), 'hello')
writeFileSync(join(root, 'b.bin'), Buffer.from([0, 1, 2, 3]))
writeFileSync(join(root, 'sub', 'c.md'), '# hi')

const routes = []
const ctx = new Context()
ctx.reflect.provide('connection', { fetch: { register: (route) => { routes.push(route); return async () => {} } } })

const service = new FileManagerClass(ctx, { roots: [root], allowOutsideRoots: false, maxUploadBytes: 1024 * 1024 })
const ok = (label, cond) => console.log(cond ? 'ok  ' : 'FAIL', label)

const listing = await service.list(root)
ok('lists entries without dotfiles', listing.entries.map(e => e.name).join(',') === 'sub,a.txt,b.bin')
ok('directories first', listing.entries[0].type === 'directory')
ok('parent at root is null', listing.parent === null)
// The page's toggle reaches the Host: dot entries appear only when asked for.
const hiddenOff = await service.list(root, false)
const hiddenOn = await service.list(root, true)
ok('dot entries are hidden by default', !hiddenOff.entries.some(entry => entry.name.startsWith('.')))
ok('the toggle includes dot entries', hiddenOn.entries.some(entry => entry.name === '.hidden'))
ok('the listing reports whether hidden is forced', hiddenOn.hiddenForced === false)
const rootDelete = await service.deleteEntries([root])
ok('root cannot be deleted', rootDelete.length === 1 && rootDelete[0].ok === false)
ok('outside root refused', await service.list('/etc').then(() => false, e => e.code === 'file-manager/not-allowed'))
ok('traversal refused', await service.list(root + '/../../etc').then(() => false, e => e.code === 'file-manager/not-allowed' || e.code === 'file-manager/not-found'))

const made = await service.createDirectory(root, 'newdir')
ok('createDirectory', made.path === join(root, 'newdir'))
ok('duplicate refused', await service.createDirectory(root, 'newdir').then(() => false, e => e.code === 'file-manager/already-exists'))
ok('bad name refused', await service.createDirectory(root, '../x').then(() => false, e => e.code === 'file-manager/invalid-name'))

const renamed = await service.rename(join(root, 'a.txt'), 'a2.txt')
ok('rename', renamed.path === join(root, 'a2.txt') && readFileSync(join(root, 'a2.txt'), 'utf8') === 'hello')
ok('rename onto existing refused', await service.rename(join(root, 'a2.txt'), 'b.bin').then(() => false, e => e.code === 'file-manager/already-exists'))

const text = await service.preview(join(root, 'a2.txt'))
ok('text preview', text.kind === 'text' && text.text === 'hello')
ok('listings carry a modification time', typeof listing.entries[1].modified === 'number' && listing.entries[1].modified > 0)
ok('listings carry a mode', typeof listing.entries[1].mode === 'number')

const expectedMode = process.platform === 'win32' ? 0o444 : 0o750
const ch = await service.chmod(join(root, 'a2.txt'), expectedMode)
const afterChmod = await service.list(root, true)
const chEntry = afterChmod.entries.find(e => e.name === 'a2.txt')
ok('chmod updates file permissions', ch.mode === expectedMode
  && (process.platform === 'win32' ? (chEntry.mode & 0o222) === 0 : chEntry.mode === expectedMode))
if (process.platform === 'win32') await service.chmod(join(root, 'a2.txt'), 0o666)
ok('chmod invalid mode refused', await service.chmod(join(root, 'a2.txt'), '999').then(() => false, e => e.code === 'file-manager/invalid-name'))
ok('chmod out-of-range mode refused', await service.chmod(join(root, 'a2.txt'), 0o10000).then(() => false, e => e.code === 'file-manager/invalid-name'))
ok('chmod missing path refused', await service.chmod(join(root, 'missing.txt'), 0o644).then(() => false, e => e.code === 'file-manager/not-found'))
ok('chmod outside root refused', await service.chmod(join(root, '..', 'outside.txt'), 0o644).then(() => false, e => e.code === 'file-manager/not-allowed'))

const written = await service.writeText(join(root, 'a2.txt'), 'hello\nline2\nneedle')
ok('writeText updates file contents', written.path === join(root, 'a2.txt') && readFileSync(join(root, 'a2.txt'), 'utf8') === 'hello\nline2\nneedle')
ok('writeText directory refused', await service.writeText(join(root, 'sub'), 'x').then(() => false, e => e.code === 'file-manager/not-file'))
ok('writeText missing path refused', await service.writeText(join(root, 'none.txt'), 'x').then(() => false, e => e.code === 'file-manager/not-found'))

const nameSearch = await service.search(root, 'a2', 'name', false)
ok('search by name finds matching entries', nameSearch.entries.some(e => e.relativePath === 'a2.txt'))
const contentSearch = await service.search(root, 'NEEDLE', 'content', false)
ok('search by content finds text line snippet', contentSearch.entries.length === 1 && contentSearch.entries[0].matchLine === 3 && contentSearch.entries[0].matchText === 'needle')

await service.createDirectory(root, 'dest')
const moved = await service.moveEntries([join(root, 'a2.txt')], join(root, 'dest'))
ok('moveEntries relocates entries cleanly', moved.length === 1 && moved[0].ok && readFileSync(join(root, 'dest', 'a2.txt'), 'utf8') === 'hello\nline2\nneedle')
const selfMove = await service.moveEntries([join(root, 'dest')], join(root, 'dest'))
ok('moveEntries into self refused', selfMove.length === 1 && !selfMove[0].ok)
await service.moveEntries([join(root, 'dest', 'a2.txt')], root)
ok('listings report unaddressable names', listing.unaddressable === 0)
const image = await service.preview(join(root, 'b.bin'))
ok('binary preview', image.kind === 'binary')

const removed = await service.deleteEntries([join(root, 'newdir'), join(root, 'a2.txt')])
ok('remove', removed.every(entry => entry.ok) && !readdirSync(root).includes('newdir') && !readdirSync(root).includes('a2.txt'))
const partial = await service.deleteEntries([join(root, 'sub'), join(root, 'sub', 'c.md')])
ok('removing a child of a removed parent stays successful', partial.every(entry => entry.ok))
const missing = await service.deleteEntries([join(root, 'does-not-exist')])
ok('a missing path is reported, not thrown', missing.length === 1 && missing[0].ok === false && typeof missing[0].error === 'string')

// Routes.
ok('registers four routes', routes.map(r => r.path).join(',') === '/api/file-manager.download,/api/file-manager.raw,/api/file-manager.zip,/api/file-manager.upload')
const route = (path) => routes.find(entry => entry.path === path)

const download = await route('/api/file-manager.download').fetch(new Request('http://localhost/api/file-manager.download?path=' + encodeURIComponent(join(root, 'b.bin'))))
ok('download headers', download.status === 200 && download.headers.get('content-length') === '4')
const bytes = new Uint8Array(await download.arrayBuffer())
ok('download bytes', bytes.length === 4 && bytes[0] === 0 && bytes[3] === 3)
const head = await route('/api/file-manager.download').fetch(new Request('http://localhost/api/file-manager.download?path=' + encodeURIComponent(join(root, 'b.bin')), { method: 'HEAD' }))
ok('download HEAD has no body', head.status === 200 && head.body === null)
const refused = await route('/api/file-manager.download').fetch(new Request('http://localhost/api/file-manager.download?path=/etc/passwd'))
ok('download outside root refused', refused.status === 403)

// The delete cases above removed `sub`; restore it for the upload cases.
mkdirSync(join(root, 'sub'), { recursive: true })

// Multipart upload built by hand.
const boundary = '----fmt' + Date.now()
const body = [
  `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="up.txt"\r\nContent-Type: text/plain\r\n\r\n`,
  'uploaded content',
  `\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="two.txt"\r\n\r\n`,
  'second',
  `\r\n--${boundary}--\r\n`,
].join('')
const upload = await route('/api/file-manager.upload').fetch(new Request('http://localhost/api/file-manager.upload?dir=' + encodeURIComponent(join(root, 'sub')), {
  method: 'POST',
  headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  body,
}))
const uploadJson = await upload.json().catch(() => null)
ok('upload status', upload.status === 200)
ok('upload wrote both files', readFileSync(join(root, 'sub', 'up.txt'), 'utf8') === 'uploaded content'
  && readFileSync(join(root, 'sub', 'two.txt'), 'utf8') === 'second')

// Overwrite protection: a second upload of the same name asks first.
const upBody = (filename, text) => `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\n\r\n${text}\r\n--${boundary}--\r\n`
const clash = await route('/api/file-manager.upload').fetch(new Request('http://localhost/api/file-manager.upload?dir=' + encodeURIComponent(join(root, 'sub')), {
  method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: upBody('up.txt', 'replacement'),
}))
const clashBody = await clash.json()
ok('an existing name is refused with 409', clash.status === 409 && clashBody.conflicts.join(',') === 'up.txt')
ok('a refused upload leaves the file alone', readFileSync(join(root, 'sub', 'up.txt'), 'utf8') === 'uploaded content')
const replaced = await route('/api/file-manager.upload').fetch(new Request('http://localhost/api/file-manager.upload?dir=' + encodeURIComponent(join(root, 'sub')) + '&overwrite=1', {
  method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, body: upBody('up.txt', 'replacement'),
}))
ok('overwrite=1 replaces it', replaced.status === 200 && readFileSync(join(root, 'sub', 'up.txt'), 'utf8') === 'replacement')
const badBody = await route('/api/file-manager.upload').fetch(new Request('http://localhost/api/file-manager.upload?dir=' + encodeURIComponent(root), {
  method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  body: `--${boundary}\r\nContent-Disposition: form-data; name="f"; filename="cut.txt"\r\n\r\ntruncated`,
}))
ok('a body without its closing boundary is refused', badBody.status === 400 && !readdirSync(root).includes('cut.txt'))

const tooBig = await route('/api/file-manager.upload').fetch(new Request('http://localhost/api/file-manager.upload?dir=' + encodeURIComponent(root), {
  method: 'POST',
  headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  body: `--${boundary}\r\nContent-Disposition: form-data; name="f"; filename="big.bin"\r\n\r\n` + 'x'.repeat(1024 * 1024 + 100000) + `\r\n--${boundary}--\r\n`,
}))
ok('upload cap enforced', tooBig.status === 413)

// Archive route: one directory becomes one ZIP with its contents inside.
mkdirSync(join(root, 'folder', 'nested'), { recursive: true })
writeFileSync(join(root, 'folder', 'one.txt'), 'first file')
writeFileSync(join(root, 'folder', 'nested', 'two.txt'), 'second file')
const archive = await route('/api/file-manager.zip').fetch(new Request('http://localhost/api/file-manager.zip?path=' + encodeURIComponent(join(root, 'folder'))))
const archiveBytes = new Uint8Array(await archive.arrayBuffer())
const archivePath = join(root, '..', `fm-archive-${process.pid}.zip`)
writeFileSync(archivePath, archiveBytes)
const zipListing = execFileSync('python3', ['-c', `
import json, zipfile
z = zipfile.ZipFile(${JSON.stringify(archivePath)})
print(json.dumps({"crc": z.testzip(), "names": sorted(z.namelist()),
  "one": z.read("folder/one.txt").decode(), "two": z.read("folder/nested/two.txt").decode()}))
`], { encoding: 'utf8' })
const zipCheck = JSON.parse(zipListing)
ok('archive is a valid zip', archive.status === 200 && archive.headers.get('content-type') === 'application/zip')
ok('archive keeps the folder tree', zipCheck.names.join(',') === 'folder/nested/two.txt,folder/one.txt')
ok('archive contents match', zipCheck.crc === null && zipCheck.one === 'first file' && zipCheck.two === 'second file')
const outside = await route('/api/file-manager.zip').fetch(new Request('http://localhost/api/file-manager.zip?path=/etc'))
ok('archive refuses paths outside the roots', outside.status === 403)
const headZip = await route('/api/file-manager.zip').fetch(new Request('http://localhost/api/file-manager.zip?path=' + encodeURIComponent(join(root, 'folder')), { method: 'HEAD' }))
ok('archive HEAD has no body', headZip.status === 200 && headZip.body === null)
rmSync(archivePath, { force: true })

// The page opens in the user's home directory when no root narrows it, and in
// the first configured root otherwise.
const homeCtx = new Context()
homeCtx.reflect.provide('connection', { fetch: { register: () => async () => {} } })
const unrestricted = new FileManagerClass(homeCtx, {})
ok('start path defaults to the home directory', await unrestricted.startPath() === realpathSync(homedir()))
ok('start path falls back to the first root', await service.startPath() === realpathSync(root))
const rootCtx = new Context()
rootCtx.reflect.provide('connection', { fetch: { register: () => async () => {} } })
const rooted = new FileManagerClass(rootCtx, { roots: [join(root, 'folder')] })
ok('start path honours the configured roots', await rooted.startPath() === realpathSync(join(root, 'folder')))

rmSync(root, { recursive: true, force: true })
