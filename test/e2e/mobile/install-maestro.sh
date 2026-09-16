#!/usr/bin/env bash
set -euo pipefail

directory="$RUNNER_TEMP/snake-maestro"
mkdir -p "$directory"
curl --fail --location --retry 3 \
  https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.10.0/maestro.zip \
  --output "$directory/maestro.zip"
printf '%s  %s\n' \
  29b675e10cc12080e445e9bfb2e2b4e4dfb9c0f2e30d5884120d258b5e1cd991 \
  "$directory/maestro.zip" | shasum -a 256 --check
unzip -q "$directory/maestro.zip" -d "$directory"
echo "$directory/maestro/bin" >> "$GITHUB_PATH"
"$directory/maestro/bin/maestro" --version
