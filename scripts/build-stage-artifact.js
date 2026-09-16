const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const artifacts = path.resolve(process.argv[2] || 'out/artifacts')
const output = path.resolve(process.argv[3] || 'out/snake-stage')
const packagePath = path.resolve(process.env.PACKAGE_JSON_PATH || 'snake-source/package.json')
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
const product = pkg.productName || pkg.name
const inputs = path.join(path.dirname(output), 'stage-inputs')
const args = ['--yes', 'pear-build@1.2.0', '--target', output]

if (fs.existsSync(output) || fs.existsSync(inputs)) {
  throw new Error('Stage output already exists; use a fresh output directory')
}
fs.mkdirSync(inputs, { recursive: true })
if (process.env.UPGRADE_KEY) pkg.upgrade = process.env.UPGRADE_KEY
const metadata = path.join(inputs, 'package.json')
fs.writeFileSync(metadata, JSON.stringify(pkg, null, 2) + '\n')
args.push('--package', metadata)

let count = 0
for (const [host, type, extension] of [
  ['linux-x64', 'appimage', '.AppImage'],
  ['linux-arm64', 'appimage', '.AppImage'],
  ['darwin-arm64', 'app.zip', '.zip'],
  ['darwin-x64', 'app.zip', '.zip'],
  ['win32-x64', 'msix', '.msix']
]) {
  const directory = path.join(artifacts, `snake-${host}-${type}`)
  if (!fs.existsSync(directory)) continue
  const files = listFiles(directory).filter((file) => file.endsWith(extension))
  if (files.length !== 1) throw new Error(`Expected one ${extension} in ${directory}`)
  const source = files[0]
  const targetDir = path.join(inputs, host)
  fs.mkdirSync(targetDir)
  let target
  if (extension === '.zip') {
    run('ditto', ['-x', '-k', source, targetDir])
    target = path.join(targetDir, `${product}.app`)
  } else {
    target = path.join(targetDir, `${product}${extension}`)
    fs.copyFileSync(source, target)
    if (extension === '.AppImage') fs.chmodSync(target, 0o755)
  }
  if (!fs.existsSync(target)) throw new Error(`Missing app: ${target}`)
  args.push(`--${host}-app`, target)
  count++
}

if (!count) throw new Error(`No Snake app artifacts found in ${artifacts}`)
run('npx', args)
console.log(`Prepared ${count} Snake app artifacts in ${output}`)

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with status ${result.status}`)
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? listFiles(file) : entry.isFile() ? [file] : []
  })
}
