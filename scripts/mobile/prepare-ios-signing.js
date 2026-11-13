const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const plist = require('plist')

function prepareIOSSigning(env = process.env, run = execFileSync) {
  const signing = env.SIGNING_DIR
  const archive = path.join(env.ARTIFACT_DIR, 'archive/Snake.xcarchive')
  const metadata = JSON.parse(
    fs.readFileSync(path.join(env.ARTIFACT_DIR, 'build-metadata.json'))
  )
  const readPlist = (file) =>
    plist.parse(
      run('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', file], { encoding: 'utf8' })
    )
  const writePlist = (file, value) => fs.writeFileSync(file, plist.build(value))

  const profilePath = path.join(signing, 'profile.mobileprovision')
  fs.writeFileSync(profilePath, Buffer.from(env.IOS_PROVISIONING_PROFILE_BASE64, 'base64'))
  const profile = plist.parse(
    run('/usr/bin/security', ['cms', '-D', '-i', profilePath], { encoding: 'utf8' })
  )
  const applications = path.join(archive, 'Products/Applications')
  const apps = fs
    .readdirSync(applications, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
  if (apps.length !== 1) throw new Error('Expected one archived iOS application')
  const app = path.join(applications, apps[0].name)
  const info = readPlist(path.join(app, 'Info.plist'))
  if (
    info.CFBundleIdentifier !== metadata.applicationId ||
    info.CFBundleShortVersionString !== metadata.version ||
    String(info.CFBundleVersion) !== metadata.buildNumber
  ) {
    throw new Error('Archived application does not match its build metadata')
  }

  const entitlements = profile.Entitlements
  const identifier = entitlements['application-identifier']
  if (
    !profile.ApplicationIdentifierPrefix.some(
      (prefix) => identifier === `${prefix}.${metadata.applicationId}`
    )
  ) {
    throw new Error('Provisioning profile does not match the iOS bundle identifier')
  }
  if (
    !profile.TeamIdentifier.includes(env.APPLE_TEAM_ID) ||
    entitlements['com.apple.developer.team-identifier'] !== env.APPLE_TEAM_ID
  ) {
    throw new Error('Provisioning profile does not match APPLE_TEAM_ID')
  }
  if (
    entitlements['get-task-allow'] ||
    profile.ProvisionsAllDevices ||
    'ProvisionedDevices' in profile
  ) {
    throw new Error('An App Store distribution profile is required')
  }
  if (profile.ExpirationDate.getTime() <= Date.now())
    throw new Error('Provisioning profile has expired')

  const executable = info.CFBundleExecutable
  if (
    typeof executable !== 'string' ||
    path.basename(executable) !== executable ||
    executable === '.' ||
    executable === '..'
  ) {
    throw new Error('Invalid application executable name')
  }
  const mainExecutable = path.join(app, executable)
  const magic = new Set([
    0xfeedface, 0xcefaedfe, 0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca, 0xcafebabf,
    0xbfbafeca
  ])
  const paths = []
  function collect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (/\.(app|appex|xpc)$/i.test(entry.name)) {
          throw new Error(
            'Nested apps and extensions require an explicit signing configuration'
          )
        }
        collect(target)
        if (entry.name.endsWith('.framework')) paths.push(target)
      } else if (entry.isFile() && target !== mainExecutable) {
        const descriptor = fs.openSync(target, 'r')
        const header = Buffer.alloc(4)
        try {
          fs.readSync(descriptor, header, 0, 4, 0)
        } finally {
          fs.closeSync(descriptor)
        }
        if (magic.has(header.readUInt32BE())) paths.push(target)
      }
    }
  }
  collect(app)
  fs.writeFileSync(
    path.join(signing, 'signing-paths'),
    paths.map((target) => `${target}\0`).join('')
  )
  fs.writeFileSync(path.join(signing, 'app-path.txt'), app)

  writePlist(path.join(signing, 'Entitlements.plist'), {
    'application-identifier': identifier,
    'com.apple.developer.team-identifier': env.APPLE_TEAM_ID,
    'get-task-allow': false,
    'keychain-access-groups': [identifier]
  })
  writePlist(path.join(signing, 'ExportOptions.plist'), {
    destination: 'export',
    method: 'app-store-connect',
    signingStyle: 'manual',
    signingCertificate: 'Apple Distribution',
    teamID: env.APPLE_TEAM_ID,
    provisioningProfiles: { [metadata.applicationId]: profile.UUID },
    manageAppVersionAndBuildNumber: false,
    stripSwiftSymbols: true
  })
  const archiveInfoPath = path.join(archive, 'Info.plist')
  const archiveInfo = readPlist(archiveInfoPath)
  archiveInfo.ApplicationProperties = {
    ApplicationPath: `Applications/${apps[0].name}`,
    CFBundleIdentifier: metadata.applicationId,
    CFBundleShortVersionString: metadata.version,
    CFBundleVersion: metadata.buildNumber,
    Team: env.APPLE_TEAM_ID
  }
  writePlist(archiveInfoPath, archiveInfo)
}

module.exports = prepareIOSSigning
if (require.main === module) prepareIOSSigning()
