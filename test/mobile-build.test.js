const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')

const scripts = path.resolve(__dirname, '../scripts/mobile')

function fixture(t, platform = 'android') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'snake-build-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  fs.writeFileSync(
    path.join(directory, 'app.json'),
    JSON.stringify({
      expo: {
        ios: { bundleIdentifier: 'to.holepunch.snake' },
        android: { package: 'to.holepunch.snake' }
      }
    })
  )
  fs.writeFileSync(
    path.join(directory, 'app.config.js'),
    'throw new Error("Source config executed")'
  )
  const env = {
    ...process.env,
    BUILD_PLATFORM: platform,
    GITHUB_RUN_NUMBER: '42',
    GITHUB_RUN_ATTEMPT: '2',
    GITHUB_ENV: path.join(directory, 'env'),
    SOURCE_REPOSITORY: 'geordangesink/snake-mobile',
    SOURCE_REF: 'main',
    SOURCE_COMMIT: 'a'.repeat(40),
    GITHUB_REPOSITORY: 'geordangesink/pear-snake-ci-build',
    GITHUB_RUN_ID: '1234',
    ARTIFACT_DIR: path.join(directory, 'dist', platform)
  }
  const run = (name, overrides = {}) =>
    spawnSync(process.execPath, [path.join(scripts, name)], {
      cwd: directory,
      env: { ...env, ...overrides },
      encoding: 'utf8'
    })
  const metadataPath = path.join(env.ARTIFACT_DIR, 'build-metadata.json')
  return { env, run, metadataPath }
}

test('metadata reads declarative config without executing source configuration', (t) => {
  for (const platform of ['ios', 'android']) {
    const { run, metadataPath, env } = fixture(t, platform)
    const result = run('prepare-build.js')
    assert.equal(result.status, 0, result.stderr)
    const metadata = JSON.parse(fs.readFileSync(metadataPath))
    assert.equal(metadata.applicationId, 'to.holepunch.snake')
    assert.equal(metadata.version, '1.2.3')
    assert.equal(metadata.buildNumber, '4202')
    assert.equal(metadata.buildLabel, '001.002.003-00000042.02')
    assert.equal(metadata.commit, env.SOURCE_COMMIT)
    assert.equal(fs.readFileSync(env.GITHUB_ENV, 'utf8'), 'BUILD_NUMBER=4202\n')
  }
})

test('metadata rejects invalid counters and overflowing store numbers', (t) => {
  const { run } = fixture(t)
  for (const overrides of [
    { GITHUB_RUN_NUMBER: '0' },
    { GITHUB_RUN_NUMBER: '21000000' },
    { GITHUB_RUN_ATTEMPT: '0' },
    { GITHUB_RUN_ATTEMPT: '100' },
    { BUILD_PLATFORM: '../ios' }
  ])
    assert.notEqual(run('prepare-build.js', overrides).status, 0)
})
