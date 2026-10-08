# Desktop signing

Configure secrets in this repository's `release` environment. The commands below use GitHub CLI from this checkout; password and text secrets are entered at its hidden prompt. Keep certificate private keys and passwords out of commits, artifacts, and chat.

## macOS

Apple Developer Program membership supports direct distribution with a **Developer ID Application** certificate and notarization. The workflow signs, notarizes, staples, and verifies the app and DMG before uploading them. See [Apple's Developer ID guide](https://developer.apple.com/developer-id/) and [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

1. Open **Keychain Access → My Certificates**. Find `Developer ID Application: Your Name (TEAMID)` and expand it to confirm its private key is present. Create a Developer ID Application certificate through Xcode or the Apple Developer account if needed.
2. Export that certificate **with its private key** as `developer-id.p12`, choosing a strong export password. A `.cer` file alone or an iOS distribution certificate will not work.
3. Store the export and its matching identity:

```sh
base64 < ~/Desktop/developer-id.p12 | tr -d '\n' | gh secret set MACOS_CERTIFICATE_BASE64 --env release
gh secret set MACOS_P12_PASSWORD --env release
security find-identity -v -p codesigning
gh secret set MACOS_CODESIGN_IDENTITY --env release
```

Enter the full matching identity, including `Developer ID Application:` and the team ID, at the last prompt.

For notarization, reuse the three `APPSTORE_*` secrets already configured for mobile. They must belong to an App Store Connect **team API key**, not an individual key. If setting them up for the first time:

```sh
base64 < ~/Downloads/AuthKey_KEYID.p8 | tr -d '\n' | gh secret set APPSTORE_API_PRIVATE_KEY --env release
gh secret set APPSTORE_API_KEY_ID --env release
gh secret set APPSTORE_ISSUER_ID --env release
```

The workflow prefers this API key when all three secrets are present. Apple's [API key documentation](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api) explains team keys, and its [notary service documentation](https://developer.apple.com/documentation/NotaryAPI/submitting-software-for-notarization-over-the-web) covers reuse for notarization.

Alternatively, configure all three Apple ID secrets. `MACOS_APPLE_PASSWORD` is an [app-specific password](https://support.apple.com/102654), and `MACOS_APPLE_TEAM_ID` must match the signing certificate's team:

```sh
gh secret set MACOS_APPLE_ID --env release
gh secret set MACOS_APPLE_PASSWORD --env release
gh secret set MACOS_APPLE_TEAM_ID --env release
```

Run **Build Snake Desktop** with `run-macos` for Apple Silicon and/or `run-macos-intel` for Intel.

## Windows

Register a self-hosted runner with the `windows-signer` label. Install the code-signing certificate and its private key in `Cert:\CurrentUser\My` for the account running the Actions runner. The certificate must be valid and allow code signing.

Set `WINDOWS_CERT_SHA1` to the certificate's 40-character hexadecimal thumbprint, without spaces:

```sh
gh secret set WINDOWS_CERT_SHA1 --env release
```

Run **Build Snake Desktop** with `run-windows-x64` enabled. The workflow derives the MSIX publisher from the installed certificate, signs and verifies the package, and uploads it as `snake-win32-x64-msix`.
