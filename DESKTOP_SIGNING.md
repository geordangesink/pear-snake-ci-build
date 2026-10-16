# Desktop signing

Configure secrets in this repository's `release` environment. Run the GitHub CLI commands below from this checkout; text and password secrets use its hidden prompt.

## macOS

The workflow signs, notarizes, staples, and verifies the app and DMG using a [Developer ID Application certificate](https://developer.apple.com/developer-id/).

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

Notarization uses the shared `APPLE_API_*` credentials, also used for iOS store uploads. Use an App Store Connect **team API key**, not an individual key. To configure it:

```sh
base64 < ~/Downloads/AuthKey_KEYID.p8 | tr -d '\n' | gh secret set APPLE_API_PRIVATE_KEY_BASE64 --env release
gh secret set APPLE_API_KEY_ID --env release
gh secret set APPLE_API_ISSUER_ID --env release
```

Run **Build Snake Desktop** with `run-macos` for Apple Silicon and/or `run-macos-intel` for Intel.

## Windows

Register a self-hosted runner with the `windows-signer` label. Install the code-signing certificate and its private key in `Cert:\CurrentUser\My` for the account running the Actions runner. The certificate must be valid and allow code signing.

Set `WINDOWS_CERT_SHA1` to the certificate's 40-character hexadecimal thumbprint, without spaces:

```sh
gh secret set WINDOWS_CERT_SHA1 --env release
```

Run **Build Snake Desktop** with `run-windows-x64` enabled. The workflow derives the MSIX publisher from the installed certificate, signs and verifies the package, and uploads it as `snake-win32-x64-msix`.
