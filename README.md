# pear-snake-ci-build

Builds, artifacts, signing, Pear staging, and mobile store publishing for [snake](https://github.com/holepunchto/snake) and [snake-mobile](https://github.com/holepunchto/snake-mobile).

## Workflows

| Workflow                | Purpose                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| **Build Snake Desktop** | Linux AppImage, signed macOS DMG/app ZIP, and signed Windows MSIX; optional Pear staging |
| **Build Snake Mobile**  | Native iOS/Android builds, Pear updates, and store publishing                            |
| **CodeQL**              | JavaScript/TypeScript security reports for both apps                                     |
| **E2E Snake Desktop**   | Test packaged apps with two players                                                      |
| **E2E Snake Mobile**    | Build and test iOS Simulator and Android emulator apps                                   |

Start builds from **Actions**. Source refs default to `main`; each build resolves its ref once so every platform uses the same commit. Staging and publishing are opt-in.

Desktop supports Linux and macOS x64/arm64, plus Windows x64. Select the platforms to build; all default to off. See [desktop signing](DESKTOP_SIGNING.md) for macOS credentials and the required `windows-signer` runner.

See [releasing mobile](RELEASING.md) for the `native`, `updates`, and `publish` modes, credentials, and automatic build numbering. Mobile app identifiers come from `app.json`. Artifacts are retained for 14 days.

## Repository setup

Keep secrets and variables in this repository or its `release` environment. Source repositories must be public.

### Pear staging

Each app uses its own primary key and snapshot:

| App     | Secret                     | Snapshot                        | Default namespace           |
| ------- | -------------------------- | ------------------------------- | --------------------------- |
| Desktop | `PEAR_DESKTOP_PRIMARY_KEY` | `ci/snake-snapshot.json`        | `snake-<channel>-v1`        |
| Mobile  | `PEAR_MOBILE_PRIMARY_KEY`  | `ci/snake-mobile-snapshot.json` | `snake-mobile-<channel>-v1` |

Primary keys are 64-character hex Corestore identities. `channel` is `dev`, `stage`, or `production`. Optional `PEAR_DESKTOP_NAMESPACE` / `PEAR_MOBILE_NAMESPACE` variables replace the entire corresponding namespace.

Create a primary key for each app and choose its namespace before the first release. Keep both stable for subsequent updates. Builds require a valid `package.json` `upgrade` link or explicit `upgrade-key` override. Packages and update bundles use that same link; staging rejects an identity that derives a different link.

Enable `run-stage` to stage after every selected build succeeds. Mobile `updates` mode can stage independently; its `snake-mobile-stage` artifact contains `stage.tar.gz` and source metadata in `source.json`. `stage-dry-run` previews changes without publishing or updating a snapshot.

Both snapshot files start as `[]` and must exist on `main` before the first stage. Subsequent snapshot writes are serialized and committed there. If direct push fails, staging opens a snapshot PR; merge it before staging that app again. The local staging action calls the `pear-ci` package directly, which accepts separate snapshot paths. The shared GitHub action currently fixes the path to `ci/snapshot.json`.

Snapshot writes use the automatic `GITHUB_TOKEN` with Contents write and Pull requests write permissions. Enable **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests** so staging can open snapshot PRs when `main` is protected.

## Checks

- **CodeQL** runs weekly or manually. Download SARIF reports and source metadata from its artifacts; findings are not uploaded to the source repositories' Security tabs.
- **Desktop E2E** runs after successful desktop builds on `main`, or manually with a completed build's `run-id`. It tests the extracted app's create, steer, join, and leave flow using real multiplayer connections; it does not test installer registration.
- **Mobile E2E** runs manually against a selected ref. It builds simulator/emulator apps without release secrets and tests create, copy topic, leave, and join with Maestro. Both E2E workflows upload diagnostics.

Validate workflows locally with:

```sh
actionlint -config-file .github/actionlint.yaml .github/workflows/*.yml
```
