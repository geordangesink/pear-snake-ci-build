const path = require('node:path')
const { signAsync } = require('@electron/osx-sign')

signAsync({
  app: process.argv[2],
  identity: process.env.MACOS_CODESIGN_IDENTITY,
  keychain: process.env.KEYCHAIN_PATH,
  platform: 'darwin',
  type: 'distribution',
  preAutoEntitlements: false,
  preEmbedProvisioningProfile: false,
  gatekeeperAssess: false,
  optionsForFile: () => ({
    entitlements: path.join(__dirname, 'entitlements.plist'),
    hardenedRuntime: true
  })
}).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
