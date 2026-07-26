const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const { prepareCandidates, selectPublishedCandidates } = require('./prompt-gallery-policy');
const { createPromptGalleryService } = require('./prompt-gallery-service');
const { PROMPT_GALLERY_SOURCES } = require('./prompt-gallery-sources');
const { createPromptGalleryStore } = require('./prompt-gallery-store');

const BACKEND_DIR = __dirname;
const DEFAULT_OUTPUT_PATH = path.join(BACKEND_DIR, 'prompts.json');
const MINIMUM_BUNDLE_COUNT = 950;
const MAXIMUM_BUNDLE_COUNT = 1050;

function resolveBackendOutput(value) {
  const portableValue = String(value).replace(/[\\/]/g, path.sep);
  const output = path.resolve(BACKEND_DIR, portableValue);
  const relative = path.relative(BACKEND_DIR, output);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Bundle output must stay inside the backend directory');
  }
  return output;
}

function parseCliArgs(argv) {
  let bundle = false;
  let output = DEFAULT_OUTPUT_PATH;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--bundle') {
      bundle = true;
      continue;
    }
    if (argument === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--output requires a path');
      }
      output = resolveBackendOutput(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!bundle) throw new Error('The --bundle mode is required');
  return { bundle, output };
}

function readBlacklist() {
  const value = JSON.parse(fs.readFileSync(path.join(BACKEND_DIR, 'blacklist.json'), 'utf8'));
  return Array.isArray(value) || Array.isArray(value?.keywords) ? value : [];
}

function writeJsonAtomically(output, value) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const suffix = `${process.pid}.${Date.now()}.${randomBytes(6).toString('hex')}.tmp`;
  const temporaryPath = `${output}.${suffix}`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, output);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    try {
      fs.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
}

function validatePublication(records, blacklist) {
  if (records.length < MINIMUM_BUNDLE_COUNT || records.length > MAXIMUM_BUNDLE_COUNT) {
    throw new Error(
      `Published prompt count ${records.length} is outside ${MINIMUM_BUNDLE_COUNT}-${MAXIMUM_BUNDLE_COUNT}`,
    );
  }
  const validated = prepareCandidates(records, { blacklist });
  const validatedHashes = new Set(validated.map(record => record.contentHash));
  if (validated.length !== records.length
    || records.some(record => !validatedHashes.has(record.contentHash))) {
    throw new Error('Published prompts failed publication policy validation');
  }
}

function selectBundlePublication(records, blacklist) {
  return selectPublishedCandidates(records, {
    blacklist,
    targetCount: 1000,
    minimumCount: 1000,
  });
}

function removeTemporaryDataDirectory(dataDir) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(dataDir);
  const relative = path.relative(temporaryRoot, resolved);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) {
    throw new Error('Refusing to remove an invalid temporary data directory');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

async function runBundleRefresh(output, logger = console) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amotoken-prompt-gallery-'));
  try {
    const store = createPromptGalleryStore(dataDir);
    const service = createPromptGalleryService({
      dataDir,
      bundledSnapshotPath: path.join(dataDir, 'no-bundled-snapshot.json'),
      blacklistPath: path.join(BACKEND_DIR, 'blacklist.json'),
      sources: PROMPT_GALLERY_SOURCES,
      store,
      logger,
    });
    service.load();
    await service.refresh({ initial: true });

    const blacklist = readBlacklist();
    const sourceRecords = PROMPT_GALLERY_SOURCES.flatMap(
      source => store.loadSource(source.id) || [],
    );
    const candidatePool = prepareCandidates(sourceRecords, { blacklist });
    const published = selectBundlePublication(candidatePool, blacklist);
    const meta = service.getMeta();

    for (const source of meta.sources) {
      logger.log(`${source.id}: status=${source.status} candidates=${source.candidateCount}`);
    }
    logger.log(`candidate pool=${candidatePool.length}`);
    logger.log(`published=${published.length}`);

    validatePublication(published, blacklist);
    writeJsonAtomically(output, published);
  } finally {
    removeTemporaryDataDirectory(dataDir);
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  await runBundleRefresh(options.output);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}

module.exports = { parseCliArgs, runBundleRefresh, selectBundlePublication };
