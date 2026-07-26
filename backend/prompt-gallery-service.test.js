const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPromptGalleryStore } = require('./prompt-gallery-store');
const { createPromptGalleryService } = require('./prompt-gallery-service');

const FIXED_NOW = new Date('2026-07-26T04:00:00.000Z');

function createTempDir(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gallery-service-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function createSource(id, minimumCount = 1, documentCount = 1) {
  return {
    id,
    label: `Example/${id}`,
    sourceUrl: `https://github.com/example/${id}`,
    license: 'MIT',
    parser: 'nanobanana-json',
    minimumCount,
    rawBaseUrl: `https://raw.githubusercontent.com/example/${id}/main`,
    documents: Array.from({ length: documentCount }, (_, index) => ({
      name: `document-${index}.json`,
      directUrl: `https://raw.example/${id}/${index}.json`,
      proxyUrl: `https://proxy.example/${id}/${index}.json`,
    })),
  };
}

function sourceDocument(sourceId, count, version = 'v1') {
  const categoryTerms = ['海报', '产品', '角色', 'UI 界面'];
  return JSON.stringify({
    sections: [{
      prompts: Array.from({ length: count }, (_, index) => {
        const categoryTerm = categoryTerms[index % categoryTerms.length];
        return {
          id: `${version}-${index}`,
          title: `中文${categoryTerm}提示词 ${sourceId} ${version} ${index}`,
          content: `${sourceId} ${version} ${categoryTerm} unique prompt content ${index}`,
          images: [`https://raw.githubusercontent.com/example/${sourceId}/main/${version}-${index}.png`],
        };
      }),
    }],
  });
}

function promptRecord(sourceId, id) {
  return {
    id,
    uniqueKey: id,
    title: `中文提示词 ${id}`,
    content: `stable prompt content ${id}`,
    images: [`https://raw.githubusercontent.com/example/${sourceId}/main/${id}.png`],
    tags: [],
    contributor: '',
    notes: '',
    source: sourceId,
    sourceUrl: `https://github.com/example/${sourceId}`,
    category: '其他',
  };
}

function response(body, options = {}) {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      if (options.textError) throw options.textError;
      return body;
    },
  };
}

function createPaths(t, bundled = []) {
  const root = createTempDir(t);
  const dataDir = path.join(root, 'data');
  const bundledSnapshotPath = path.join(root, 'bundled.json');
  const blacklistPath = path.join(root, 'blacklist.json');
  fs.writeFileSync(bundledSnapshotPath, JSON.stringify(bundled), 'utf8');
  fs.writeFileSync(blacklistPath, JSON.stringify({ keywords: [] }), 'utf8');
  return { root, dataDir, bundledSnapshotPath, blacklistPath };
}

function createService(paths, options) {
  return createPromptGalleryService({
    ...paths,
    logger: { info() {}, warn() {}, error() {} },
    now: () => new Date(FIXED_NOW),
    ...options,
  });
}

test('tries each document direct-first and uses proxy only after direct failure', async (t) => {
  const paths = createPaths(t);
  const source = createSource('source-a', 2);
  const calls = [];
  const service = createService(paths, {
    sources: [source],
    async fetchImpl(url) {
      calls.push(url);
      if (url === source.documents[0].directUrl) throw new Error('direct unavailable');
      return response(sourceDocument(source.id, 2));
    },
  });

  service.load();
  await service.refresh({ initial: true });

  assert.deepEqual(calls, [
    source.documents[0].directUrl,
    source.documents[0].proxyUrl,
  ]);
  assert.equal(createPromptGalleryStore(paths.dataDir).loadSource(source.id).length, 2);
  assert.equal(service.getMeta().sources[0].status, 'healthy');
});

test('keeps source last-good snapshots for every fetch and parse failure class', async (t) => {
  const cases = [
    {
      name: 'HTTP error',
      expectedCode: 'fetch_failed',
      fetchImpl: async () => response('unavailable', { status: 503 }),
    },
    {
      name: 'body read error',
      expectedCode: 'fetch_failed',
      fetchImpl: async () => response('', { textError: new Error('stream ended') }),
    },
    {
      name: 'parser error',
      expectedCode: 'parse_error',
      fetchImpl: async () => response('{not-json'),
    },
    {
      name: 'empty parse result',
      expectedCode: 'empty',
      fetchImpl: async () => response(sourceDocument('source-a', 0)),
    },
    {
      name: 'count collapse',
      expectedCode: 'count_collapse',
      fetchImpl: async () => response(sourceDocument('source-a', 1)),
    },
  ];

  for (const failureCase of cases) {
    await t.test(failureCase.name, async (subtest) => {
      const paths = createPaths(subtest);
      const source = createSource('source-a', 2);
      const previous = [promptRecord(source.id, 'previous-a'), promptRecord(source.id, 'previous-b')];
      const store = createPromptGalleryStore(paths.dataDir);
      store.saveSource(source.id, previous);
      const service = createService(paths, {
        sources: [source],
        fetchImpl: failureCase.fetchImpl,
      });

      service.load();
      await service.refresh({ initial: true });

      assert.deepEqual(store.loadSource(source.id), previous);
      assert.equal(store.loadManifest().sources[0].failureCode, failureCase.expectedCode);
      assert.equal(service.getMeta().sources[0].status, 'stale');
      assert.equal(service.getMeta().sources[0].candidateCount, previous.length);
    });
  }
});

test('fetches no more than two sources concurrently', async (t) => {
  const paths = createPaths(t);
  const sources = Array.from({ length: 6 }, (_, index) => createSource(`source-${index}`));
  let active = 0;
  let maximumActive = 0;
  const service = createService(paths, {
    sources,
    async fetchImpl(url) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 8));
      active -= 1;
      const source = sources.find(candidate => url.includes(candidate.id));
      return response(sourceDocument(source.id, 1));
    },
  });

  service.load();
  await service.refresh({ initial: true });

  assert.equal(maximumActive, 2);
});

test('publishes 1000 on the first healthy refresh and rotates at most 20 later', async (t) => {
  const paths = createPaths(t);
  const sources = Array.from({ length: 4 }, (_, index) => createSource(`source-${index}`, 250));
  let version = 'v1';
  const service = createService(paths, {
    sources,
    async fetchImpl(url) {
      const source = sources.find(candidate => url.includes(candidate.id));
      return response(sourceDocument(source.id, 300, version));
    },
  });

  service.load();
  await service.refresh({ initial: true });
  const first = service.getPublished();
  version = 'v2';
  await service.refresh();
  const second = service.getPublished();
  const firstHashes = new Set(first.map(record => record.contentHash));
  const secondHashes = new Set(second.map(record => record.contentHash));

  assert.equal(first.length, 1000);
  assert.equal(second.length, 1000);
  assert.ok([...secondHashes].filter(hash => !firstHashes.has(hash)).length <= 20);
  assert.ok([...firstHashes].filter(hash => !secondHashes.has(hash)).length <= 20);
});

test('returns only safe source metadata and refresh summary fields', async (t) => {
  const paths = createPaths(t);
  const source = createSource('source-a');
  const service = createService(paths, {
    sources: [source],
    fetchImpl: async () => response(sourceDocument(source.id, 1)),
  });

  service.load();
  await service.refresh({ initial: true });
  const meta = service.getMeta();

  assert.deepEqual(Object.keys(meta).sort(), [
    'nextRefreshAt',
    'publishedCount',
    'refreshedAt',
    'sources',
  ]);
  assert.deepEqual(Object.keys(meta.sources[0]).sort(), [
    'candidateCount',
    'id',
    'label',
    'lastSuccessAt',
    'license',
    'sourceUrl',
    'status',
  ]);
  assert.equal(meta.refreshedAt, FIXED_NOW.toISOString());
  const serialized = JSON.stringify(meta);
  assert.equal(serialized.includes(paths.dataDir), false);
  assert.equal(serialized.includes(source.documents[0].proxyUrl), false);
  assert.equal(serialized.toLowerCase().includes('stack'), false);
});

test('loads persisted publication before bundle and treats bundle-only cold start as initial fill', async (t) => {
  const bundled = Array.from({ length: 1000 }, (_, index) => promptRecord('bundle', `bundle-${index}`));
  const paths = createPaths(t, bundled);
  const persisted = [promptRecord('persisted', 'persisted-a')];
  const store = createPromptGalleryStore(paths.dataDir);
  store.savePublished(persisted);
  const persistedService = createService(paths, { sources: [], fetchImpl: async () => response('') });

  persistedService.load();
  assert.deepEqual(persistedService.getPublished(), persisted);

  const coldPaths = createPaths(t, bundled);
  const sources = Array.from({ length: 4 }, (_, index) => createSource(`fresh-${index}`, 250));
  const coldService = createService(coldPaths, {
    sources,
    async fetchImpl(url) {
      const source = sources.find(candidate => url.includes(candidate.id));
      return response(sourceDocument(source.id, 300, 'fresh'));
    },
  });
  coldService.load();
  const before = coldService.getPublished();
  await coldService.refresh();
  const after = coldService.getPublished();
  const beforeHashes = new Set(before.map(record => record.contentHash));

  assert.equal(before.length, 1000);
  assert.equal(after.length, 1000);
  assert.equal(after.filter(record => beforeHashes.has(record.contentHash)).length, 0);
});

test('persists successful source snapshots before publication and manifest', async (t) => {
  const paths = createPaths(t);
  const realStore = createPromptGalleryStore(paths.dataDir);
  const staleSource = createSource('stale-source', 1);
  const healthySource = createSource('healthy-source', 1);
  const previous = [promptRecord(staleSource.id, 'previous')];
  realStore.saveSource(staleSource.id, previous);
  const operations = [];
  const recordingStore = {
    loadSource: id => realStore.loadSource(id),
    saveSource(id, records) {
      operations.push(`source:${id}`);
      realStore.saveSource(id, records);
    },
    loadPublished: () => realStore.loadPublished(),
    savePublished(records) {
      operations.push('published');
      realStore.savePublished(records);
    },
    loadManifest: () => realStore.loadManifest(),
    saveManifest(manifest) {
      operations.push('manifest');
      realStore.saveManifest(manifest);
    },
  };
  const service = createService(paths, {
    store: recordingStore,
    sources: [staleSource, healthySource],
    async fetchImpl(url) {
      if (url.includes(staleSource.id)) return response('failed', { status: 503 });
      return response(sourceDocument(healthySource.id, 1));
    },
  });

  service.load();
  await service.refresh({ initial: true });

  assert.deepEqual(realStore.loadSource(staleSource.id), previous);
  assert.deepEqual(operations, [
    `source:${healthySource.id}`,
    'published',
    'manifest',
  ]);
});

test('aborts timed-out direct and proxy attempts and retains last-good', async (t) => {
  const paths = createPaths(t);
  const source = createSource('timeout-source');
  const store = createPromptGalleryStore(paths.dataDir);
  store.saveSource(source.id, [promptRecord(source.id, 'previous')]);
  let abortCount = 0;
  const service = createService(paths, {
    sources: [source],
    timeoutMs: 5,
    fetchImpl(_url, { signal }) {
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          abortCount += 1;
          reject(signal.reason || new Error('aborted'));
        }, { once: true });
      });
    },
  });

  service.load();
  await service.refresh({ initial: true });

  assert.equal(abortCount, 2);
  assert.equal(service.getMeta().sources[0].status, 'stale');
  assert.equal(store.loadManifest().sources[0].failureCode, 'fetch_failed');
});

test('scheduler is unrefed, repeats after completion, clears timers, and prevents refresh overlap', async (t) => {
  const paths = createPaths(t);
  const source = createSource('scheduled-source');
  const handles = [];
  const cleared = new Set();
  const timers = {
    setTimeout(callback, delay) {
      const handle = {
        callback,
        delay,
        unrefCalled: false,
        unref() {
          this.unrefCalled = true;
        },
      };
      handles.push(handle);
      return handle;
    },
    clearTimeout(handle) {
      cleared.add(handle);
    },
  };
  let releaseFetch;
  let fetchCount = 0;
  const service = createService(paths, {
    sources: [source],
    timers,
    fetchImpl() {
      fetchCount += 1;
      return new Promise(resolve => {
        releaseFetch = () => resolve(response(sourceDocument(source.id, 1)));
      });
    },
  });
  service.load();

  const firstRefresh = service.refresh({ initial: true });
  const overlappingRefresh = service.refresh({ initial: true });
  await Promise.resolve();
  assert.equal(fetchCount, 1);
  releaseFetch();
  await Promise.all([firstRefresh, overlappingRefresh]);
  assert.equal(fetchCount, 1);

  service.start({ initialDelayMs: 60_000, intervalMs: 72 * 60 * 60 * 1000 });
  const initialHandle = handles.find(handle => handle.delay === 60_000 && !cleared.has(handle));
  assert.ok(initialHandle);
  assert.equal(initialHandle.unrefCalled, true);
  const scheduledRefresh = initialHandle.callback();
  await Promise.resolve();
  releaseFetch();
  await scheduledRefresh;
  const intervalHandle = handles.find(handle => (
    handle.delay === 72 * 60 * 60 * 1000 && !cleared.has(handle)
  ));
  assert.ok(intervalHandle);
  assert.equal(intervalHandle.unrefCalled, true);
  assert.ok(handles.filter(handle => handle.delay === 25_000).every(handle => cleared.has(handle)));

  service.stop();
  assert.equal(cleared.has(intervalHandle), true);
});

test('refresh fetches only declared text documents and getters return defensive clones', async (t) => {
  const source = createSource('clone-source');
  const paths = createPaths(t, [promptRecord(source.id, 'bundled')]);
  const calls = [];
  const service = createService(paths, {
    sources: [source],
    async fetchImpl(url) {
      calls.push(url);
      return response(sourceDocument(source.id, 1));
    },
  });
  service.load();
  await service.refresh({ initial: true });

  const published = service.getPublished();
  const meta = service.getMeta();
  published[0].title = 'mutated';
  published.push(promptRecord('evil', 'extra'));
  meta.sources[0].label = 'mutated';
  meta.sources.push({ id: 'extra' });

  assert.deepEqual(calls, [source.documents[0].directUrl]);
  assert.notEqual(service.getPublished()[0].title, 'mutated');
  assert.equal(service.getPublished().length, 1);
  assert.equal(service.getMeta().sources[0].label, source.label);
  assert.equal(service.getMeta().sources.length, 1);
});
