const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const artifacts = path.resolve('out/artifacts')
const output = path.resolve('out/snake-stage')
const pkg = JSON.parse(fs.readFileSync('snake-source/package.json', 'utf8'))
const inputs = path.join(path.dirname(output), 'stage-inputs')
const args = ['--yes', 'pear-build@1.3.2', '--target', output]

if (fs.existsSync(output) || fs.existsSync(inputs)) {
  throw new Error('Stage output already exists; use a fresh output directory')
}
fs.mkdirSync(inputs, { recursive: true })
const metadata = path.join(inputs, 'package.json')
fs.writeFileSync(metadata, JSON.stringify(pkg, null, 2) + '\n')
args.push('--package', metadata)

let count = 0
for (const [host, type, filename] of [
  ['linux-x64', 'appimage', 'Snake.AppImage'],
  ['linux-arm64', 'appimage', 'Snake.AppImage'],
  ['darwin-arm64', 'app.zip', 'snake-darwin-arm64-app.zip'],
  ['darwin-x64', 'app.zip', 'snake-darwin-x64-app.zip'],
  ['win32-x64', 'msix', 'Snake.msix']
]) {
  const directory = path.join(artifacts, `snake-${host}-${type}`)
  if (!fs.existsSync(directory)) continue
  const source = path.join(directory, filename)
  const targetDir = path.join(inputs, host)
  fs.mkdirSync(targetDir)
  let target
  if (type === 'app.zip') {
    run(process.execPath, [path.join(__dirname, 'safe-extract.js'), source, targetDir])
    target = path.join(targetDir, 'Snake.app')
  } else {
    target = path.join(targetDir, filename)
    fs.copyFileSync(source, target)
    if (type === 'appimage') fs.chmodSync(target, 0o755)
  }
  if (!fs.existsSync(target)) throw new Error(`Missing app: ${target}`)
  args.push(`--${host}-app`, target)
  count++
}

if (!count) throw new Error(`No Snake app artifacts found in ${artifacts}`)
run('sfw', ['npx', ...args])
console.log(`Prepared ${count} Snake app artifacts in ${output}`)

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`)
}
