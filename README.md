# pear-snake-ci-build

Builds, artifacts, signing credentials, Pear staging, and mobile store publishing live here. Source code stays in `geordangesink/snake` and `geordangesink/snake-mobile`. Both source refs default to `main` and remain selectable.

## Workflows

| Workflow                | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| **Build Snake Desktop** | Linux x64/arm64, macOS x64/arm64, Windows x64; optional Pear staging |
| **Build Snake Mobile**  | Native iOS/Android builds, Pear updates, and store publishing        |
| **CodeQL**              | JavaScript/TypeScript security analysis for both source repositories |
| **E2E Snake Desktop**   | Tests packaged apps: create, steer, join another player, and leave   |
| **E2E Snake Mobile**    | Builds and tests iOS Simulator and Android emulator apps             |

Start builds from this repository's **Actions** tab. Each build resolves `ref` once so all selected platforms use the same source commit. Publishing, staging, and Slack notifications are opt-in.

### Desktop

Select the platforms to build; all default to off, matching `pear-ci-build`. Outputs are Linux AppImage, Snap, and Flatpak source archives; macOS DMG and app ZIP; and signed Windows MSIX.

Enable `unsigned` for testing without desktop signing credentials. macOS produces an unsigned DMG and app ZIP; Windows produces a portable ZIP on a hosted runner. These artifact names end in `-unsigned`. Linux outputs are unchanged. Unsigned builds cannot stage updates.

### Mobile

Use **Build Snake Mobile** for all three modes:

| `mode`             | Behavior                                                                              |
| ------------------ | ------------------------------------------------------------------------------------- |
| `native` (default) | Build selected iOS/Android apps. Optionally enable `run-stage` and/or `publish`.      |
| `updates`          | Bundle Pear updates. Enable `run-stage` to stage them.                                |
| `publish`          | Submit existing production artifacts using `build_run_id` and the platform selectors. |

Native builds default to both platforms and the `production` profile. `preview` produces an ad hoc IPA and signed APK. Production adds an Android AAB and supports TestFlight / Google Play internal testing submissions. Publishing uses the exact artifacts from the selected run; there is no latest-build fallback. Artifacts are retained for 14 days.

See [Releasing Snake Mobile](RELEASING.md) for versioning, credentials, and store setup.

## Repository setup

Configure the `release` environment here, or use repository-level secrets and variables. Source repositories must be public; checkout uses `GITHUB_TOKEN`.

For signed Windows builds, register a `windows-signer` runner with the signing certificate installed. Native mobile builds use Xcode 26.2 on `macos-26` and Java 17 on `ubuntu-24.04`.

### Pear staging

The two apps have independent identities and snapshots:

| App     | Secret                     | Snapshot                        | Default namespace           |
| ------- | -------------------------- | ------------------------------- | --------------------------- |
| Desktop | `PEAR_DESKTOP_PRIMARY_KEY` | `ci/snake-snapshot.json`        | `snake-<channel>-v1`        |
| Mobile  | `PEAR_MOBILE_PRIMARY_KEY`  | `ci/snake-mobile-snapshot.json` | `snake-mobile-<channel>-v1` |

Each secret is its app's 64-character hex Corestore primary key. `channel` selects `dev`, `stage`, or `production`. Optional `PEAR_DESKTOP_NAMESPACE` / `PEAR_MOBILE_NAMESPACE` variables override the corresponding namespace, including its channel suffix.

To preserve existing upgrade links, use each app's original identity and namespace. A new primary key creates a different link. Staging checks the derived link against the source's `package.json` `upgrade` field, or the `upgrade-key` input override, and stops on a mismatch. Native packages and update bundles use the same override.

Enable `run-stage` to stage, and `stage-dry-run` to preview without publishing or committing a snapshot. Desktop requires all selected platform builds to succeed. Mobile native mode stages only after all selected native builds succeed; updates mode runs independently.

Snapshots are read from and committed to this repository's `main` branch. A shared concurrency group serializes snapshot writes. If direct push is blocked, staging opens a snapshot PR; merge it before staging that app again. Keep both initial snapshot files in `main`.

Staging uses `GITHUB_TOKEN` by default. An optional GitHub App with Contents write and Pull requests write can supply the token through `BUILD_APP_CLIENT_ID` (variable) and `BUILD_APP_PRIVATE_KEY` (secret). `BUILD_APP_ID` remains a fallback for existing setups.

### Desktop signing

Use the same secret names as `pear-ci-build`:

- `MACOS_CERTIFICATE_BASE64`
- `MACOS_P12_PASSWORD`
- `MACOS_CODESIGN_IDENTITY`
- `MACOS_APPLE_ID`
- `MACOS_APPLE_PASSWORD`
- `MACOS_APPLE_TEAM_ID`
- `WINDOWS_CERT_SHA1`

`MACOS_CERTIFICATE_BASE64` must contain a base64-encoded `.p12` export of the macOS Developer ID Application certificate **and its private key**. Set its password and matching identity in the corresponding secrets. The mobile distribution certificate is separate. Signed macOS builds check all six desktop secrets before installing dependencies.

### Mobile signing and publishing

| Purpose           | Secrets                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| iOS signing       | `BUILD_CERTIFICATE_BASE64`, `P12_PASSWORD`, `APPLE_TEAM_ID`, `IOS_PROVISIONING_PROFILE_BASE64`      |
| iOS preview       | `IOS_ADHOC_PROVISIONING_PROFILE_BASE64` replaces the production provisioning profile                |
| Android signing   | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| App Store Connect | `APPSTORE_API_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_API_PRIVATE_KEY`                             |
| Google Play       | `GOOGLE_SERVICE_ACCOUNT_JSON`                                                                       |

Certificates, provisioning profiles, the Android keystore, and the App Store Connect `.p8` key are base64 encoded. The Google service account secret is raw JSON. Other values are plain text.

Mobile variables:

- `IOS_BUNDLE_ID`: registered bundle identifier; production rejects placeholder identifiers.
- `ANDROID_PACKAGE`: optional override of the source application's package name.
- `BUILD_NUMBER_OFFSET`: nonnegative offset added to this workflow's run number. Set it high enough to exceed previous store build numbers. `build_number` can override one build.

Set `SLACK_WEBHOOK_URL` to use optional build notifications.

## Checks

**CodeQL** scans both repositories weekly or on manual dispatch. Download each app's SARIF report and source metadata from its run. Reports stay here as artifacts; uploading alerts to a source repository's Security tab requires a token with access to that repository.

**E2E Snake Desktop** runs after successful desktop builds on `main`, or manually with a completed desktop build’s `run-id`. It uses available AppImage, macOS app ZIP, and Windows ZIP/MSIX artifacts. Tests exercise the extracted application, including real multiplayer connections; they do not test installer registration or signing.

**E2E Snake Mobile** runs manually against a selectable source ref. It builds unsigned iOS Simulator and debug-signed Android emulator apps without release secrets, then tests create, copy topic, leave, and join through Maestro. Both E2E workflows use real networking and upload diagnostics.

Local workflow validation:

```sh
actionlint -config-file .github/actionlint.yaml .github/workflows/*.yml
node --check scripts/build-stage-artifact.js
node --check scripts/stage.js
```
