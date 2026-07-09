<#
Runs focused checks for collect-nova-runtime.ps1 without connecting to a server.

The test extracts the embedded remote bash script and executes it against a
temporary fixture. It only verifies behavior that can be tested locally.
#>

param(
  [string]$CollectorPath = (Join-Path $PSScriptRoot "collect-nova-runtime.ps1")
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command bash -ErrorAction SilentlyContinue)) {
  throw "bash command not found. This test needs WSL or another bash runtime."
}

$scriptText = Get-Content -Raw -LiteralPath $CollectorPath
$match = [regex]::Match($scriptText, "(?s)\`$remoteScript = @'\r?\n(.*?)\r?\n'@")
if (-not $match.Success) {
  throw "Unable to extract embedded remote script from $CollectorPath"
}

$remoteScript = $match.Groups[1].Value -replace "`r`n", "`n"
$remotePayload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

$harness = @"
set -euo pipefail

fixture_dir=`"`$(mktemp -d)`"
remote_script=`"`$fixture_dir/collect-nova-runtime-remote.sh`"
output_file=`"`$fixture_dir/output.txt`"
stub_bin=`"`$fixture_dir/bin`"
trap 'rm -rf `$fixture_dir' EXIT
mkdir -p "`$stub_bin"

printf '%s\n' '#!/usr/bin/env bash' 'if [[ " `$* " == *" -w "* ]]; then' "  printf 'home_http_status=000\n'" 'fi' 'exit 0' > "`$stub_bin/curl"
chmod +x "`$stub_bin/curl"

export PATH="`$stub_bin:`$PATH"

printf '%s' '$remotePayload' | base64 -d > "`$remote_script"

data_dir=`"`$fixture_dir/data`"
mkdir -p "`$data_dir/prompt-gallery-images" "`$data_dir/prompt-gallery-cache" "`$data_dir/prompt-image-cache"

dd if=/dev/zero of="`$data_dir/prompt-gallery-images/a.bin" bs=1048576 count=2 status=none
dd if=/dev/zero of="`$data_dir/prompt-gallery-cache/b.bin" bs=1048576 count=2 status=none
dd if=/dev/zero of="`$data_dir/prompt-image-cache/c.bin" bs=1048576 count=2 status=none

env NOVA_DATA_DIR="`$data_dir" NOVA_SKIP_LOGS=1 NOVA_WARN_DISK_USED_PERCENT=999 NOVA_WARN_DISK_AVAILABLE_GB=0 NOVA_WARN_BUILD_CACHE_RECLAIMABLE_GB=999 NOVA_WARN_PROMPT_CACHE_MB=5 bash "`$remote_script" > "`$output_file"

cat "`$output_file"

if ! grep -q 'runtime_warning=prompt_gallery_cache value=' "`$output_file"; then
  echo 'Expected prompt gallery cache warning when cache directories exceed threshold in aggregate.' >&2
  exit 1
fi

if grep -q 'runtime_warning=none' "`$output_file"; then
  echo 'Did not expect runtime_warning=none when prompt gallery cache warning is present.' >&2
  exit 1
fi
"@

$normalizedHarness = $harness -replace "`r`n", "`n"
$harnessPayload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($normalizedHarness))
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$syntaxCheckOutput = & bash -lc "printf '%s' '$harnessPayload' | base64 -d | bash -n" 2>&1
$syntaxCheckExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($syntaxCheckExitCode -ne 0) {
  $numberedHarness = ($normalizedHarness -split "`n") | ForEach-Object -Begin { $line = 1 } -Process {
    "{0,3}: {1}" -f $line, $_
    $line += 1
  }
  $numberedHarness
  $syntaxCheckOutput
  throw "collect-nova-runtime test harness has invalid bash syntax"
}

$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$testOutput = & bash -lc "printf '%s' '$harnessPayload' | base64 -d | bash -s" 2>&1
$testExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
$testOutput
if ($testExitCode -ne 0) {
  throw "collect-nova-runtime local tests failed with exit code $testExitCode"
}

"collect-nova-runtime local tests passed"
