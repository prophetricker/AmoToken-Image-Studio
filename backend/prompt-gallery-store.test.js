const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPromptGalleryStore } = require('./prompt-gallery-store');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gallery-'));
}

function findTemporaryJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true })
    .filter(name => String(name).endsWith('.tmp'));
}

test('atomically saves and loads a source snapshot without temporary files', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createPromptGalleryStore(dataDir);
  const records = [{ uniqueKey: 'a', title: '测试' }];

  store.saveSource('source-a', records);

  assert.deepEqual(store.loadSource('source-a'), records);
  assert.equal(findTemporaryJsonFiles(dataDir).length, 0);
});

test('returns null for malformed JSON instead of exposing partial state', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const sourceDir = path.join(dataDir, 'sources');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, 'source-a.json'), '{broken', 'utf8');
  const store = createPromptGalleryStore(dataDir);

  assert.equal(store.loadSource('source-a'), null);
});

test('keeps source, published, and manifest snapshots at separate paths', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createPromptGalleryStore(dataDir);
  const source = [{ uniqueKey: 'source' }];
  const published = [{ uniqueKey: 'published' }];
  const manifest = { refreshedAt: '2026-07-26T00:00:00.000Z' };

  store.saveSource('source-a', source);
  store.savePublished(published);
  store.saveManifest(manifest);

  assert.deepEqual(store.loadSource('source-a'), source);
  assert.deepEqual(store.loadPublished(), published);
  assert.deepEqual(store.loadManifest(), manifest);
  assert.ok(fs.existsSync(path.join(dataDir, 'sources', 'source-a.json')));
  assert.ok(fs.existsSync(path.join(dataDir, 'published.json')));
  assert.ok(fs.existsSync(path.join(dataDir, 'manifest.json')));
});

test('failed final replacement preserves the previous target and cleans the temporary file', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const healthyStore = createPromptGalleryStore(dataDir);
  const previous = [{ uniqueKey: 'previous' }];
  healthyStore.savePublished(previous);
  const failingFs = {
    ...fs,
    renameSync() {
      throw new Error('simulated rename failure');
    },
  };
  const failingStore = createPromptGalleryStore(dataDir, { fsImpl: failingFs });

  assert.throws(
    () => failingStore.savePublished([{ uniqueKey: 'replacement' }]),
    /simulated rename failure/,
  );
  assert.deepEqual(healthyStore.loadPublished(), previous);
  assert.equal(findTemporaryJsonFiles(dataDir).length, 0);
});

test('rejects source ids that could escape the data directory', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createPromptGalleryStore(dataDir);

  for (const sourceId of ['../escape', '..\\escape', 'nested/source', '', '.']) {
    assert.throws(() => store.saveSource(sourceId, []), /source id/i, sourceId);
    assert.throws(() => store.loadSource(sourceId), /source id/i, sourceId);
  }
});

test('fsyncs and closes the parent directory after rename on non-Windows platforms', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const directoryDescriptors = new Set();
  let directoryFsyncCount = 0;
  let directoryCloseCount = 0;
  const fsImpl = {
    ...fs,
    openSync(targetPath, flags, mode) {
      if (path.resolve(targetPath) === path.resolve(dataDir)) {
        const descriptor = 987_654;
        directoryDescriptors.add(descriptor);
        return descriptor;
      }
      return fs.openSync(targetPath, flags, mode);
    },
    fsyncSync(descriptor) {
      if (directoryDescriptors.has(descriptor)) {
        directoryFsyncCount += 1;
        return;
      }
      return fs.fsyncSync(descriptor);
    },
    closeSync(descriptor) {
      if (directoryDescriptors.has(descriptor)) {
        directoryCloseCount += 1;
        return;
      }
      return fs.closeSync(descriptor);
    },
  };
  const store = createPromptGalleryStore(dataDir, { fsImpl, platform: 'linux' });

  store.savePublished([{ uniqueKey: 'durable' }]);

  assert.equal(directoryFsyncCount, 1);
  assert.equal(directoryCloseCount, 1);
});
