const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const directory = path.resolve(process.argv[2] || 'artifact')
const files = listFiles(directory)
const extracted = path.join(directory, 'extracted')
fs.mkdirSync(extracted)
let appimage = ''

if (process.platform === 'linux') {
  appimage = one(
    files.filter((file) => file.endsWith('.AppImage')),
    'AppImage'
  )
  fs.chmodSync(appimage, 0o755)
  run(appimage, ['--appimage-extract'], { cwd: extracted })
} else if (process.platform === 'darwin') {
  const archive = one(
    files.filter((file) => file.endsWith('-app.zip')),
    'macOS app ZIP'
  )
  run('ditto', ['-x', '-k', archive, extracted])
} else if (process.platform === 'win32') {
  const archive = one(
    files.filter((file) => /\.(zip|msix)$/i.test(file)),
    'Windows app archive'
  )
  run(
    'pwsh',
    [
      '-NoProfile',
      '-Command',
      '[System.IO.Compression.ZipFile]::ExtractToDirectory($env:SNAKE_ARCHIVE, $env:SNAKE_EXTRACTED)'
    ],
    {
      env: { ...process.env, SNAKE_ARCHIVE: archive, SNAKE_EXTRACTED: extracted }
    }
  )
} else {
  throw new Error(`Unsupported platform: ${process.platform}`)
}

const executable = one(
  listFiles(extracted).filter((file) => {
    if (process.platform === 'darwin') return file.endsWith('/Snake.app/Contents/MacOS/Snake')
    return path.basename(file) === (process.platform === 'win32' ? 'Snake.exe' : 'Snake')
  }),
  'Snake executable'
)

console.log(`Packaged app smoke test executable: ${executable}`)
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `path=${executable}\nappimage=${appimage}\n`)
}

function one(matches, label) {
  if (matches.length !== 1) throw new Error(`Expected one ${label}; found ${matches.length}`)
  return matches[0]
}

function listFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name)
    return entry.isDirectory() ? listFiles(file) : entry.isFile() ? [file] : []
  })
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options
  })
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`${command} failed: ${result.stderr || result.stdout}`)
}
