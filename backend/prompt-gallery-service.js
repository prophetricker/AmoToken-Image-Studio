const fs = require('node:fs');
const { createHash, randomUUID } = require('node:crypto');

const { parseSourceDocuments } = require('./prompt-gallery-parsers');
const {
  normalizePromptRecord,
  prepareCandidates,
  rotatePublished,
  selectPublishedCandidates,
} = require('./prompt-gallery-policy');
const { createPromptGalleryStore } = require('./prompt-gallery-store');

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_INITIAL_DELAY_MS = 60_000;
const DEFAULT_INTERVAL_MS = 72 * 60 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 5 * 60 * 1000;
const MINIMUM_PUBLISHED_COUNT = 950;
const PUBLIC_SOURCE_STATUSES = new Set(['healthy', 'stale', 'failed', 'pending']);

class PromptGalleryRefreshError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizePublishedRecords(value) {
  if (!Array.isArray(value)) return null;
  return value.map(normalizePromptRecord).filter(Boolean);
}

function normalizeSourceSnapshot(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const normalized = value.map(normalizePromptRecord);
  return normalized.every(Boolean) ? normalized : null;
}

function createPublishedHash(records) {
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

function isCommittedPublication(publication, manifest, normalizedRecords) {
  if (!publication || typeof publication !== 'object' || Array.isArray(publication)) return false;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return false;
  if (publication.version !== 1) return false;
  if (typeof publication.publicationGeneration !== 'string'
    || !publication.publicationGeneration) return false;
  if (!/^[a-f0-9]{64}$/.test(publication.publishedHash || '')) return false;
  if (normalizedRecords.length < MINIMUM_PUBLISHED_COUNT) return false;
  if (manifest.publicationGeneration !== publication.publicationGeneration) return false;
  if (manifest.publishedHash !== publication.publishedHash) return false;
  return createPublishedHash(normalizedRecords) === publication.publishedHash;
}

function createPromptGalleryService(options) {
  const {
    dataDir,
    bundledSnapshotPath,
    blacklistPath,
    sources: configuredSources = [],
    fetchImpl = globalThis.fetch,
    logger = console,
    now = () => new Date(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    store = createPromptGalleryStore(dataDir),
    timers = { setTimeout, clearTimeout },
  } = options || {};
  const sources = configuredSources.filter(source => source?.enabled !== false);
  let sourceSnapshots = new Map();
  let sourceStates = new Map();
  let published = [];
  let refreshedAt = null;
  let nextRefreshAt = null;
  let loaded = false;
  let hasPersistentSourceState = false;
  let refreshPromise = null;
  let schedulerTimer = null;
  let schedulerRunning = false;
  let schedulerIntervalMs = DEFAULT_INTERVAL_MS;
  let schedulerRetryDelayMs = DEFAULT_RETRY_DELAY_MS;
  let schedulerGeneration = 0;

  function currentDate() {
    const value = now();
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  function currentTime() {
    return currentDate().toISOString();
  }

  function safeWarn(message, details) {
    try {
      logger?.warn?.(message, details);
    } catch {
      // Logging must not change refresh behavior.
    }
  }

  function sourceMetadata(source, state = {}) {
    return {
      id: source.id,
      label: source.label,
      sourceUrl: source.sourceUrl,
      license: source.license,
      status: PUBLIC_SOURCE_STATUSES.has(state.status) ? state.status : 'pending',
      candidateCount: Number.isFinite(state.candidateCount) ? state.candidateCount : 0,
      lastSuccessAt: normalizeTimestamp(state.lastSuccessAt),
    };
  }

  function loadPublication(rawPublication, rawManifest, bundled) {
    const bundledRecords = normalizePublishedRecords(
      Array.isArray(bundled) ? bundled : bundled?.prompts,
    ) || [];
    if (Array.isArray(rawPublication)) {
      const legacyRecords = normalizePublishedRecords(rawPublication) || [];
      if (legacyRecords.length >= MINIMUM_PUBLISHED_COUNT) {
        return {
          records: legacyRecords,
          generation: null,
          hash: createPublishedHash(legacyRecords),
          manifest: rawManifest && typeof rawManifest === 'object' ? rawManifest : null,
        };
      }
    } else {
      const wrapperRecords = normalizePublishedRecords(rawPublication?.prompts) || [];
      if (isCommittedPublication(rawPublication, rawManifest, wrapperRecords)) {
        return {
          records: wrapperRecords,
          generation: rawPublication.publicationGeneration,
          hash: rawPublication.publishedHash,
          manifest: rawManifest,
        };
      }
    }
    return {
      records: bundledRecords,
      generation: null,
      hash: createPublishedHash(bundledRecords),
      manifest: null,
    };
  }

  function load() {
    const rawManifest = store.loadManifest();
    const rawPublication = store.loadPublished();
    const bundled = readJsonFile(bundledSnapshotPath);
    const loadedPublication = loadPublication(rawPublication, rawManifest, bundled);
    const trustedManifest = loadedPublication.manifest;
    const manifestSources = new Map(
      asArray(trustedManifest?.sources).map(source => [source?.id, source]),
    );

    published = loadedPublication.records;
    refreshedAt = normalizeTimestamp(trustedManifest?.refreshedAt);
    nextRefreshAt = null;
    sourceSnapshots = new Map();
    sourceStates = new Map();
    hasPersistentSourceState = false;

    for (const source of sources) {
      const snapshot = normalizeSourceSnapshot(store.loadSource(source.id));
      const persistedState = manifestSources.get(source.id) || {};
      if (snapshot) {
        sourceSnapshots.set(source.id, snapshot);
        hasPersistentSourceState = true;
      }
      sourceStates.set(source.id, {
        status: snapshot && PUBLIC_SOURCE_STATUSES.has(persistedState.status)
          ? persistedState.status
          : (snapshot ? 'stale' : 'pending'),
        candidateCount: snapshot ? snapshot.length : 0,
        lastSuccessAt: snapshot ? normalizeTimestamp(persistedState.lastSuccessAt) : null,
        failureCode: snapshot && typeof persistedState.failureCode === 'string'
          ? persistedState.failureCode
          : null,
      });
    }
    loaded = true;
    return getPublished();
  }

  async function fetchAttempt(url) {
    const controller = new AbortController();
    const timeout = timers.setTimeout(() => {
      controller.abort(new Error('Prompt gallery request timed out'));
    }, timeoutMs);
    timeout?.unref?.();
    try {
      const result = await fetchImpl(url, { signal: controller.signal });
      if (!result?.ok) throw new Error(`HTTP ${result?.status || 0}`);
      const body = await result.text();
      if (typeof body !== 'string') throw new Error('Response body is not text');
      return body;
    } finally {
      timers.clearTimeout(timeout);
    }
  }

  async function fetchDocument(document) {
    const urls = [...new Set([document?.directUrl, document?.proxyUrl].filter(Boolean))];
    for (const url of urls) {
      try {
        return await fetchAttempt(url);
      } catch {
        // Try the declared fallback URL.
      }
    }
    throw new PromptGalleryRefreshError('fetch_failed');
  }

  async function refreshSource(source, refreshTime, stagedSnapshots, stagedStates) {
    const previous = stagedSnapshots.get(source.id);
    const previousState = stagedStates.get(source.id) || {};
    try {
      const documents = [];
      for (const document of asArray(source.documents)) {
        documents.push({
          name: document.name,
          content: await fetchDocument(document),
        });
      }

      let candidates;
      try {
        candidates = parseSourceDocuments(source, documents);
      } catch {
        throw new PromptGalleryRefreshError('parse_error');
      }
      if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new PromptGalleryRefreshError('empty');
      }
      if (candidates.length < Math.max(0, Number(source.minimumCount) || 0)) {
        throw new PromptGalleryRefreshError('count_collapse');
      }

      try {
        store.saveSource(source.id, candidates);
      } catch {
        throw new PromptGalleryRefreshError('persist_failed');
      }
      stagedSnapshots.set(source.id, candidates);
      stagedStates.set(source.id, {
        status: 'healthy',
        candidateCount: candidates.length,
        lastSuccessAt: refreshTime,
        failureCode: null,
      });
    } catch (error) {
      const failureCode = error instanceof PromptGalleryRefreshError
        ? error.code
        : 'refresh_failed';
      stagedStates.set(source.id, {
        status: Array.isArray(previous) ? 'stale' : 'failed',
        candidateCount: Array.isArray(previous) ? previous.length : 0,
        lastSuccessAt: previousState.lastSuccessAt || null,
        failureCode,
      });
      safeWarn('Prompt gallery source refresh failed', {
        sourceId: source.id,
        code: failureCode,
      });
    }
  }

  async function refreshSources(refreshTime, stagedSnapshots, stagedStates) {
    let cursor = 0;
    async function worker() {
      while (cursor < sources.length) {
        const source = sources[cursor];
        cursor += 1;
        await refreshSource(source, refreshTime, stagedSnapshots, stagedStates);
      }
    }
    const workerCount = Math.min(2, sources.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  function loadBlacklist() {
    const blacklist = readJsonFile(blacklistPath);
    return Array.isArray(blacklist) || Array.isArray(blacklist?.keywords) ? blacklist : [];
  }

  function cloneStateMap(value) {
    return new Map([...value].map(([key, state]) => [key, { ...state }]));
  }

  function resolveRefreshNext(refreshOptions) {
    const isCurrentScheduledRefresh = schedulerRunning
      && refreshOptions.schedulerGeneration === schedulerGeneration;
    if (!isCurrentScheduledRefresh) return nextRefreshAt;
    const planned = normalizeTimestamp(refreshOptions.plannedNextRefreshAt);
    const nowMs = currentDate().getTime();
    if (planned && Date.parse(planned) > nowMs) return planned;
    return new Date(nowMs + schedulerIntervalMs).toISOString();
  }

  function createManifest({
    records,
    generation,
    hash,
    refreshTime,
    stagedNextRefreshAt,
    stagedStates,
  }) {
    return {
      version: 1,
      publicationGeneration: generation,
      publishedHash: hash,
      publishedCount: records.length,
      refreshedAt: refreshTime,
      nextRefreshAt: stagedNextRefreshAt,
      sources: sources.map((source) => {
        const state = stagedStates.get(source.id) || {};
        return {
          ...sourceMetadata(source, state),
          failureCode: state.failureCode || null,
        };
      }),
    };
  }

  async function performRefresh(refreshOptions = {}) {
    if (!loaded) load();
    const initialFill = !hasPersistentSourceState;
    const refreshTime = currentTime();
    const stagedSnapshots = new Map(sourceSnapshots);
    const stagedStates = cloneStateMap(sourceStates);
    await refreshSources(refreshTime, stagedSnapshots, stagedStates);

    // Source snapshots are independently durable even if publication commit fails.
    sourceSnapshots = stagedSnapshots;
    hasPersistentSourceState = sources.some(source => stagedSnapshots.has(source.id));

    const merged = sources.flatMap(source => asArray(stagedSnapshots.get(source.id)));
    const blacklist = loadBlacklist();
    const prepared = prepareCandidates(merged, { blacklist });
    const desired = selectPublishedCandidates(prepared, {
      blacklist,
      targetCount: 1000,
      minimumCount: MINIMUM_PUBLISHED_COUNT,
      sourceCap: 400,
      categoryCap: 250,
    });
    const nextPublished = initialFill
      ? (desired.length >= MINIMUM_PUBLISHED_COUNT ? desired : published)
      : rotatePublished(published, desired, {
        blacklist,
        targetCount: 1000,
        minimumCount: MINIMUM_PUBLISHED_COUNT,
        maxChanges: 20,
      });
    const normalizedNext = normalizePublishedRecords(nextPublished) || [];
    const nextGeneration = randomUUID();
    const nextHash = createPublishedHash(normalizedNext);
    const stagedNextRefreshAt = resolveRefreshNext(refreshOptions);
    const publication = {
      version: 1,
      publicationGeneration: nextGeneration,
      publishedHash: nextHash,
      prompts: normalizedNext,
    };
    const manifest = createManifest({
      records: normalizedNext,
      generation: nextGeneration,
      hash: nextHash,
      refreshTime,
      stagedNextRefreshAt,
      stagedStates,
    });

    store.savePublished(publication);
    store.saveManifest(manifest);

    published = normalizedNext;
    refreshedAt = refreshTime;
    nextRefreshAt = stagedNextRefreshAt;
    sourceStates = stagedStates;
    return getMeta();
  }

  function refresh(refreshOptions = {}) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = performRefresh(refreshOptions).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  function scheduleAt(targetTime, epoch) {
    if (!schedulerRunning || epoch !== schedulerGeneration) return null;
    const nowMs = currentDate().getTime();
    let targetMs = Date.parse(targetTime);
    if (!Number.isFinite(targetMs) || targetMs <= nowMs) targetMs = nowMs + 1;
    nextRefreshAt = new Date(targetMs).toISOString();
    const delayMs = targetMs - nowMs;
    let handle;
    handle = timers.setTimeout(async () => {
      if (!schedulerRunning || epoch !== schedulerGeneration) return;
      if (schedulerTimer === handle) schedulerTimer = null;
      const plannedNextRefreshAt = new Date(
        currentDate().getTime() + schedulerIntervalMs,
      ).toISOString();
      nextRefreshAt = plannedNextRefreshAt;
      let succeeded = false;
      try {
        await refresh({
          schedulerGeneration: epoch,
          plannedNextRefreshAt,
        });
        succeeded = true;
      } catch {
        safeWarn('Prompt gallery scheduled refresh failed', { code: 'refresh_failed' });
      }
      if (!schedulerRunning || epoch !== schedulerGeneration) return;
      const nextTime = succeeded
        ? nextRefreshAt
        : new Date(currentDate().getTime() + schedulerRetryDelayMs).toISOString();
      scheduleAt(nextTime, epoch);
    }, delayMs);
    schedulerTimer = handle;
    handle?.unref?.();
    return handle;
  }

  function clearSchedulerTimer() {
    if (!schedulerTimer) return;
    timers.clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  function start(startOptions = {}) {
    schedulerGeneration += 1;
    clearSchedulerTimer();
    schedulerRunning = true;
    schedulerIntervalMs = Math.max(1, startOptions.intervalMs ?? DEFAULT_INTERVAL_MS);
    schedulerRetryDelayMs = Math.max(
      1,
      startOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
    );
    const initialDelayMs = Math.max(
      1,
      startOptions.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS,
    );
    scheduleAt(
      new Date(currentDate().getTime() + initialDelayMs).toISOString(),
      schedulerGeneration,
    );
  }

  function stop() {
    schedulerGeneration += 1;
    schedulerRunning = false;
    clearSchedulerTimer();
    nextRefreshAt = null;
  }

  function getPublished() {
    return cloneJson(published);
  }

  function getMeta() {
    return cloneJson({
      publishedCount: published.length,
      refreshedAt,
      nextRefreshAt,
      sources: sources.map(source => sourceMetadata(source, sourceStates.get(source.id))),
    });
  }

  return {
    load,
    refresh,
    start,
    stop,
    getPublished,
    getMeta,
  };
}

module.exports = { createPromptGalleryService };
