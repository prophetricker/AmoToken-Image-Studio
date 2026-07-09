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

  [int]$WarnDiskUsedPercent = 85,

  [double]$WarnDiskAvailableGb = 5,

  [double]$WarnBuildCacheReclaimableGb = 12,

  [int]$WarnPromptCacheMb = 512,

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
WARN_DISK_USED_PERCENT="${NOVA_WARN_DISK_USED_PERCENT:-85}"
WARN_DISK_AVAILABLE_GB="${NOVA_WARN_DISK_AVAILABLE_GB:-5}"
WARN_BUILD_CACHE_RECLAIMABLE_GB="${NOVA_WARN_BUILD_CACHE_RECLAIMABLE_GB:-12}"
WARN_PROMPT_CACHE_MB="${NOVA_WARN_PROMPT_CACHE_MB:-512}"

section() {
  printf '\n## %s\n' "$1"
}

size_to_mb() {
  awk -v raw="$1" 'BEGIN {
    value = raw
    gsub(/[[:space:]]/, "", value)
    number = value
    unit = value
    gsub(/[A-Za-z]/, "", number)
    gsub(/[0-9.]/, "", unit)
    unit = toupper(unit)
    if (number == "") {
      print 0
    } else if (unit ~ /^T/) {
      printf "%.3f\n", number * 1024 * 1024
    } else if (unit ~ /^G/) {
      printf "%.3f\n", number * 1024
    } else if (unit ~ /^M/) {
      printf "%.3f\n", number
    } else if (unit ~ /^K/) {
      printf "%.3f\n", number / 1024
    } else {
      printf "%.6f\n", number / 1024 / 1024
    }
  }'
}

number_ge() {
  awk -v left="$1" -v right="$2" 'BEGIN { exit !(left + 0 >= right + 0) }'
}

number_le() {
  awk -v left="$1" -v right="$2" 'BEGIN { exit !(left + 0 <= right + 0) }'
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
DISK_LINE="$(df -h / | awk 'NR==2 {print}')"
DISK_USED_PERCENT="$(printf '%s\n' "$DISK_LINE" | awk '{gsub(/%/, "", $5); print $5}')"
DISK_AVAILABLE_RAW="$(printf '%s\n' "$DISK_LINE" | awk '{print $4}')"
DISK_AVAILABLE_MB="$(size_to_mb "$DISK_AVAILABLE_RAW")"
BUILD_CACHE_RECLAIMABLE_RAW=""
BUILD_CACHE_RECLAIMABLE_MB="0"
if command -v docker >/dev/null 2>&1; then
  DOCKER_SYSTEM_DF="$(docker system df || true)"
  printf '%s\n' "$DOCKER_SYSTEM_DF"
  BUILD_CACHE_RECLAIMABLE_RAW="$(printf '%s\n' "$DOCKER_SYSTEM_DF" | awk '$1 == "Build" && $2 == "Cache" { print $6; exit }')"
  if [ -n "$BUILD_CACHE_RECLAIMABLE_RAW" ]; then
    BUILD_CACHE_RECLAIMABLE_MB="$(size_to_mb "$BUILD_CACHE_RECLAIMABLE_RAW")"
  fi
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
PROMPT_CACHE_TOTAL_MB=0
for dir in "$DATA_DIR/prompt-gallery-images" "$DATA_DIR/prompt-gallery-cache" "$DATA_DIR/prompt-image-cache"; do
  if [ -d "$dir" ]; then
    echo "cache_dir=$dir"
    du -sh "$dir" 2>/dev/null || true
    PROMPT_CACHE_DIR_MB="$(find "$dir" -type f -printf '%s\n' 2>/dev/null | awk '{sum += $1} END {printf "%.3f\n", sum / 1024 / 1024}')"
    PROMPT_CACHE_TOTAL_MB="$(awk -v total="$PROMPT_CACHE_TOTAL_MB" -v current="$PROMPT_CACHE_DIR_MB" 'BEGIN { printf "%.3f\n", total + current }')"
    echo "cache_file_count=$(find "$dir" -type f | wc -l)"
    find "$dir" -type f -printf '%s %p\n' | sort -nr | head -10
  fi
done

section "Runtime Warnings"
WARNING_COUNT=0
if [ -n "$DISK_USED_PERCENT" ] && number_ge "$DISK_USED_PERCENT" "$WARN_DISK_USED_PERCENT"; then
  echo "runtime_warning=disk_used_percent value=${DISK_USED_PERCENT}% threshold=${WARN_DISK_USED_PERCENT}%"
  WARNING_COUNT=$((WARNING_COUNT + 1))
fi
WARN_DISK_AVAILABLE_MB="$(awk -v gb="$WARN_DISK_AVAILABLE_GB" 'BEGIN { printf "%.3f\n", gb * 1024 }')"
if number_le "$DISK_AVAILABLE_MB" "$WARN_DISK_AVAILABLE_MB"; then
  echo "runtime_warning=disk_available value=${DISK_AVAILABLE_RAW} threshold=${WARN_DISK_AVAILABLE_GB}GB"
  WARNING_COUNT=$((WARNING_COUNT + 1))
fi
WARN_BUILD_CACHE_RECLAIMABLE_MB="$(awk -v gb="$WARN_BUILD_CACHE_RECLAIMABLE_GB" 'BEGIN { printf "%.3f\n", gb * 1024 }')"
if number_ge "$BUILD_CACHE_RECLAIMABLE_MB" "$WARN_BUILD_CACHE_RECLAIMABLE_MB"; then
  echo "runtime_warning=build_cache_reclaimable value=${BUILD_CACHE_RECLAIMABLE_RAW:-0B} threshold=${WARN_BUILD_CACHE_RECLAIMABLE_GB}GB action=confirm_before_docker_builder_prune"
  WARNING_COUNT=$((WARNING_COUNT + 1))
fi
if number_ge "$PROMPT_CACHE_TOTAL_MB" "$WARN_PROMPT_CACHE_MB"; then
  echo "runtime_warning=prompt_gallery_cache value=${PROMPT_CACHE_TOTAL_MB}MB threshold=${WARN_PROMPT_CACHE_MB}MB"
  WARNING_COUNT=$((WARNING_COUNT + 1))
fi
if [ "$WARNING_COUNT" -eq 0 ]; then
  echo "runtime_warning=none"
fi

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
$remoteCommand = "NOVA_LOG_SINCE_MINUTES=$LogSinceMinutes NOVA_SKIP_LOGS=$skipLogsValue NOVA_WARN_DISK_USED_PERCENT=$WarnDiskUsedPercent NOVA_WARN_DISK_AVAILABLE_GB=$WarnDiskAvailableGb NOVA_WARN_BUILD_CACHE_RECLAIMABLE_GB=$WarnBuildCacheReclaimableGb NOVA_WARN_PROMPT_CACHE_MB=$WarnPromptCacheMb bash -c 'base64 --ignore-garbage -d | bash -s'"

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
