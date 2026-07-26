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

test('stores isolated publication generations under strictly validated UUID paths', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createPromptGalleryStore(dataDir);
  const generation = '11111111-1111-4111-8111-111111111111';
  const publication = { version: 1, publicationGeneration: generation, prompts: [] };

  store.savePublishedGeneration(generation, publication);

  assert.deepEqual(store.loadPublishedGeneration(generation), publication);
  assert.ok(fs.existsSync(path.join(dataDir, 'publications', `${generation}.json`)));
  for (const invalid of [
    '../escape',
    '..\\escape',
    'nested/generation',
    'not-a-uuid',
    '11111111-1111-1111-1111-111111111111',
    '',
  ]) {
    assert.throws(() => store.savePublishedGeneration(invalid, publication), /generation/i);
    assert.throws(() => store.loadPublishedGeneration(invalid), /generation/i);
  }
});

test('lists and deletes only regular UUID publication files without following links', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createPromptGalleryStore(dataDir);
  const publicationsDir = path.join(dataDir, 'publications');
  const regularGeneration = '11111111-1111-4111-8111-111111111111';
  const directoryGeneration = '22222222-2222-4222-8222-222222222222';
  const linkedGeneration = '33333333-3333-4333-8333-333333333333';
  const linkedTarget = path.join(dataDir, 'linked-target');
  const linkedSentinel = path.join(linkedTarget, 'sentinel.txt');
  store.savePublishedGeneration(regularGeneration, { prompts: [] });
  fs.writeFileSync(path.join(publicationsDir, 'not-a-generation.json'), '{}', 'utf8');
  fs.writeFileSync(
    path.join(publicationsDir, '44444444-4444-4444-8444-444444444444.txt'),
    '{}',
    'utf8',
  );
  fs.mkdirSync(path.join(publicationsDir, `${directoryGeneration}.json`));
  fs.mkdirSync(linkedTarget);
  fs.writeFileSync(linkedSentinel, 'keep', 'utf8');
  fs.symlinkSync(
    linkedTarget,
    path.join(publicationsDir, `${linkedGeneration}.json`),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  assert.deepEqual(store.listPublishedGenerations(), [regularGeneration]);
  assert.equal(store.deletePublishedGeneration(directoryGeneration), false);
  assert.equal(store.deletePublishedGeneration(linkedGeneration), false);
  assert.equal(fs.readFileSync(linkedSentinel, 'utf8'), 'keep');
  assert.equal(store.deletePublishedGeneration(regularGeneration), true);
  assert.equal(store.deletePublishedGeneration(regularGeneration), false);
  assert.deepEqual(store.listPublishedGenerations(), []);
  assert.throws(
    () => store.deletePublishedGeneration('../escape'),
    /generation/i,
  );
});

test('returns no publication generations when their directory does not exist', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createPromptGalleryStore(dataDir);

  assert.deepEqual(store.listPublishedGenerations(), []);
});

test('best-effort fsyncs the publication directory after deleting a generation', (t) => {
  const dataDir = createTempDir();
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const publicationsDir = path.join(dataDir, 'publications');
  const generation = '11111111-1111-4111-8111-111111111111';
  const directoryDescriptor = 987_654;
  let directoryFsyncCount = 0;
  let directoryCloseCount = 0;
  const fsImpl = {
    ...fs,
    openSync(targetPath, flags, mode) {
      if (path.resolve(targetPath) === path.resolve(publicationsDir)) {
        return directoryDescriptor;
      }
      return fs.openSync(targetPath, flags, mode);
    },
    fsyncSync(descriptor) {
      if (descriptor === directoryDescriptor) {
        directoryFsyncCount += 1;
        return;
      }
      return fs.fsyncSync(descriptor);
    },
    closeSync(descriptor) {
      if (descriptor === directoryDescriptor) {
        directoryCloseCount += 1;
        return;
      }
      return fs.closeSync(descriptor);
    },
  };
  const store = createPromptGalleryStore(dataDir, { fsImpl, platform: 'linux' });
  store.savePublishedGeneration(generation, { prompts: [] });
  directoryFsyncCount = 0;
  directoryCloseCount = 0;

  assert.equal(store.deletePublishedGeneration(generation), true);
  assert.equal(directoryFsyncCount, 1);
  assert.equal(directoryCloseCount, 1);
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

test('treats parent directory fsync and close failures as best-effort after rename', async (t) => {
  for (const failurePoint of ['fsync', 'close']) {
    await t.test(`${failurePoint} failure`, () => {
      const dataDir = createTempDir();
      t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
      const directoryDescriptor = 987_654;
      let directoryCloseCount = 0;
      const fsImpl = {
        ...fs,
        openSync(targetPath, flags, mode) {
          if (path.resolve(targetPath) === path.resolve(dataDir)) return directoryDescriptor;
          return fs.openSync(targetPath, flags, mode);
        },
        fsyncSync(descriptor) {
          if (descriptor === directoryDescriptor) {
            if (failurePoint === 'fsync') throw new Error('directory fsync failed');
            return;
          }
          return fs.fsyncSync(descriptor);
        },
        closeSync(descriptor) {
          if (descriptor === directoryDescriptor) {
            directoryCloseCount += 1;
            if (failurePoint === 'close') throw new Error('directory close failed');
            return;
          }
          return fs.closeSync(descriptor);
        },
      };
      const store = createPromptGalleryStore(dataDir, { fsImpl, platform: 'linux' });
      const replacement = [{ uniqueKey: `replacement-${failurePoint}` }];

      assert.doesNotThrow(() => store.savePublished(replacement));
      assert.deepEqual(store.loadPublished(), replacement);
      assert.equal(directoryCloseCount, 1);
    });
  }
});
