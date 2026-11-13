const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { buffer } = require('node:stream/consumers')
const { createGzip } = require('node:zlib')
const { test } = require('node:test')
const yazl = require('yazl')
const tar = require('tar-stream')
const extract = require('../scripts/safe-extract')

function workspace(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snake-extract-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  async function archive(format, entries) {
    const file = path.join(root, `artifact.${format === 'tar' ? 'tar.gz' : format}`)
    if (format === 'tar') {
      const pack = tar.pack()
      const contents = buffer(pack.pipe(createGzip()))
      for (const [name, kind, content = ''] of entries) {
        const type = { hardlink: 'link', device: 'character-device' }[kind] || kind
        pack.entry(
          { name, type, mode: 0o755, linkname: kind === 'file' ? undefined : content },
          kind === 'file' ? content : ''
        )
      }
      pack.finalize()
      fs.writeFileSync(file, await contents)
    } else {
      const zip = new yazl.ZipFile()
      const contents = buffer(zip.outputStream)
      const replacements = []
      for (const [index, [name, kind, content = '']] of entries.entries()) {
        const unsafe =
          name.startsWith('/') ||
          name.includes('\\') ||
          name.split('/').includes('..') ||
          /^[a-z]:/i.test(name)
        const stored = unsafe ? String(index).padStart(Buffer.byteLength(name), 'x') : name
        const mode = {
          file: 0o100755,
          symlink: 0o120777,
          device: 0o020600,
          directory: 0o040755
        }[kind]
        if (kind === 'directory') zip.addEmptyDirectory(stored, { mode })
        else zip.addBuffer(Buffer.from(content), stored, { mode })
        if (unsafe) replacements.push([Buffer.from(stored), Buffer.from(name)])
      }
      zip.end()
      const bytes = await contents
      for (const [before, after] of replacements) {
        let count = 0
        for (
          let offset = bytes.indexOf(before);
          offset !== -1;
          offset = bytes.indexOf(before, offset + after.length)
        ) {
          after.copy(bytes, offset)
          count++
        }
        assert.equal(count, 2, 'Mutate both ZIP filename fields')
      }
      fs.writeFileSync(file, bytes)
    }
    return file
  }
  async function reject(format, entries) {
    const output = path.join(root, 'output')
    await assert.rejects(extract(await archive(format, entries), output))
    assert.equal(fs.existsSync(output), false)
  }
  return { root, archive, reject }
}

const formats = ['zip', 'tar', 'msix']
test('preserves framework links and executable permissions', async (t) => {
  const { root, archive } = workspace(t)
  const entries = [
    ['Snake.app/Frameworks/Example.framework/Example', 'symlink', 'Versions/Current/Example'],
    ['Snake.app/Frameworks/Example.framework/Versions/Current', 'symlink', 'A'],
    ['Snake.app/Frameworks/Example.framework/Versions/A/Example', 'file', 'binary'],
    [
      'Snake.app/Frameworks/Example.framework/Versions/A/Resources/link',
      'symlink',
      '../Example'
    ]
  ]
  for (const format of ['zip', 'tar']) {
    const output = path.join(root, format)
    await extract(await archive(format, entries), output)
    const binary = path.join(output, entries[0][0])
    assert.equal(fs.lstatSync(binary).isSymbolicLink(), true)
    assert.equal(fs.readFileSync(binary, 'utf8'), 'binary')
    assert.equal(fs.statSync(binary).mode & 0o777, 0o755)
  }
})

test('rejects traversal, absolute, backslash and control-character paths', async (t) => {
  const { reject } = workspace(t)
  for (const format of formats) {
    for (const name of [
      '../escape',
      '/absolute',
      'app/../../escape',
      'app\\escape',
      'C:/escape',
      'app/line\nbreak'
    ]) {
      await reject(format, [[name, 'file', 'payload']])
    }
  }
})

test('rejects escaping and dangling symlink targets', async (t) => {
  const { reject } = workspace(t)
  for (const format of formats) {
    for (const target of ['../../escape', '/outside', 'C:/outside', '..\\outside', 'missing']) {
      await reject(format, [['app/link', 'symlink', target]])
    }
  }
})

test('never changes or chmods an existing external file', async (t) => {
  const { root, reject } = workspace(t)
  const outside = path.join(root, 'secret')
  fs.writeFileSync(outside, 'keep', { mode: 0o600 })
  for (const format of ['zip', 'tar']) {
    await reject(format, [
      ['app/link', 'symlink', '../../secret'],
      ['app/regular', 'file', 'payload']
    ])
    assert.equal(fs.readFileSync(outside, 'utf8'), 'keep')
    assert.equal(fs.statSync(outside).mode & 0o777, 0o600)
  }
})

test('rejects symlink parents regardless of member order', async (t) => {
  const { reject } = workspace(t)
  for (const format of formats) {
    const entries = [
      ['app/link', 'symlink', 'other'],
      ['app/link/file', 'file', 'payload']
    ]
    await reject(format, entries)
    await reject(format, entries.toReversed())
  }
})

test('rejects escaping symlink chains and cycles', async (t) => {
  const { reject } = workspace(t)
  for (const format of formats) {
    for (const alias of ['a', 'A']) {
      await reject(format, [
        [alias, 'symlink', '.'],
        ['b', 'symlink', 'a/../outside']
      ])
    }
    await reject(format, [
      ['a', 'symlink', 'b'],
      ['b', 'symlink', 'a']
    ])
  }
})

test('rejects files used as parents and normalized duplicate paths', async (t) => {
  const { reject } = workspace(t)
  for (const format of formats) {
    await reject(format, [
      ['app', 'file', 'payload'],
      ['app/file', 'file', 'payload']
    ])
    for (const [first, second] of [
      ['app/file', './app/file'],
      ['App/file', 'app/file'],
      ['app/é', 'app/e\u0301'],
      ['app/ß', 'app/SS']
    ]) {
      await reject(format, [
        [first, 'file', 'first'],
        [second, 'file', 'second']
      ])
    }
  }
})

test('applies Windows path and link restrictions to MSIX', async (t) => {
  const { root, archive, reject } = workspace(t)
  for (const name of [
    'app/file:stream',
    'app/CON.txt',
    'app/CONOUT$',
    'app/COM¹',
    'app/file.',
    'app/file ',
    'app/file?',
    'app/file\x7f'
  ]) {
    await reject('msix', [[name, 'file', 'payload']])
  }
  await reject('msix', [
    ['app/link', 'symlink', 'data'],
    ['app/data', 'file', 'payload']
  ])
  const output = path.join(root, 'msix')
  await extract(
    await archive('msix', [
      ['app/Snake.exe', 'file', 'binary'],
      ['AppxManifest.xml', 'file', 'xml'],
      ['[Content_Types].xml', 'file', 'xml']
    ]),
    output
  )
  assert.equal(fs.readFileSync(path.join(output, 'app/Snake.exe'), 'utf8'), 'binary')
})

test('rejects devices and hard links', async (t) => {
  const { reject } = workspace(t)
  for (const format of formats) await reject(format, [['device', 'device', '']])
  await reject('tar', [['alias', 'hardlink', '../outside']])
})

test('preserves an existing nonempty destination and rejects a linked destination', async (t) => {
  const { root, archive } = workspace(t)
  const file = await archive('zip', [['file', 'file', 'payload']])
  const output = path.join(root, 'output')
  fs.mkdirSync(output)
  fs.writeFileSync(path.join(output, 'existing'), 'keep')
  await assert.rejects(extract(file, output))
  assert.equal(fs.readFileSync(path.join(output, 'existing'), 'utf8'), 'keep')
  const link = path.join(root, 'link')
  fs.symlinkSync(output, link, 'dir')
  await assert.rejects(extract(file, link))
})

test('rejects embedded NUL in ZIP filenames', async (t) => {
  const { reject } = workspace(t)
  await reject('zip', [['app/\0file', 'file', 'payload']])
})

test('allows repeated traversal of an internal link', async (t) => {
  const { root, archive } = workspace(t)
  for (const format of ['zip', 'tar']) {
    const output = path.join(root, format)
    await extract(
      await archive(format, [
        ['data/file', 'file', 'payload'],
        ['current', 'symlink', 'data'],
        ['link', 'symlink', 'current/../current/file']
      ]),
      output
    )
    assert.equal(fs.readFileSync(path.join(output, 'link'), 'utf8'), 'payload')
  }
})

test('keeps app directories traversable under a private umask', async (t) => {
  const { root, archive } = workspace(t)
  const file = await archive('zip', [['Snake.app/Contents/MacOS/Snake', 'file', 'binary']])
  const output = path.join(root, 'output')
  const previous = process.umask(0o077)
  try {
    await extract(file, output)
  } finally {
    process.umask(previous)
  }
  assert.equal(fs.statSync(path.join(output, 'Snake.app')).mode & 0o777, 0o755)
})

test('rejects damaged ZIP and gzip streams', async (t) => {
  const { root, archive } = workspace(t)
  for (const format of ['zip', 'tar']) {
    const file = await archive(format, [['data', 'file', 'payload']])
    fs.truncateSync(file, 12)
    await assert.rejects(extract(file, path.join(root, 'output')))
    assert.equal(fs.existsSync(path.join(root, 'output')), false)
  }
})
