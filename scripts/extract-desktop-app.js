const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const extract = require('./safe-extract')

async function extractApp(directory, platform = process.platform) {
  const layout = {
    linux: ['Snake.AppImage', 'squashfs-root/Snake'],
    darwin: ['Snake-app.zip', 'Snake.app/Contents/MacOS/Snake'],
    win32: ['Snake.msix', 'app/Snake.exe']
  }[platform]
  if (!layout) throw new Error(`Unsupported platform: ${platform}`)

  const archive = path.resolve(directory, layout[0])
  const output = path.resolve(directory, 'extracted')
  const appimage = platform === 'linux' ? archive : ''
  if (appimage) {
    fs.chmodSync(archive, 0o755)
    fs.mkdirSync(output)
    execFileSync(archive, ['--appimage-extract'], { cwd: output, stdio: 'inherit' })
  } else {
    await extract(archive, output)
  }
  const executable = path.join(output, layout[1])
  if (!fs.statSync(executable).isFile()) throw new Error(`Missing executable: ${executable}`)
  return { path: executable, appimage }
}

module.exports = extractApp
if (require.main === module) {
  extractApp(process.argv[2] || 'artifact')
    .then(({ path, appimage }) => {
      console.log(`Packaged app smoke test executable: ${path}`)
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `path=${path}\nappimage=${appimage}\n`)
      }
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}
