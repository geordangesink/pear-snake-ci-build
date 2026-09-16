# pear-snake-ci-build

Central GitHub Actions builds for `holepunchto/snake` and `holepunchto/snake-mobile`, following `pear-ci-build`.

Start builds from this repository's Actions tab. Source checkouts, signing, artifacts, staging snapshots, store publication, and optional Slack notifications run here. Configure secrets in this repository's `release` environment.

## Source repositories

| CI workflow branch | Desktop source        | Mobile source                |
| ------------------ | --------------------- | ---------------------------- |
| `main`             | `holepunchto/snake`   | `holepunchto/snake-mobile`   |
| `test`             | `geordangesink/snake` | `geordangesink/snake-mobile` |

In Actions, select `test` under **Use workflow from** to build the personal repos. The `ref` input selects the branch, tag, or commit within the source repo and defaults to `main` on both workflow branches.

Staging and store publishing on `test` use this repository's configured release destinations and remain opt-in.

## Workflows

| Workflow                                                | Source default                    | Outputs                                                                                                       |
| ------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `build.yml` — Build Snake                               | `snake@main`                      | Linux x64/arm64 AppImage, Snap and Flatpak source archives; macOS arm64/x64 DMG and app ZIP; Windows x64 MSIX |
| `build-mobile.yml` — Build Snake Mobile                 | `snake-mobile@main`               | Signed iOS IPA and Android APK; production Android AAB; build metadata                                        |
| `build-mobile-updates.yml` — Build Snake Mobile Updates | `snake-mobile@main`               | Pear updates for iOS arm64, both iOS simulator architectures, and Android arm64                               |
| `publish-mobile.yml` — Publish Snake Mobile             | Build run ID from this repository | TestFlight and Google Play internal testing submissions                                                       |

Each build defaults to its source repository’s `main` branch and accepts another branch, tag, or commit through `ref`. Desktop and native mobile builds resolve the ref once so all platforms use the same commit.

Desktop platform toggles default to false, matching Pear. Select the platforms to build. `channel` defaults to `dev`, with `stage` and `production` also available. `upgrade-key` overrides the package's `upgrade` field; otherwise the source value is preserved.

Native mobile builds default to both platforms and the `production` profile. `preview` produces an ad hoc IPA and signed APK. `publish` is opt-in and only applies to successful production builds. The publishing workflow can also retry either platform using the original build run ID. Native artifacts and failure logs are retained for 14 days.

## Repository setup

1. Push these files to the `main` branch of `geordangesink/pear-snake-ci-build`, including the initial empty `ci/snapshot.json`.
2. Create its `release` environment and configure the secrets and variables below. Repository-level secrets and variables also work.
3. Optionally install a build GitHub App on this CI repository with Contents write and Pull requests write for staging snapshots. Set `BUILD_APP_CLIENT_ID` and `BUILD_APP_PRIVATE_KEY` here when using it. Staging otherwise uses `GITHUB_TOKEN`.
4. Make the organization's `windows-signer` runner available to this repository, with its signing certificate installed. Ensure private shared Actions/packages grant this repository access if applicable.
5. Set mobile application IDs and a build-number offset before the first store build.

Source repositories are expected to be public. Desktop and mobile source checkouts use the automatic `GITHUB_TOKEN`; building does not require GitHub App credentials.

Source build scripts remain in their source repositories. The migrated desktop release and mobile build/publish workflows are removed from the source repos. Source lint/test integration and desktop npm publishing remain independent.

## Secrets and variables

### Shared

| Name                    | Kind     | Used for                                                        |
| ----------------------- | -------- | --------------------------------------------------------------- |
| `BUILD_APP_CLIENT_ID`   | Variable | Optional GitHub App client ID for staging                       |
| `BUILD_APP_PRIVATE_KEY` | Secret   | Optional GitHub App PEM private key for staging                 |
| `PEAR_PRIMARY_KEY`      | Secret   | 64-character hex Corestore identity for both apps' Pear staging |
| `SLACK_WEBHOOK_URL`     | Secret   | Optional notifications when `notify` is selected                |

The staging workflow accepts `BUILD_APP_ID` as a fallback for existing setups. New setups should use `BUILD_APP_CLIENT_ID` with the client ID from the GitHub App settings.

### Desktop signing

Use the same names as `pear-ci-build`:

- `MACOS_CERTIFICATE_BASE64`
- `MACOS_P12_PASSWORD`
- `MACOS_CODESIGN_IDENTITY`
- `MACOS_APPLE_ID`
- `MACOS_APPLE_PASSWORD`
- `MACOS_APPLE_TEAM_ID`
- `WINDOWS_CERT_SHA1`

Windows uses the Pear certificate-thumbprint flow on `windows-signer`. macOS uses Apple ID/password notarization.

### Mobile signing and stores

| Platform          | Secrets                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| iOS signing       | `BUILD_CERTIFICATE_BASE64`, `P12_PASSWORD`, `APPLE_TEAM_ID`, `IOS_PROVISIONING_PROFILE_BASE64`      |
| iOS preview       | `IOS_ADHOC_PROVISIONING_PROFILE_BASE64` replaces the production provisioning profile                |
| Android signing   | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` |
| App Store Connect | `APPSTORE_API_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_API_PRIVATE_KEY`                             |
| Google Play       | `GOOGLE_SERVICE_ACCOUNT_JSON`                                                                       |

Certificates, provisioning profiles, the Android keystore, and the App Store Connect `.p8` key are base64 encoded. `GOOGLE_SERVICE_ACCOUNT_JSON` is raw JSON. Apple IDs, passwords, key IDs, and team IDs are plain values.

Mobile variables:

- `IOS_BUNDLE_ID`: registered bundle identifier. The source placeholder `com.anonymous.snake` is rejected for production.
- `ANDROID_PACKAGE`: optional override of the source's `com.pearsnake.app` application ID.
- `BUILD_NUMBER_OFFSET`: non-negative integer added to this workflow's run number. Set it high enough to exceed existing store build numbers, since this repository starts a new run-number sequence. The `build_number` input can override an individual build.

Native iOS builds use Xcode 26.2 on `macos-26`; Android uses Java 17 on `ubuntu-24.04`.

## Pear staging

`run-stage` and `stage-dry-run` mirror Pear's optional staging flow. Desktop staging requires at least one selected platform and successful builds for every selected platform. The stage builder feeds signed `.app`, `.AppImage`, and `.msix` artifacts through `pear-build`; installers remain downloadable from the build run.

Mobile updates use `npm run update` to bundle JavaScript and assets. Native store packages and Pear update bundles use separate workflows.

Both stage jobs call `holepunchto/actions/pear-ci` and save snapshots here. Namespaces prevent the two apps from sharing an update drive:

- Desktop: `snake-<channel>-v1`
- Mobile: `snake-mobile-<channel>-v1`

A shared staging concurrency group serializes updates to `ci/snapshot.json`. Stage artifacts are archived before upload to preserve app permissions and symlinks. The initial snapshot is empty; no Pear CLI snapshot or signing keys are copied.

These namespaces create new update drives under `PEAR_PRIMARY_KEY`. Their links must be wired into the apps' `upgrade` fields using `upgrade-key` or source changes. They do not take over the apps' existing upgrade links automatically.

## Validation

```sh
actionlint -config-file .github/actionlint.yaml .github/workflows/*.yml
node --check scripts/build-stage-artifact.js
```

Signed builds, store submissions, and network staging require the configured GitHub repository, runners, and credentials.
