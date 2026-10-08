# Releasing Snake Mobile

GitHub Actions in [geordangesink/pear-snake-ci-build](https://github.com/geordangesink/pear-snake-ci-build) builds and signs the native apps, following [Keet's build flow](https://github.com/holepunchto/keet-mobile/blob/main/.github/workflows/build.yml). Workflows, artifacts, signing secrets, and store credentials live in that central repository. Expo Prebuild generates the native projects; Xcode and Gradle compile them on the runners. EAS is no longer required for builds or publishing.

App configuration paths in this guide are relative to the `snake-mobile` source repository.

## Flow

- **Build:** Open [pear-snake-ci-build Actions](https://github.com/geordangesink/pear-snake-ci-build/actions) → **Build Snake Mobile** → Run workflow. Set `ref` to the desired snake-mobile branch, tag, or commit; it defaults to `main`. Keep `mode` set to `native`, choose `production` or `preview`, and select `build_ios` / `build_android`. Both platforms build the same resolved source commit. Runs are manual; pushing a tag does not start a build.
- **Publish after building:** Enable `publish` to submit successful production builds' exact artifacts to TestFlight and Google Play internal testing. It defaults to off. Preview builds are never submitted.
- **Publish an existing build:** In the central repository, select **Build Snake Mobile** with `mode: publish`. Set `build_run_id` to the numeric GitHub Actions run ID from a central build's URL (`actions/runs/<id>`), then select `build_ios` / `build_android`. It downloads the production artifacts from that run; there is no latest-build fallback. Artifacts must still be available.
- **Build Pear updates:** In the central repository, select **Build Snake Mobile** with `mode: updates`. Set the source `ref` (default `main`) and `channel`, then optionally enable `run-stage` to stage the update bundle. Native builds can also enable `run-stage` to stage updates from the same source commit after all selected platforms succeed. See the [central staging setup](README.md#pear-staging) for staging credentials, namespaces, and upgrade links.

| Platform | Runner and tools                             | Production artifact                                             | Preview artifact                                                                                   |
| -------- | -------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| iOS      | `macos-26`, Prebuild, CocoaPods, Xcode       | `mobile-ios-production`: App Store signed `Snake.ipa`           | `mobile-ios-preview`: ad hoc signed `Snake.ipa` for devices registered in its provisioning profile |
| Android  | `ubuntu-24.04`, Prebuild, Gradle; ARM64 only | `mobile-android-production`: signed `Snake.aab` and `Snake.apk` | `mobile-android-preview`: signed `Snake.apk`                                                       |

Each native artifact includes `build-metadata.json` with the source repository, requested ref, and resolved commit, and is retained for 14 days in pear-snake-ci-build. TestFlight uploads use `altool` with an App Store Connect API key. Google Play uploads use the service account and target the internal testing track.

## Versions

The store version comes from `package.json` through `app.config.js`. Both platforms use the central **Build Snake Mobile** workflow's `github.run_number + BUILD_NUMBER_OFFSET` as their build number / Android version code. `BUILD_NUMBER_OFFSET` defaults to `0`; set it in pear-snake-ci-build before migrating so the next number exceeds every previously uploaded store build, including builds from EAS or snake-mobile Actions. The optional `build_number` workflow input overrides this calculation.

Rerunning a workflow keeps its run number. To upload a rebuilt store version, start a new run or start a run with an explicit larger `build_number`. After using an override, adjust the offset if necessary so future automatic numbers remain higher. The build number is separate from the GitHub run ID used to select artifacts for publishing.

## Secrets

Set these Actions secrets in the `release` environment of **geordangesink/pear-snake-ci-build**, or at repository/organization scope available to that repository, for the selected platforms and profiles.

Source repositories are expected to be public, so builds use the automatic `GITHUB_TOKEN` for checkout. GitHub App credentials are optional and only used for Pear staging snapshot writes.

| Build secret                            | Value                                                                              |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`               | Base64-encoded Android signing keystore / Play upload keystore                     |
| `ANDROID_KEYSTORE_PASSWORD`             | Keystore password                                                                  |
| `ANDROID_KEY_ALIAS`                     | Signing key alias                                                                  |
| `ANDROID_KEY_PASSWORD`                  | Signing key password                                                               |
| `BUILD_CERTIFICATE_BASE64`              | Base64-encoded Apple distribution certificate and private key exported as `.p12`   |
| `P12_PASSWORD`                          | Password for that `.p12`                                                           |
| `APPLE_TEAM_ID`                         | Apple Developer Team ID                                                            |
| `IOS_PROVISIONING_PROFILE_BASE64`       | Base64-encoded App Store provisioning profile for production                       |
| `IOS_ADHOC_PROVISIONING_PROFILE_BASE64` | Base64-encoded ad hoc provisioning profile for preview, including the test devices |

| Publish secret                | Value                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `APPSTORE_API_KEY_ID`         | App Store Connect API key ID                                                   |
| `APPSTORE_ISSUER_ID`          | App Store Connect API issuer ID                                                |
| `APPSTORE_API_PRIVATE_KEY`    | Base64-encoded `.p8` private key for that API key                              |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full, raw JSON key for a service account with Play Console release permissions |

`EXPO_TOKEN`, `EAS_PROJECT_ID`, `APPLE_ID`, `APPLE_ASC_APP_ID`, and `EXPO_APPLE_APP_SPECIFIC_PASSWORD` are no longer used by these workflows.

## Variables

Set these optional app identity and numbering overrides in pear-snake-ci-build's `release` environment or repository settings.

| Optional Actions variable | Value                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| `IOS_BUNDLE_ID`           | Override for `expo.ios.bundleIdentifier` in `app.json`                |
| `ANDROID_PACKAGE`         | Override for `expo.android.package` in `app.json`                     |
| `BUILD_NUMBER_OFFSET`     | Nonnegative integer added to the workflow run number; defaults to `0` |

## One-time setup

- Configure the `release` environment in geordangesink/pear-snake-ci-build. See the [central build setup](README.md#repository-setup) for the shared desktop and mobile configuration.
- Export the signing credentials previously managed by EAS and add them to the secrets above. Keep the same Android signing / upload key used for the existing app; the workflows do not generate a replacement. Export the Apple distribution certificate with its private key and the matching provisioning profiles. See [GitHub's Apple signing guide](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications) for exporting and encoding credentials.
- Set real app identifiers in `app.json` or the variables above. Production builds reject `com.anonymous.*` placeholders. Apple profiles must match the bundle ID, team, and signing certificate. Register preview devices before exporting the ad hoc profile.
- Create the app records in App Store Connect and Play Console. Grant the App Store Connect API key permission to upload builds. Enable the **Google Play Android Developer API** in the service account's Google Cloud project, and invite its email in Play Console with release permissions. Complete any initial Play Console app setup and first upload required before API publishing.
- Set `BUILD_NUMBER_OFFSET` in pear-snake-ci-build from the last uploaded store build numbers before starting the first central build. Its workflow run numbering is independent of snake-mobile and EAS.
- Once the iOS app exists in App Store Connect, set `expo.extra.iosAppStoreId` in `app.json` to its numeric Apple ID (App Information → Apple ID). The update banner opens that listing when an OTA payload requires a newer native build (`pear.json` → `updates.minver`); while it is empty, iOS shows the banner text without a button. Android builds the listing link from `expo.android.package`, including the `ANDROID_PACKAGE` override.

Native projects are regenerated during builds. Keep native customizations in app configuration or config plugins, as described in [Expo's Prebuild documentation](https://docs.expo.dev/workflow/continuous-native-generation/).
