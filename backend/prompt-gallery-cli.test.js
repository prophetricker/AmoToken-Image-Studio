const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  parseCliArgs,
  runBundleRefresh,
  selectBundlePublication,
} = require('./prompt-gallery-cli');

const QUIET_LOGGER = { log() {}, warn() {} };
const OLD_OUTPUT = '{"old":true}\n';

function promptRecords(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `candidate-${index}`,
    title: `Candidate ${index}`,
    content: `Geometric landscape composition number ${index}`,
    images: [`https://raw.githubusercontent.com/example/gallery/main/${index}.png`],
    source: 'test-source',
    sourceUrl: 'https://github.com/example/gallery',
    category: 'landscape',
  }));
}

function createRefreshHarness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-gallery-cli-test-'));
  const output = path.join(root, 'prompts.json');
  fs.writeFileSync(output, OLD_OUTPUT, 'utf8');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const records = options.records || [];
  const sources = [{
    id: 'test-source',
    label: 'Test source',
    sourceUrl: 'https://github.com/example/gallery',
    license: 'MIT',
    enabled: true,
  }];
  const observed = {
    dataDir: null,
    serviceOptions: null,
    bundledSnapshotMissingAtFactory: null,
  };
  const dependencies = {
    fsImpl: options.fsImpl || fs,
    osImpl: { tmpdir: () => root },
    sources,
    createStore(dataDir) {
      observed.dataDir = dataDir;
      return {
        loadSource(sourceId) {
          return sourceId === sources[0].id ? records : null;
        },
      };
    },
    createService(serviceOptions) {
      observed.serviceOptions = serviceOptions;
      observed.bundledSnapshotMissingAtFactory = !fs.existsSync(
        serviceOptions.bundledSnapshotPath,
      );
      return {
        load() {},
        async refresh() {},
        getMeta() {
          return {
            sources: sources.map(source => ({
              ...source,
              status: options.sourceStatus || 'healthy',
              candidateCount: records.length,
            })),
          };
        },
      };
    },
  };
  if (options.selectPublication) {
    dependencies.selectPublication = options.selectPublication;
  }
  return { dependencies, observed, output, root };
}

test('parses bundle mode with the backend snapshot as its default output', () => {
  assert.deepEqual(parseCliArgs(['--bundle']), {
    bundle: true,
    output: path.join(__dirname, 'prompts.json'),
  });
});

test('rejects bundle output paths outside the backend directory', () => {
  assert.throws(
    () => parseCliArgs(['--output', '..\\outside.json']),
    /backend directory/,
  );
});

test('rejects an output path whose backend parent resolves outside through a link', (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-gallery-cli-outside-'));
  const container = fs.mkdtempSync(path.join(__dirname, '.prompt-gallery-cli-link-'));
  const link = path.join(container, 'escape');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => {
    fs.unlinkSync(link);
    fs.rmSync(container, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  const linkedOutput = path.relative(
    __dirname,
    path.join(link, 'missing', 'nested', 'prompts.json'),
  );
  assert.throws(
    () => parseCliArgs(['--bundle', '--output', linkedOutput]),
    /backend directory/,
  );
});

test('rejects credential arguments', () => {
  assert.throws(
    () => parseCliArgs(['--bundle', '--token', 'secret']),
    /Unknown argument/,
  );
});

test('fills a maintainer bundle to exactly 1000 policy-selected records', () => {
  const candidates = promptRecords(1100);

  assert.equal(selectBundlePublication(candidates, []).length, 1000);
});

test('rejects candidate or publication counts below 950 without replacing output', async (t) => {
  await t.test('candidate pool below 950', async (subtest) => {
    const harness = createRefreshHarness(subtest, { records: promptRecords(949) });

    await assert.rejects(
      runBundleRefresh(harness.output, QUIET_LOGGER, harness.dependencies),
      /outside 950-1050/,
    );

    assert.equal(fs.readFileSync(harness.output, 'utf8'), OLD_OUTPUT);
    assert.ok(harness.observed.dataDir);
    assert.equal(fs.existsSync(harness.observed.dataDir), false);
  });

  await t.test('publication below 950', async (subtest) => {
    const harness = createRefreshHarness(subtest, {
      records: promptRecords(1000),
      selectPublication: records => records.slice(0, 949),
    });

    await assert.rejects(
      runBundleRefresh(harness.output, QUIET_LOGGER, harness.dependencies),
      /outside 950-1050/,
    );

    assert.equal(fs.readFileSync(harness.output, 'utf8'), OLD_OUTPUT);
    assert.ok(harness.observed.dataDir);
    assert.equal(fs.existsSync(harness.observed.dataDir), false);
  });
});

test('all failed sources use no fixture or old bundled snapshot', async (t) => {
  const harness = createRefreshHarness(t, { sourceStatus: 'failed' });

  await assert.rejects(
    runBundleRefresh(harness.output, QUIET_LOGGER, harness.dependencies),
    /outside 950-1050/,
  );

  const serviceOptions = harness.observed.serviceOptions;
  assert.ok(serviceOptions);
  assert.equal(path.dirname(serviceOptions.bundledSnapshotPath), harness.observed.dataDir);
  assert.equal(harness.observed.bundledSnapshotMissingAtFactory, true);
  assert.notEqual(serviceOptions.bundledSnapshotPath, harness.output);
  assert.equal(fs.readFileSync(harness.output, 'utf8'), OLD_OUTPUT);
  assert.equal(fs.existsSync(harness.observed.dataDir), false);
});

test('write and rename failures preserve the old output and clean temporary data', async (t) => {
  for (const operation of ['writeFileSync', 'renameSync']) {
    await t.test(operation, async (subtest) => {
      const failingFs = {
        ...fs,
        [operation]() {
          throw new Error(`${operation} failed`);
        },
      };
      const harness = createRefreshHarness(subtest, {
        records: promptRecords(1000),
        fsImpl: failingFs,
      });

      await assert.rejects(
        runBundleRefresh(harness.output, QUIET_LOGGER, harness.dependencies),
        new RegExp(`${operation} failed`),
      );

      assert.equal(fs.readFileSync(harness.output, 'utf8'), OLD_OUTPUT);
      assert.equal(fs.existsSync(harness.observed.dataDir), false);
      assert.deepEqual(
        fs.readdirSync(harness.root).filter(name => name.startsWith('prompts.json.')),
        [],
      );
    });
  }
});

test('a successful refresh writes the bundle and cleans temporary data', async (t) => {
  const harness = createRefreshHarness(t, { records: promptRecords(1000) });

  await assert.doesNotReject(
    runBundleRefresh(harness.output, QUIET_LOGGER, harness.dependencies),
  );

  assert.equal(JSON.parse(fs.readFileSync(harness.output, 'utf8')).length, 1000);
  assert.equal(fs.existsSync(harness.observed.dataDir), false);
  assert.equal(harness.observed.bundledSnapshotMissingAtFactory, true);
});
