# Releasing

GitHub Actions builds and signs the native apps, following [Keet's build flow](https://github.com/holepunchto/keet-mobile/blob/main/.github/workflows/build.yml). Expo Prebuild generates the native projects; Xcode and Gradle compile them on the runners. EAS is no longer required for builds or publishing.

## Flow

- **Build:** Actions → **Build Mobile Store Releases** → Run workflow. Pick the desired branch or tag, choose `production` or `preview`, and select `build_ios` / `build_android`. Runs are manual; pushing a tag does not start a build.
- **Publish after building:** `publish` defaults to on. Successful production builds submit their exact artifacts to TestFlight and Google Play internal testing. Turn it off for a build-only run. Preview builds are never submitted.
- **Publish an existing build:** Actions → **Publish Mobile Store Releases**. Set `build_run_id` to the numeric GitHub Actions run ID from the build's URL (`actions/runs/<id>`), then select `submit_ios` / `submit_android`. It downloads the production artifacts from that run; there is no latest-build fallback. Artifacts must still be available.

| Platform | Runner and tools                             | Production artifact                                             | Preview artifact                                                                                   |
| -------- | -------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| iOS      | `macos-26`, Prebuild, CocoaPods, Xcode       | `mobile-ios-production`: App Store signed `Snake.ipa`           | `mobile-ios-preview`: ad hoc signed `Snake.ipa` for devices registered in its provisioning profile |
| Android  | `ubuntu-24.04`, Prebuild, Gradle; ARM64 only | `mobile-android-production`: signed `Snake.aab` and `Snake.apk` | `mobile-android-preview`: signed `Snake.apk`                                                       |

Each artifact includes `build-metadata.json` and is retained for 14 days. TestFlight uploads use `altool` with an App Store Connect API key. Google Play uploads use the service account and target the internal testing track.

## Versions

The store version comes from `package.json` through `app.config.js`. Both platforms use `github.run_number + BUILD_NUMBER_OFFSET` as their build number / Android version code. `BUILD_NUMBER_OFFSET` defaults to `0`; set it before migrating so the next number exceeds the last number uploaded through EAS. The optional `build_number` workflow input overrides this calculation.

Rerunning a workflow keeps its run number. To upload a rebuilt store version, start a new run or start a run with an explicit larger `build_number`. After using an override, adjust the offset if necessary so future automatic numbers remain higher. The build number is separate from the GitHub run ID used to select artifacts for publishing.

## Secrets

Set repository or organization Actions secrets for the selected platforms and profiles.

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

| Optional Actions variable | Value                                                                 |
| ------------------------- | --------------------------------------------------------------------- |
| `IOS_BUNDLE_ID`           | Override for `expo.ios.bundleIdentifier` in `app.json`                |
| `ANDROID_PACKAGE`         | Override for `expo.android.package` in `app.json`                     |
| `BUILD_NUMBER_OFFSET`     | Nonnegative integer added to the workflow run number; defaults to `0` |

## One-time setup

- Export the signing credentials previously managed by EAS and add them to the secrets above. Keep the same Android signing / upload key used for the existing app; the workflows do not generate a replacement. Export the Apple distribution certificate with its private key and the matching provisioning profiles. See [GitHub's Apple signing guide](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications) for exporting and encoding credentials.
- Set real app identifiers in `app.json` or the variables above. Production builds reject `com.anonymous.*` placeholders. Apple profiles must match the bundle ID, team, and signing certificate. Register preview devices before exporting the ad hoc profile.
- Create the app records in App Store Connect and Play Console. Grant the App Store Connect API key permission to upload builds. Enable the **Google Play Android Developer API** in the service account's Google Cloud project, and invite its email in Play Console with release permissions. Complete any initial Play Console app setup and first upload required before API publishing.
- Set `BUILD_NUMBER_OFFSET` from the last uploaded store build numbers before starting the first migrated build.
- Once the iOS app exists in App Store Connect, set `expo.extra.iosAppStoreId` in `app.json` to its numeric Apple ID (App Information → Apple ID). The update banner opens that listing when an OTA payload requires a newer native build (`pear.json` → `updates.minver`); while it is empty, iOS shows the banner text without a button. Android builds the listing link from `expo.android.package`, including the `ANDROID_PACKAGE` override.

Native projects are regenerated during builds. Keep native customizations in app configuration or config plugins, as described in [Expo's Prebuild documentation](https://docs.expo.dev/workflow/continuous-native-generation/).
