const fs = require('node:fs');

const { parseSourceDocuments } = require('./prompt-gallery-parsers');
const {
  prepareCandidates,
  rotatePublished,
  selectPublishedCandidates,
} = require('./prompt-gallery-policy');
const { createPromptGalleryStore } = require('./prompt-gallery-store');

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_INITIAL_DELAY_MS = 60_000;
const DEFAULT_INTERVAL_MS = 72 * 60 * 60 * 1000;
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

function asIsoTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
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
  const sourceSnapshots = new Map();
  const sourceStates = new Map();
  let published = [];
  let refreshedAt = null;
  let nextRefreshAt = null;
  let loaded = false;
  let hasPersistentSourceState = false;
  let refreshPromise = null;
  let schedulerTimer = null;
  let schedulerRunning = false;
  let schedulerIntervalMs = DEFAULT_INTERVAL_MS;

  function currentTime() {
    return asIsoTime(now());
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
      lastSuccessAt: typeof state.lastSuccessAt === 'string' ? state.lastSuccessAt : null,
    };
  }

  function load() {
    const persistedPublished = store.loadPublished();
    const bundled = readJsonFile(bundledSnapshotPath);
    published = Array.isArray(persistedPublished)
      ? persistedPublished
      : asArray(Array.isArray(bundled) ? bundled : bundled?.prompts);

    const manifest = store.loadManifest();
    const manifestSources = new Map(
      asArray(manifest?.sources).map(source => [source?.id, source]),
    );
    refreshedAt = typeof manifest?.refreshedAt === 'string' ? manifest.refreshedAt : null;
    nextRefreshAt = typeof manifest?.nextRefreshAt === 'string' ? manifest.nextRefreshAt : null;
    hasPersistentSourceState = false;
    sourceSnapshots.clear();
    sourceStates.clear();

    for (const source of sources) {
      const snapshot = store.loadSource(source.id);
      const persistedState = manifestSources.get(source.id) || {};
      if (Array.isArray(snapshot)) {
        sourceSnapshots.set(source.id, snapshot);
        hasPersistentSourceState = true;
      }
      sourceStates.set(source.id, {
        status: PUBLIC_SOURCE_STATUSES.has(persistedState.status)
          ? persistedState.status
          : (Array.isArray(snapshot) ? 'stale' : 'pending'),
        candidateCount: Array.isArray(snapshot) ? snapshot.length : 0,
        lastSuccessAt: typeof persistedState.lastSuccessAt === 'string'
          ? persistedState.lastSuccessAt
          : null,
        failureCode: typeof persistedState.failureCode === 'string'
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

  async function refreshSource(source, refreshTime) {
    const previous = sourceSnapshots.get(source.id);
    const previousState = sourceStates.get(source.id) || {};
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
      sourceSnapshots.set(source.id, candidates);
      sourceStates.set(source.id, {
        status: 'healthy',
        candidateCount: candidates.length,
        lastSuccessAt: refreshTime,
        failureCode: null,
      });
      return;
    } catch (error) {
      const failureCode = error instanceof PromptGalleryRefreshError
        ? error.code
        : 'refresh_failed';
      sourceStates.set(source.id, {
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

  async function refreshSources(refreshTime) {
    let cursor = 0;
    async function worker() {
      while (cursor < sources.length) {
        const source = sources[cursor];
        cursor += 1;
        await refreshSource(source, refreshTime);
      }
    }
    const workerCount = Math.min(2, sources.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  function loadBlacklist() {
    const blacklist = readJsonFile(blacklistPath);
    return Array.isArray(blacklist) || Array.isArray(blacklist?.keywords) ? blacklist : [];
  }

  function createManifest(refreshTime) {
    return {
      version: 1,
      publishedCount: published.length,
      refreshedAt: refreshTime,
      nextRefreshAt,
      sources: sources.map((source) => {
        const state = sourceStates.get(source.id) || {};
        return {
          ...sourceMetadata(source, state),
          failureCode: state.failureCode || null,
        };
      }),
    };
  }

  async function performRefresh(refreshOptions = {}) {
    if (!loaded) load();
    const initialFill = Boolean(refreshOptions.initial) || !hasPersistentSourceState;
    const refreshTime = currentTime();
    await refreshSources(refreshTime);

    const merged = sources.flatMap(source => asArray(sourceSnapshots.get(source.id)));
    const blacklist = loadBlacklist();
    const prepared = prepareCandidates(merged, { blacklist });
    const desired = selectPublishedCandidates(prepared, {
      blacklist,
      targetCount: 1000,
      minimumCount: 950,
      sourceCap: 400,
      categoryCap: 250,
    });
    const nextPublished = initialFill
      ? (desired.length >= 950 ? desired : published)
      : rotatePublished(published, desired, {
        blacklist,
        targetCount: 1000,
        minimumCount: 950,
        maxChanges: 20,
      });

    store.savePublished(nextPublished);
    published = nextPublished;
    refreshedAt = refreshTime;
    hasPersistentSourceState = sources.some(source => sourceSnapshots.has(source.id));
    store.saveManifest(createManifest(refreshTime));
    return getMeta();
  }

  function refresh(refreshOptions = {}) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = performRefresh(refreshOptions).finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  function schedule(delayMs) {
    nextRefreshAt = new Date(new Date(currentTime()).getTime() + delayMs).toISOString();
    schedulerTimer = timers.setTimeout(async () => {
      schedulerTimer = null;
      if (!schedulerRunning) return;
      try {
        await refresh();
      } catch {
        safeWarn('Prompt gallery scheduled refresh failed', { code: 'refresh_failed' });
      } finally {
        if (schedulerRunning) schedule(schedulerIntervalMs);
      }
    }, delayMs);
    schedulerTimer?.unref?.();
    return schedulerTimer;
  }

  function start(startOptions = {}) {
    stop();
    schedulerRunning = true;
    schedulerIntervalMs = startOptions.intervalMs ?? DEFAULT_INTERVAL_MS;
    schedule(startOptions.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS);
  }

  function stop() {
    schedulerRunning = false;
    if (schedulerTimer) {
      timers.clearTimeout(schedulerTimer);
      schedulerTimer = null;
    }
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
