const fs = require('node:fs')
const path = require('node:path')
const { pipeline } = require('node:stream/promises')
const { text } = require('node:stream/consumers')
const { createGunzip } = require('node:zlib')
const yauzl = require('yauzl')
const tar = require('tar-stream')
const windowsDevice =
  /^(CON|PRN|AUX|NUL|CLOCK\$|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i

function checkPath(value) {
  if (!value || value.startsWith('/') || /[\\\x00-\x1f]/.test(value) || value[1] === ':') {
    throw new Error(`Unsafe archive path: ${JSON.stringify(value)}`)
  }
}

async function* zipEntries(file) {
  const zip = await yauzl.openPromise(file, { strictFileNames: true })
  try {
    for await (const entry of zip.eachEntry()) {
      const mode = entry.externalFileAttributes >>> 16
      const type = mode & 0o170000
      const directory = entry.fileName.endsWith('/')
      let kind
      if (directory && (type === 0 || type === 0o040000)) kind = 'directory'
      else if (!directory && (type === 0 || type === 0o100000)) kind = 'file'
      else if (!directory && type === 0o120000) kind = 'symlink'
      else throw new Error('Unsupported ZIP entry type')
      const stream = await zip.openReadStreamPromise(entry)
      try {
        yield { name: entry.fileName, kind, mode, stream }
      } finally {
        stream.destroy()
      }
    }
  } finally {
    zip.close()
  }
}

async function* tarEntries(file) {
  const parser = tar.extract()
  const streams = [fs.createReadStream(file)]
  if (/\.(gz|tgz)$/i.test(file)) streams.push(createGunzip())
  const reading = pipeline(...streams, parser).catch((error) => error)
  try {
    for await (const stream of parser) {
      const { name, type: kind, mode, linkname: target } = stream.header
      yield { name, kind, mode, target, stream }
    }
    const error = await reading
    if (error) throw error
  } finally {
    parser.destroy()
  }
}

async function extract(file, output) {
  output = path.resolve(output)
  const existing = fs.lstatSync(output, { throwIfNoEntry: false })
  if (existing && (!existing.isDirectory() || fs.readdirSync(output).length)) {
    throw new Error('Extraction requires an empty output directory')
  }
  const msix = path.extname(file).toLowerCase() === '.msix'
  const entries = /\.(zip|msix)$/i.test(file) ? zipEntries(file) : tarEntries(file)
  const names = new Set()
  const links = []
  fs.mkdirSync(output, { recursive: true })
  try {
    for await (const entry of entries) {
      checkPath(entry.name)
      if (entry.name.split('/').includes('..')) throw new Error('Archive path traversal')
      const name = path.posix.normalize(entry.name).replace(/\/$/, '')
      if (name === '.' && entry.kind === 'directory') {
        await text(entry.stream)
        continue
      }
      const canonical = name.normalize('NFD').toUpperCase()
      if (!name || name === '.' || names.has(canonical))
        throw new Error('Duplicate archive path')
      names.add(canonical)
      if (
        msix &&
        name
          .split('/')
          .some((part) => /[<>:"|?*\x7f]|[. ]$/.test(part) || windowsDevice.test(part))
      ) {
        throw new Error('Unsafe MSIX path')
      }
      const destination = path.join(output, name)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      if (entry.kind === 'file') {
        await pipeline(entry.stream, fs.createWriteStream(destination, { flags: 'wx' }))
        fs.chmodSync(destination, entry.mode & 0o777 || 0o644)
      } else if (entry.kind === 'directory') {
        fs.mkdirSync(destination, { recursive: true })
        await text(entry.stream)
      } else if (entry.kind === 'symlink' && !msix) {
        const content = await text(entry.stream)
        const target = entry.target ?? content
        checkPath(target)
        links.push({ destination, target })
      } else {
        throw new Error(`Unsupported archive entry: ${entry.kind}`)
      }
    }
    for (const entry of fs.readdirSync(output, { recursive: true, withFileTypes: true })) {
      if (entry.isDirectory()) fs.chmodSync(path.join(entry.parentPath, entry.name), 0o755)
    }
    for (const { destination, target } of links) fs.symlinkSync(target, destination)
    const root = fs.realpathSync(output)
    for (const { destination } of links) {
      const relative = path.relative(root, fs.realpathSync(destination))
      if (
        relative === '..' ||
        relative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relative)
      ) {
        throw new Error('Archive symlink escapes output directory')
      }
    }
  } catch (error) {
    fs.rmSync(output, { recursive: true, force: true })
    throw error
  }
}

module.exports = extract
if (require.main === module) {
  const [file, output] = process.argv.slice(2)
  if (!file || !output) throw new Error('Usage: node safe-extract.js archive output')
  extract(file, output).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
