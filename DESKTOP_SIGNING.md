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

Run **Build Snake Desktop** with `run-macos` for Apple Silicon and/or `run-macos-intel` for Intel. Leave `unsigned` off.

## Windows

The default `windows-signing: self-signed` builds an MSIX on `windows-latest`. It needs no paid signing certificate or Windows developer account. Each user must explicitly trust your certificate before installation; this does not guarantee the absence of SmartScreen warnings. Microsoft documents this approach for [testing and sideloading](https://learn.microsoft.com/en-us/windows/msix/package/sign-msix-package-guide).

Generate a persistent signing certificate on macOS or Linux with OpenSSL available:

```sh
scripts/create-windows-certificate.sh
base64 < out/windows-signing/snake.pfx | tr -d '\n' | gh secret set WINDOWS_CERTIFICATE_BASE64 --env release
gh secret set WINDOWS_CERTIFICATE_PASSWORD --env release
```

Use the password chosen by the certificate helper at the final prompt. The helper creates an encrypted `snake.pfx` and public `snake.cer` in the ignored `out/windows-signing` directory. Its optional arguments are `[output-directory [subject]]`; the default subject is `/CN=Snake`. Back up the PFX and password securely, and reuse the same certificate for subsequent builds so users keep their existing trust. CI derives the package publisher from the certificate subject.

Run **Build Snake Desktop** with `run-windows-x64` enabled, `unsigned` off, and `windows-signing: self-signed`. Download the `snake-win32-x64-msix` artifact, which contains the MSIX, public `snake.cer`, and `INSTALL.txt`. It contains no private key.

To install, extract the artifact, open **PowerShell as administrator** in that folder, and run this once for a certificate from a publisher you trust:

```powershell
Import-Certificate -FilePath .\snake.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople
```

Then double-click the MSIX as your normal user. This uses the **Trusted People** store. A replacement certificate needs a new trust step.

For an existing signing setup, choose `windows-signing: cert-sha1`, register a self-hosted runner with the `windows-signer` label and its certificate/private key installed, and configure `WINDOWS_CERT_SHA1` with the certificate thumbprint. This mode does not use the PFX secrets.

Selecting `unsigned` bypasses Windows signing and produces a portable ZIP on a hosted runner. Unsigned builds cannot stage updates.
