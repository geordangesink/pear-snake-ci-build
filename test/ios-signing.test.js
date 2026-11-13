const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test } = require('node:test')
const plist = require('plist')
const prepareIOSSigning = require('../scripts/mobile/prepare-ios-signing')

function fixture(t) {
  const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'snake-ios-'))
  t.after(() => fs.rmSync(artifacts, { recursive: true, force: true }))
  const signing = path.join(artifacts, 'signing')
  fs.mkdirSync(signing)
  const archive = path.join(artifacts, 'archive/Snake.xcarchive')
  const app = path.join(archive, 'Products/Applications/Pear Snake.app')
  const framework = path.join(app, 'Frameworks/Test.framework')
  fs.mkdirSync(framework, { recursive: true })
  fs.writeFileSync(path.join(framework, 'Test'), Buffer.from('cffaedfe', 'hex'))
  fs.writeFileSync(path.join(app, 'PearSnake'), Buffer.from('cffaedfe', 'hex'))
  fs.writeFileSync(path.join(archive, 'Info.plist'), plist.build({ ApplicationProperties: {} }))
  fs.writeFileSync(
    path.join(artifacts, 'build-metadata.json'),
    JSON.stringify({
      applicationId: 'to.holepunch.snake',
      version: '1.2.3',
      buildNumber: '4202'
    })
  )
  const info = {
    CFBundleIdentifier: 'to.holepunch.snake',
    CFBundleShortVersionString: '1.2.3',
    CFBundleVersion: '4202',
    CFBundleExecutable: 'PearSnake'
  }
  const profile = {
    ApplicationIdentifierPrefix: ['TEAM'],
    TeamIdentifier: ['TEAM'],
    UUID: '11111111-2222-3333-4444-555555555555',
    ExpirationDate: new Date('2099-01-01T00:00:00Z'),
    DeveloperCertificates: [Buffer.from('fixture certificate')],
    Entitlements: {
      'application-identifier': 'TEAM.to.holepunch.snake',
      'com.apple.developer.team-identifier': 'TEAM',
      'get-task-allow': false
    }
  }
  const prepare = () => {
    const infoPath = path.join(app, 'Info.plist')
    fs.writeFileSync(infoPath, plist.build(info))
    if (process.platform === 'darwin')
      execFileSync('/usr/bin/plutil', ['-convert', 'binary1', infoPath])
    prepareIOSSigning(
      {
        ARTIFACT_DIR: artifacts,
        SIGNING_DIR: signing,
        APPLE_TEAM_ID: 'TEAM',
        IOS_PROVISIONING_PROFILE_BASE64: Buffer.from('fixture profile').toString('base64')
      },
      (command, args) => {
        if (command === '/usr/bin/security') {
          assert.deepEqual(args, [
            'cms',
            '-D',
            '-i',
            path.join(signing, 'profile.mobileprovision')
          ])
          return plist.build(profile)
        }
        assert.equal(command, '/usr/bin/plutil')
        assert.deepEqual(args.slice(0, 4), ['-convert', 'xml1', '-o', '-'])
        return process.platform === 'darwin'
          ? execFileSync(command, args, { encoding: 'utf8' })
          : fs.readFileSync(args[4], 'utf8')
      }
    )
  }
  return { signing, framework, info, profile, prepare }
}

test('iOS signing decodes profile dates and signs nested code before bundles', (t) => {
  const { signing, framework, prepare } = fixture(t)
  prepare()
  const entitlements = plist.parse(
    fs.readFileSync(path.join(signing, 'Entitlements.plist'), 'utf8')
  )
  assert.equal(entitlements['application-identifier'], 'TEAM.to.holepunch.snake')
  assert.equal(entitlements['get-task-allow'], false)
  const paths = fs
    .readFileSync(path.join(signing, 'signing-paths'), 'utf8')
    .split('\0')
    .slice(0, -1)
  assert.deepEqual(paths, [path.join(framework, 'Test'), framework])
})

test('iOS signing rejects an app that does not match its metadata', (t) => {
  const { info, prepare } = fixture(t)
  info.CFBundleIdentifier = 'other.app'
  assert.throws(prepare, /does not match its build metadata/)
})

test('iOS signing rejects a profile for another app', (t) => {
  const { profile, prepare } = fixture(t)
  profile.Entitlements['application-identifier'] = 'TEAM.other.app'
  assert.throws(prepare, /does not match the iOS bundle identifier/)
})

test('iOS signing rejects a development profile', (t) => {
  const { profile, prepare } = fixture(t)
  profile.Entitlements['get-task-allow'] = true
  assert.throws(prepare, /App Store distribution profile is required/)
})

test('iOS signing rejects an expired profile', (t) => {
  const { profile, prepare } = fixture(t)
  profile.ExpirationDate = new Date('2000-01-01T00:00:00Z')
  assert.throws(prepare, /Provisioning profile has expired/)
})
