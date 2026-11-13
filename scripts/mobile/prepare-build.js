const fs = require('node:fs')

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const { expo } = JSON.parse(fs.readFileSync('app.json', 'utf8'))
const platform = process.env.BUILD_PLATFORM
const run = process.env.GITHUB_RUN_NUMBER
const attempt = process.env.GITHUB_RUN_ATTEMPT

if (!['ios', 'android'].includes(platform)) throw new Error('Select ios or android')
if (!/^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.test(version)) {
  throw new Error(
    'package.json version must be major.minor.patch with components from 0 to 999'
  )
}
if (!/^[1-9]\d*$/.test(run) || !/^[1-9]\d?$/.test(attempt)) {
  throw new Error(
    'GITHUB_RUN_NUMBER must be positive and GITHUB_RUN_ATTEMPT must be from 1 to 99'
  )
}
const buildNumber = Number(run) * 100 + Number(attempt)
if (!Number.isSafeInteger(buildNumber) || buildNumber > 2100000000) {
  throw new Error('Build number exceeds the Android version code limit')
}
const applicationId = platform === 'ios' ? expo.ios.bundleIdentifier : expo.android.package
if (
  !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(applicationId) ||
  applicationId.startsWith('com.anonymous.')
) {
  throw new Error(`Set a registered ${platform} application ID in app.json`)
}
const metadata = {
  platform,
  applicationId,
  version,
  buildNumber: String(buildNumber),
  buildLabel: `${version
    .split('.')
    .map((part) => part.padStart(3, '0'))
    .join('.')}-${run.padStart(8, '0')}.${attempt.padStart(2, '0')}`,
  ...(platform === 'android' && { versionCode: buildNumber }),
  repository: process.env.SOURCE_REPOSITORY,
  ref: process.env.SOURCE_REF,
  commit: process.env.SOURCE_COMMIT,
  buildRepository: process.env.GITHUB_REPOSITORY,
  runId: process.env.GITHUB_RUN_ID
}
fs.mkdirSync(`dist/${platform}`, { recursive: true })
fs.writeFileSync(
  `dist/${platform}/build-metadata.json`,
  JSON.stringify(metadata, null, 2) + '\n'
)
fs.appendFileSync(process.env.GITHUB_ENV, `BUILD_NUMBER=${buildNumber}\n`)
console.log(`${platform}: ${applicationId} ${version} (${buildNumber})`)
