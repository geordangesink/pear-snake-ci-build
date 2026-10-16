# Releasing Snake Mobile

Run **Build Snake Mobile** in [pear-snake-ci-build Actions](https://github.com/holepunchto/pear-snake-ci-build/actions). Source configuration paths below are relative to `snake-mobile`; credentials belong in this CI repository's `release` environment or repository settings.

## Build and publish

Select a source `ref` (default `main`) and `build_ios` / `build_android`. Both platforms use the same resolved commit.

| Mode               | Behavior                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `native` (default) | Build selected platforms for distribution. Enable `publish` to submit successful artifacts, or `run-stage` to stage updates after every selected build succeeds. |
| `updates`          | Bundle Pear updates. Enable `run-stage` to stage them; see [staging setup](README.md#pear-staging).                                                              |
| `publish`          | Submit signed native artifacts. Set `build_run_id` to the numeric ID from the build's `actions/runs/<id>` URL and select its platforms.                          |

Runs are manual. Publishing uses the selected run's exact artifacts and build numbers; it does not rebuild or renumber them. Artifacts must still be available.

| Platform | Tools                                  | Artifacts                          |
| -------- | -------------------------------------- | ---------------------------------- |
| iOS      | Xcode 26.2, CocoaPods, `macos-26`      | App Store signed `Snake.ipa`       |
| Android  | Java 17, Gradle, `ubuntu-24.04`; ARM64 | Signed `Snake.aab` and `Snake.apk` |

Artifacts are named `mobile-ios` and `mobile-android` and retained for 14 days. Each includes source/ref/commit metadata. Publishing uploads iOS builds to App Store Connect for TestFlight and Android builds to Google Play's internal testing track. Test iOS builds through TestFlight before releasing them publicly; the workflow does not release them to the public App Store.

## Versions

`package.json` supplies the store version through `app.config.js`. Use `major.minor.patch`, with each component from `0` to `999` and no prerelease suffix.

Build numbers are automatic: `github.run_number * 100 + github.run_attempt`. The counter continues across app versions and retries receive a new number. Both platforms use the same number; Android uses it as its version code. Attempts must be `1–99` and the result cannot exceed `2100000000`; invalid values fail the build instead of wrapping.

Metadata also includes a fixed-width `buildLabel`: `MMM.mmm.ppp-RRRRRRRR.AA`. Version `1.2.3`, run `42`, attempt `2` produces `001.002.003-00000042.02` and store build number `4202`.

Publish a number higher than the previous store upload. Retrying an older run can produce a lower number than a newer run; start a fresh run against the intended ref for the next release. GitHub run IDs select artifacts and are separate from build numbers.

## Credentials

| Secret                            | Value                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `IOS_CERTIFICATE_BASE64`          | Base64 Apple distribution certificate **and private key**, exported as `.p12` |
| `IOS_P12_PASSWORD`                | Export password                                                               |
| `APPLE_TEAM_ID`                   | Apple Developer team ID                                                       |
| `IOS_PROVISIONING_PROFILE_BASE64` | Base64 App Store provisioning profile                                         |
| `ANDROID_KEYSTORE_BASE64`         | Base64 Android signing / Play upload keystore                                 |
| `ANDROID_KEYSTORE_PASSWORD`       | Keystore password                                                             |
| `ANDROID_KEY_ALIAS`               | Signing key alias                                                             |
| `ANDROID_KEY_PASSWORD`            | Signing key password                                                          |
| `APPLE_API_KEY_ID`                | App Store Connect API key ID                                                  |
| `APPLE_API_ISSUER_ID`             | App Store Connect issuer ID                                                   |
| `APPLE_API_PRIVATE_KEY_BASE64`    | Base64 `.p8` private key                                                      |
| `GOOGLE_SERVICE_ACCOUNT_JSON`     | Raw service account JSON with Play Console release permissions                |

Only configure credentials for the platforms you use. Create the Android signing / upload key once and retain it for subsequent releases. The Apple provisioning profile must match the bundle identifier, team, and signing certificate. See [GitHub's Apple signing guide](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications) for certificate export and encoding.

## Store setup

1. Set registered app identifiers in `app.json`: `expo.ios.bundleIdentifier` and `expo.android.package`. Native builds reject `com.anonymous.*` placeholders.
2. Create App Store Connect and Play Console app records. Give the Apple API key upload permission. Enable the Google Play Android Developer API and invite the service account in Play Console with release permissions; complete any required first upload there.
3. Set `expo.extra.iosAppStoreId` to the listing's numeric Apple ID. When an OTA update requires a newer native build (`pear.json` → `updates.minver`), this enables the iOS store button. Android derives its listing from the package name.

Expo Prebuild regenerates native projects. Keep customizations in app configuration or [config plugins](https://docs.expo.dev/workflow/continuous-native-generation/).
