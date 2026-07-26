const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { createPromptGalleryStore } = require('./prompt-gallery-store');
const { createPromptGalleryService } = require('./prompt-gallery-service');
const { normalizePromptRecord } = require('./prompt-gallery-policy');

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

function publishedRecords(count, prefix = 'published') {
  return Array.from({ length: count }, (_, index) => (
    promptRecord(prefix, `${prefix}-${index}`)
  ));
}

function hashPublished(records) {
  const normalized = records.map(normalizePromptRecord).filter(Boolean);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
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

function createFakeTimers() {
  const handles = [];
  const cleared = new Set();
  return {
    handles,
    cleared,
    timers: {
      setTimeout(callback, delay) {
        const handle = {
          callback,
          delay,
          fired: false,
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
    },
    fire(handle) {
      handle.fired = true;
      return handle.callback();
    },
    activeSchedulerHandles() {
      return handles.filter(handle => (
        !handle.fired && !cleared.has(handle) && handle.delay !== 25_000
      ));
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

test('does not let explicit initial refresh bypass rotation after a publication is committed', async (t) => {
  for (const previousCount of [950, 1000]) {
    await t.test(`${previousCount} published records`, async (subtest) => {
      const previous = publishedRecords(previousCount, `previous-${previousCount}`);
      const paths = createPaths(subtest, previous);
      const store = createPromptGalleryStore(paths.dataDir);
      const sources = Array.from({ length: 4 }, (_, index) => (
        createSource(`replacement-${previousCount}-${index}`, 250)
      ));
      store.savePublished(previous);
      const service = createService(paths, {
        sources,
        async fetchImpl(url) {
          const source = sources.find(candidate => url.includes(candidate.id));
          return response(sourceDocument(source.id, 300, 'replacement'));
        },
      });

      service.load();
      const before = service.getPublished();
      await service.refresh({ initial: true });
      const after = service.getPublished();
      const beforeHashes = new Set(before.map(record => record.contentHash));
      const afterHashes = new Set(after.map(record => record.contentHash));

      assert.ok([...afterHashes].filter(hash => !beforeHashes.has(hash)).length <= 20);
      assert.ok([...beforeHashes].filter(hash => !afterHashes.has(hash)).length <= 20);
    });
  }
});

test('does not treat a below-minimum source snapshot as persistent publication state', async (t) => {
  const bundled = publishedRecords(1000, 'minimum-bundle');
  const paths = createPaths(t, bundled);
  const sources = Array.from({ length: 4 }, (_, index) => (
    createSource(`minimum-source-${index}`, 250)
  ));
  const store = createPromptGalleryStore(paths.dataDir);
  store.saveSource(sources[0].id, [promptRecord(sources[0].id, 'collapsed')]);
  const service = createService(paths, {
    sources,
    async fetchImpl(url) {
      const source = sources.find(candidate => url.includes(candidate.id));
      return response(sourceDocument(source.id, 300, 'fresh-minimum'));
    },
  });

  service.load();
  assert.equal(service.getMeta().sources[0].status, 'pending');
  await service.refresh({ initial: true });
  const published = service.getPublished();

  assert.equal(published.length, 1000);
  assert.equal(published.every(record => record.content.includes('fresh-minimum')), true);
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
  const persisted = publishedRecords(950, 'persisted');
  const store = createPromptGalleryStore(paths.dataDir);
  store.savePublished(persisted);
  const persistedService = createService(paths, { sources: [], fetchImpl: async () => response('') });

  persistedService.load();
  assert.deepEqual(
    persistedService.getPublished(),
    persisted.map(normalizePromptRecord),
  );

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

test('loads only normalized healthy publications and rejects invalid source state and dates', (t) => {
  const bundledRecord = {
    ...promptRecord('bundle', 'safe-bundle'),
    privateField: 'must-not-leak',
  };
  const paths = createPaths(t, [
    bundledRecord,
    null,
    'not-a-record',
    { title: 'missing required fields' },
  ]);
  const source = createSource('invalid-persisted-source');
  const store = createPromptGalleryStore(paths.dataDir);
  store.savePublished(publishedRecords(949, 'too-small'));
  store.saveSource(source.id, [promptRecord(source.id, 'valid'), null]);
  store.saveManifest({
    refreshedAt: 'not-a-date',
    nextRefreshAt: 'also-not-a-date',
    sources: [{
      id: source.id,
      status: 'healthy',
      candidateCount: 2,
      lastSuccessAt: 'invalid-time',
    }],
  });
  const service = createService(paths, { sources: [source], fetchImpl: async () => response('') });

  service.load();
  const loaded = service.getPublished();
  const meta = service.getMeta();

  assert.equal(loaded.length, 1);
  assert.equal(Object.hasOwn(loaded[0], 'privateField'), false);
  assert.deepEqual(Object.keys(loaded[0]).sort(), [
    'category',
    'content',
    'contentHash',
    'contributor',
    'id',
    'images',
    'notes',
    'score',
    'source',
    'sourceUrl',
    'tags',
    'title',
    'uniqueKey',
  ]);
  assert.equal(meta.refreshedAt, null);
  assert.equal(meta.nextRefreshAt, null);
  assert.equal(meta.sources[0].status, 'pending');
  assert.equal(meta.sources[0].candidateCount, 0);
  assert.equal(meta.sources[0].lastSuccessAt, null);
});

test('does not advertise a persisted next refresh time before a scheduler is started', (t) => {
  const paths = createPaths(t, publishedRecords(1000, 'restart-bundle'));
  const store = createPromptGalleryStore(paths.dataDir);
  store.savePublished(publishedRecords(950, 'restart-persisted'));
  store.saveManifest({
    refreshedAt: '2026-07-26T03:00:00.000Z',
    nextRefreshAt: '2099-01-01T00:00:00.000Z',
    sources: [],
  });
  const service = createService(paths, { sources: [], fetchImpl: async () => response('') });

  service.load();

  assert.equal(service.getMeta().refreshedAt, '2026-07-26T03:00:00.000Z');
  assert.equal(service.getMeta().nextRefreshAt, null);
});

test('does not let a canonical legacy array bypass a new-protocol manifest marker', (t) => {
  const bundled = [promptRecord('marker-bundle', 'marker-bundle-record')];
  const paths = createPaths(t, bundled);
  const store = createPromptGalleryStore(paths.dataDir);
  store.savePublished(publishedRecords(950, 'forbidden-legacy'));
  store.saveManifest({
    publicationGeneration: '11111111-1111-4111-8111-111111111111',
    publishedHash: '0'.repeat(64),
    refreshedAt: '2026-07-26T03:00:00.000Z',
    sources: [],
  });
  const service = createService(paths, { sources: [], fetchImpl: async () => response('') });

  service.load();

  assert.equal(service.getPublished().length, 1);
  assert.equal(service.getPublished()[0].source, 'marker-bundle');
});

test('loads the manifest generation before the best-effort canonical mirror', async (t) => {
  const bundled = publishedRecords(1000, 'bundle-generation');
  const paths = createPaths(t, bundled);
  const sources = Array.from({ length: 4 }, (_, index) => createSource(`wrapper-${index}`, 250));
  const serviceOptions = {
    sources,
    async fetchImpl(url) {
      const source = sources.find(candidate => url.includes(candidate.id));
      return response(sourceDocument(source.id, 300, 'wrapper'));
    },
  };
  const service = createService(paths, serviceOptions);

  service.load();
  await service.refresh({ initial: true });
  const store = createPromptGalleryStore(paths.dataDir);
  const manifest = store.loadManifest();
  const publication = store.loadPublishedGeneration(manifest.publicationGeneration);
  const canonical = store.loadPublished();

  assert.equal(publication.version, 1);
  assert.equal(typeof publication.publicationGeneration, 'string');
  assert.ok(publication.publicationGeneration.length > 0);
  assert.match(publication.publishedHash, /^[a-f0-9]{64}$/);
  assert.equal(publication.publishedHash, hashPublished(publication.prompts));
  assert.equal(publication.prompts.length, 1000);
  assert.equal(manifest.publicationGeneration, publication.publicationGeneration);
  assert.equal(manifest.publishedHash, publication.publishedHash);
  assert.deepEqual(canonical, publication);

  const reloaded = createService(paths, serviceOptions);
  reloaded.load();
  assert.equal(reloaded.getPublished().length, 1000);
  assert.deepEqual(
    reloaded.getPublished().map(record => record.contentHash),
    publication.prompts.map(record => record.contentHash),
  );

  canonical.prompts[0].title = 'tampered canonical mirror';
  store.savePublished(canonical);
  const tamperedReload = createService(paths, serviceOptions);
  tamperedReload.load();
  assert.deepEqual(
    tamperedReload.getPublished().map(record => record.contentHash),
    publication.prompts.map(record => record.contentHash),
  );

  store.saveManifest({ ...manifest, publishedHash: '0'.repeat(64) });
  const generationMismatchReload = createService(paths, serviceOptions);
  generationMismatchReload.load();
  assert.equal(generationMismatchReload.getPublished()[0].source, 'bundle-generation');
});

test('keeps initial fill eligibility after the first publication commit attempt fails', async (t) => {
  for (const failurePoint of ['generation', 'manifest']) {
    await t.test(`${failurePoint} write failure`, async (subtest) => {
      const bundled = publishedRecords(1000, `old-${failurePoint}`);
      const paths = createPaths(subtest, bundled);
      const realStore = createPromptGalleryStore(paths.dataDir);
      const sources = Array.from({ length: 4 }, (_, index) => (
        createSource(`${failurePoint}-source-${index}`, 250)
      ));
      let shouldFail = true;
      let version = 'failed-first';
      const failingStore = {
        loadSource: id => realStore.loadSource(id),
        saveSource: (id, records) => realStore.saveSource(id, records),
        loadPublished: () => realStore.loadPublished(),
        savePublished: value => realStore.savePublished(value),
        loadPublishedGeneration: generation => realStore.loadPublishedGeneration(generation),
        savePublishedGeneration(generation, value) {
          if (shouldFail && failurePoint === 'generation') {
            throw new Error('generation write failed');
          }
          realStore.savePublishedGeneration(generation, value);
        },
        loadManifest: () => realStore.loadManifest(),
        saveManifest(value) {
          if (shouldFail && failurePoint === 'manifest') throw new Error('manifest write failed');
          realStore.saveManifest(value);
        },
      };
      const serviceOptions = {
        store: failingStore,
        sources,
        async fetchImpl(url) {
          const source = sources.find(candidate => url.includes(candidate.id));
          return response(sourceDocument(source.id, 300, version));
        },
      };
      const service = createService(paths, serviceOptions);
      service.load();
      const beforePublished = service.getPublished();
      const beforeMeta = service.getMeta();

      await assert.rejects(() => service.refresh({ initial: true }), /write failed/);

      assert.deepEqual(service.getPublished(), beforePublished);
      assert.deepEqual(service.getMeta(), beforeMeta);
      shouldFail = false;
      version = 'retry-full';
      await service.refresh({ initial: true });
      assert.equal(service.getPublished().length, 1000);
      assert.equal(
        service.getPublished().every(record => record.content.includes('retry-full')),
        true,
      );
    });
  }
});

test('recovers committed generation A when generation B is orphaned before manifest commit', async (t) => {
  const bundled = publishedRecords(1000, 'recovery-bundle');
  const paths = createPaths(t, bundled);
  const realStore = createPromptGalleryStore(paths.dataDir);
  const sources = Array.from({ length: 4 }, (_, index) => createSource(`recovery-${index}`, 250));
  let version = 'generation-a';
  const fetchImpl = async (url) => {
    const source = sources.find(candidate => url.includes(candidate.id));
    return response(sourceDocument(source.id, 300, version));
  };
  const serviceA = createService(paths, { sources, fetchImpl });
  serviceA.load();
  await serviceA.refresh({ initial: true });
  const manifestA = realStore.loadManifest();
  const hashesA = serviceA.getPublished().map(record => record.contentHash);
  let failManifest = true;
  const switchableStore = {
    loadSource: id => realStore.loadSource(id),
    saveSource: (id, records) => realStore.saveSource(id, records),
    loadPublished: () => realStore.loadPublished(),
    savePublished: value => realStore.savePublished(value),
    loadPublishedGeneration: generation => realStore.loadPublishedGeneration(generation),
    savePublishedGeneration: (generation, value) => (
      realStore.savePublishedGeneration(generation, value)
    ),
    loadManifest: () => realStore.loadManifest(),
    saveManifest(value) {
      if (failManifest) throw new Error('manifest B failed');
      realStore.saveManifest(value);
    },
  };
  const serviceB = createService(paths, { store: switchableStore, sources, fetchImpl });
  serviceB.load();
  version = 'generation-b';

  await assert.rejects(() => serviceB.refresh(), /manifest B failed/);

  assert.equal(realStore.loadManifest().publicationGeneration, manifestA.publicationGeneration);
  const afterFailure = createService(paths, { sources, fetchImpl });
  afterFailure.load();
  assert.deepEqual(afterFailure.getPublished().map(record => record.contentHash), hashesA);

  failManifest = false;
  await serviceB.refresh();
  const manifestB = realStore.loadManifest();
  assert.notEqual(manifestB.publicationGeneration, manifestA.publicationGeneration);
  const afterSuccess = createService(paths, { sources, fetchImpl });
  afterSuccess.load();
  assert.deepEqual(afterSuccess.getPublished(), serviceB.getPublished());
});

test('treats canonical published.json as a best-effort post-commit mirror', async (t) => {
  const bundled = publishedRecords(1000, 'mirror-bundle');
  const paths = createPaths(t, bundled);
  const realStore = createPromptGalleryStore(paths.dataDir);
  const sources = Array.from({ length: 4 }, (_, index) => createSource(`mirror-${index}`, 250));
  const canonicalFailingStore = {
    loadSource: id => realStore.loadSource(id),
    saveSource: (id, records) => realStore.saveSource(id, records),
    loadPublished: () => realStore.loadPublished(),
    savePublished() {
      throw new Error('canonical mirror unavailable');
    },
    loadPublishedGeneration: generation => realStore.loadPublishedGeneration(generation),
    savePublishedGeneration: (generation, value) => (
      realStore.savePublishedGeneration(generation, value)
    ),
    loadManifest: () => realStore.loadManifest(),
    saveManifest: value => realStore.saveManifest(value),
  };
  const serviceOptions = {
    sources,
    async fetchImpl(url) {
      const source = sources.find(candidate => url.includes(candidate.id));
      return response(sourceDocument(source.id, 300, 'mirror-committed'));
    },
  };
  const service = createService(paths, { ...serviceOptions, store: canonicalFailingStore });
  service.load();

  await assert.doesNotReject(() => service.refresh({ initial: true }));

  assert.equal(service.getPublished().every(record => record.content.includes('mirror-committed')), true);
  const reloaded = createService(paths, serviceOptions);
  reloaded.load();
  assert.deepEqual(reloaded.getPublished(), service.getPublished());
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
      operations.push('canonical');
      realStore.savePublished(records);
    },
    loadPublishedGeneration: generation => realStore.loadPublishedGeneration(generation),
    savePublishedGeneration(generation, publication) {
      operations.push('generation');
      realStore.savePublishedGeneration(generation, publication);
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
    'generation',
    'manifest',
    'canonical',
  ]);
});

test('aborts timed-out response bodies after headers and retains last-good', async (t) => {
  const paths = createPaths(t);
  const source = createSource('timeout-source');
  const store = createPromptGalleryStore(paths.dataDir);
  store.saveSource(source.id, [promptRecord(source.id, 'previous')]);
  let abortCount = 0;
  const service = createService(paths, {
    sources: [source],
    timeoutMs: 5,
    async fetchImpl(_url, { signal }) {
      return {
        ok: true,
        status: 200,
        text() {
          return new Promise((resolve, reject) => {
            signal.addEventListener('abort', () => {
              abortCount += 1;
              reject(signal.reason || new Error('aborted'));
            }, { once: true });
          });
        },
      };
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

test('scheduler generation prevents an old pending callback from replacing a restarted timer', async (t) => {
  const paths = createPaths(t, publishedRecords(1000, 'epoch-bundle'));
  const source = createSource('epoch-source');
  const fake = createFakeTimers();
  let releaseFetch;
  const service = createService(paths, {
    sources: [source],
    timers: fake.timers,
    fetchImpl() {
      return new Promise(resolve => {
        releaseFetch = () => resolve(response(sourceDocument(source.id, 1)));
      });
    },
  });
  service.load();
  service.start({ initialDelayMs: 100, intervalMs: 1000, retryDelayMs: 250 });
  const oldInitial = fake.activeSchedulerHandles()[0];

  const oldRun = fake.fire(oldInitial);
  await Promise.resolve();
  assert.equal(typeof releaseFetch, 'function');
  service.stop();
  service.start({ initialDelayMs: 100, intervalMs: 1000, retryDelayMs: 250 });
  const newInitial = fake.activeSchedulerHandles()[0];
  const restartedNextRefreshAt = service.getMeta().nextRefreshAt;
  assert.notEqual(newInitial, oldInitial);

  releaseFetch();
  await oldRun;

  assert.deepEqual(fake.activeSchedulerHandles(), [newInitial]);
  assert.equal(service.getMeta().nextRefreshAt, restartedNextRefreshAt);
  service.stop();
  assert.deepEqual(fake.activeSchedulerHandles(), []);
});

test('scheduler keeps the next interval when its callback joins a manual refresh in flight', async (t) => {
  const startMs = Date.parse('2026-07-26T04:00:00.000Z');
  let nowMs = startMs;
  const paths = createPaths(t, publishedRecords(1000, 'joined-bundle'));
  const source = createSource('joined-source');
  const fake = createFakeTimers();
  let releaseFetch;
  let fetchCount = 0;
  const service = createService(paths, {
    sources: [source],
    timers: fake.timers,
    now: () => new Date(nowMs),
    fetchImpl() {
      fetchCount += 1;
      return new Promise(resolve => {
        releaseFetch = () => resolve(response(sourceDocument(source.id, 1)));
      });
    },
  });
  service.load();
  service.start({ initialDelayMs: 100, intervalMs: 1000, retryDelayMs: 250 });
  const initial = fake.activeSchedulerHandles()[0];
  const manualRefresh = service.refresh();
  await Promise.resolve();
  assert.equal(typeof releaseFetch, 'function');
  nowMs += 100;

  const scheduledRefresh = fake.fire(initial);
  await Promise.resolve();
  releaseFetch();
  await Promise.all([manualRefresh, scheduledRefresh]);

  const expectedNext = new Date(nowMs + 1000).toISOString();
  assert.equal(fetchCount, 1);
  assert.equal(service.getMeta().nextRefreshAt, expectedNext);
  assert.equal(createPromptGalleryStore(paths.dataDir).loadManifest().nextRefreshAt, expectedNext);
  assert.equal(fake.activeSchedulerHandles()[0].delay, 1000);
  service.stop();
});

test('scheduler commits the planned absolute next time and manual refresh preserves it', async (t) => {
  const startMs = Date.parse('2026-07-26T04:00:00.000Z');
  let nowMs = startMs;
  const paths = createPaths(t, publishedRecords(1000, 'planned-bundle'));
  const source = createSource('planned-source');
  const fake = createFakeTimers();
  const service = createService(paths, {
    sources: [source],
    timers: fake.timers,
    now: () => new Date(nowMs),
    async fetchImpl() {
      nowMs += 400;
      return response(sourceDocument(source.id, 1));
    },
  });
  service.load();
  service.start({ initialDelayMs: 100, intervalMs: 1000, retryDelayMs: 250 });
  const initial = fake.activeSchedulerHandles()[0];
  nowMs += 100;
  const triggerMs = nowMs;

  await fake.fire(initial);

  const expectedNext = new Date(triggerMs + 1000).toISOString();
  const store = createPromptGalleryStore(paths.dataDir);
  assert.equal(service.getMeta().nextRefreshAt, expectedNext);
  assert.equal(store.loadManifest().nextRefreshAt, expectedNext);
  const intervalTimer = fake.activeSchedulerHandles()[0];
  assert.equal(intervalTimer.delay, 600);

  await service.refresh();

  assert.equal(service.getMeta().nextRefreshAt, expectedNext);
  assert.equal(store.loadManifest().nextRefreshAt, expectedNext);
  assert.deepEqual(fake.activeSchedulerHandles(), [intervalTimer]);
  service.stop();
});

test('scheduler uses a short retry after refresh commit failure', async (t) => {
  const startMs = Date.parse('2026-07-26T04:00:00.000Z');
  let nowMs = startMs;
  const paths = createPaths(t, publishedRecords(1000, 'retry-bundle'));
  const source = createSource('retry-source');
  const fake = createFakeTimers();
  const realStore = createPromptGalleryStore(paths.dataDir);
  const failingStore = {
    loadSource: id => realStore.loadSource(id),
    saveSource: (id, records) => realStore.saveSource(id, records),
    loadPublished: () => realStore.loadPublished(),
    savePublished: value => realStore.savePublished(value),
    loadPublishedGeneration: generation => realStore.loadPublishedGeneration(generation),
    savePublishedGeneration: (generation, value) => (
      realStore.savePublishedGeneration(generation, value)
    ),
    loadManifest: () => realStore.loadManifest(),
    saveManifest() {
      throw new Error('manifest unavailable');
    },
  };
  const service = createService(paths, {
    store: failingStore,
    sources: [source],
    timers: fake.timers,
    now: () => new Date(nowMs),
    fetchImpl: async () => response(sourceDocument(source.id, 1)),
  });
  service.load();
  service.start({ initialDelayMs: 100, intervalMs: 1000, retryDelayMs: 250 });
  const initial = fake.activeSchedulerHandles()[0];
  nowMs += 100;

  await fake.fire(initial);

  const retryTimer = fake.activeSchedulerHandles()[0];
  assert.equal(retryTimer.delay, 250);
  assert.equal(
    service.getMeta().nextRefreshAt,
    new Date(nowMs + 250).toISOString(),
  );
  service.stop();
  assert.deepEqual(fake.activeSchedulerHandles(), []);
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
