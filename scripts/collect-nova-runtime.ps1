<#
Collects a read-only Nova runtime snapshot over SSH.

Example:
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\collect-nova-runtime.ps1 `
    -SshTarget root@<server-ip> `
    -IdentityFile "$env:USERPROFILE\.ssh\amotoken_nova_deploy" `
    -OutputPath "output\nova-runtime-$(Get-Date -Format yyyyMMdd-HHmmss).md"

The script does not write to the server, restart containers, clean caches, or store credentials.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$SshTarget,

  [string]$IdentityFile = $(if ($env:NOVA_SSH_KEY) { $env:NOVA_SSH_KEY } else { Join-Path $env:USERPROFILE ".ssh\amotoken_nova_deploy" }),

  [int]$LogSinceMinutes = 30,

  [string]$OutputPath = "",

  [switch]$NoLogs
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
  throw "ssh command not found. Install OpenSSH client or run this from a shell that has ssh on PATH."
}

if (-not [string]::IsNullOrWhiteSpace($IdentityFile) -and -not (Test-Path -LiteralPath $IdentityFile)) {
  throw "Identity file not found: $IdentityFile"
}

$remoteScript = @'
set -u

SINCE_MINUTES="${NOVA_LOG_SINCE_MINUTES:-30}"
SKIP_LOGS="${NOVA_SKIP_LOGS:-0}"
DATA_DIR="${NOVA_DATA_DIR:-/root/nova-image-studio/data}"

section() {
  printf '\n## %s\n' "$1"
}

echo "# Nova Runtime Snapshot"
echo "- collected_at_utc: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "- hostname: $(hostname)"
echo "- data_dir: $DATA_DIR"

section "Containers"
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
else
  echo "docker_not_found"
fi

NOVA_CONTAINER=""
NEWAPI_CONTAINER=""
if command -v docker >/dev/null 2>&1; then
  NOVA_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E '^nova-image-studio$|nova|image' | head -1 || true)"
  NEWAPI_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'new-api|newapi' | head -1 || true)"
fi
echo "nova_container=${NOVA_CONTAINER:-not_found}"
echo "newapi_container=${NEWAPI_CONTAINER:-not_found}"

section "Container Stats"
if command -v docker >/dev/null 2>&1; then
  STAT_CONTAINERS=""
  [ -n "$NOVA_CONTAINER" ] && STAT_CONTAINERS="$STAT_CONTAINERS $NOVA_CONTAINER"
  [ -n "$NEWAPI_CONTAINER" ] && STAT_CONTAINERS="$STAT_CONTAINERS $NEWAPI_CONTAINER"
  if [ -n "$STAT_CONTAINERS" ]; then
    docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}\t{{.NetIO}}\t{{.BlockIO}}' $STAT_CONTAINERS
  else
    echo "no_containers_for_stats"
  fi
else
  echo "docker_not_found"
fi

section "Ports"
if command -v ss >/dev/null 2>&1; then
  ss -ltnp 2>/dev/null | grep -E ':3000|:3001' || true
else
  echo "ss_not_found"
fi

section "Disk"
df -h / || true
if command -v docker >/dev/null 2>&1; then
  docker system df || true
fi

section "Nova Data"
if [ -d "$DATA_DIR" ]; then
  du -sh "$DATA_DIR" 2>/dev/null || true
  echo "file_count=$(find "$DATA_DIR" -type f | wc -l)"
  find "$DATA_DIR" -maxdepth 2 -type f -printf '%s %p\n' | sort -nr | head -20
else
  echo "data_dir_missing=$DATA_DIR"
fi

section "Prompt Gallery Cache"
for dir in "$DATA_DIR/prompt-gallery-images" "$DATA_DIR/prompt-gallery-cache" "$DATA_DIR/prompt-image-cache"; do
  if [ -d "$dir" ]; then
    echo "cache_dir=$dir"
    du -sh "$dir" 2>/dev/null || true
    echo "cache_file_count=$(find "$dir" -type f | wc -l)"
    find "$dir" -type f -printf '%s %p\n' | sort -nr | head -10
  fi
done

section "Task Database"
if [ -d "$DATA_DIR" ]; then
  find "$DATA_DIR" -maxdepth 1 -type f \( -name '*.db' -o -name '*.sqlite' -o -name '*.sqlite3' -o -name '*.sqlite-wal' -o -name '*.sqlite-shm' \) -printf '%s %p\n' | sort -nr
  if command -v sqlite3 >/dev/null 2>&1 && [ -f "$DATA_DIR/nova-tasks.sqlite" ]; then
    sqlite3 "$DATA_DIR/nova-tasks.sqlite" "SELECT status, COUNT(*) FROM tasks GROUP BY status ORDER BY status;" || true
  else
    echo "sqlite3_unavailable_or_task_db_missing"
  fi
fi

section "Queue"
if command -v curl >/dev/null 2>&1; then
  curl -fsS http://127.0.0.1:3001/api/nova/queue-status || true
  printf '\n'
  curl -sS -o /dev/null -w 'home_http_status=%{http_code}\n' http://127.0.0.1:3001/ || true
else
  echo "curl_not_found"
fi

section "Recent Nova Logs"
if [ "$SKIP_LOGS" = "1" ]; then
  echo "logs_skipped"
elif command -v docker >/dev/null 2>&1 && [ -n "$NOVA_CONTAINER" ]; then
  docker logs --since "${SINCE_MINUTES}m" "$NOVA_CONTAINER" 2>&1 | tail -300 || true
else
  echo "nova_container_not_found"
fi
'@

$sshArgs = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=10")
if (-not [string]::IsNullOrWhiteSpace($IdentityFile)) {
  $sshArgs = @("-i", $IdentityFile) + $sshArgs
}

$skipLogsValue = if ($NoLogs.IsPresent) { "1" } else { "0" }
$normalizedRemoteScript = $remoteScript -replace "`r`n", "`n"
$remotePayload = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($normalizedRemoteScript))
$remoteCommand = "NOVA_LOG_SINCE_MINUTES=$LogSinceMinutes NOVA_SKIP_LOGS=$skipLogsValue bash -c 'base64 --ignore-garbage -d | bash -s'"

$output = $remotePayload | & ssh @sshArgs $SshTarget $remoteCommand 2>&1
$exitCode = $LASTEXITCODE

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
  $parent = Split-Path -Parent $OutputPath
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }
  $output | Set-Content -LiteralPath $OutputPath -Encoding UTF8
}

$output

if ($exitCode -ne 0) {
  throw "ssh runtime collection failed with exit code $exitCode"
}
