const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { createPromptGalleryApi } = require('./prompt-gallery-service');

function publicPrompt(overrides = {}) {
  return {
    id: 'prompt-a',
    title: 'Example prompt',
    content: 'Draw a stable example',
    images: ['https://raw.githubusercontent.com/example/gallery/main/example.png'],
    tags: ['example'],
    contributor: 'Example Author',
    notes: 'Example note',
    source: 'example-source',
    sourceUrl: 'https://github.com/example/gallery',
    category: 'Example',
    score: 12,
    contentHash: 'abc123',
    uniqueKey: 'prompt-a',
    ...overrides,
  };
}

function publicMeta(overrides = {}) {
  return {
    publishedCount: 1,
    refreshedAt: '2026-07-26T04:00:00.000Z',
    nextRefreshAt: '2026-07-29T04:00:00.000Z',
    sources: [{
      id: 'example-source',
      label: 'Example/gallery',
      sourceUrl: 'https://github.com/example/gallery',
      license: 'MIT',
      status: 'healthy',
      candidateCount: 1,
      lastSuccessAt: '2026-07-26T04:00:00.000Z',
    }],
    ...overrides,
  };
}

function assertNoPrivateMetadata(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'dataDir',
    'proxyUrl',
    'rawError',
    'stack',
    'C:\\\\private\\\\prompt-gallery',
    '/srv/nova/private',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `leaked ${forbidden}`);
  }
}

test('API helper preserves public service contracts and returns defensive copies', () => {
  const prompts = [publicPrompt()];
  const meta = publicMeta();
  const service = {
    getPublished: () => structuredClone(prompts),
    getMeta: () => structuredClone(meta),
  };
  const routes = createPromptGalleryApi(service);

  assert.deepEqual(routes.getPrompts(), service.getPublished());
  assert.deepEqual(routes.getMeta(), service.getMeta());

  const returnedPrompts = routes.getPrompts();
  const returnedMeta = routes.getMeta();
  returnedPrompts[0].title = 'mutated';
  returnedMeta.sources[0].label = 'mutated';
  assert.equal(routes.getPrompts()[0].title, prompts[0].title);
  assert.equal(routes.getMeta().sources[0].label, meta.sources[0].label);
});

test('API helper recursively strips private metadata and malformed getter output', () => {
  const service = {
    getPublished() {
      return [publicPrompt({
        dataDir: 'C:\\private\\prompt-gallery',
        proxyUrl: 'https://proxy.example/private',
        diagnostics: { stack: '/srv/nova/private/server.js:1' },
      })];
    },
    getMeta() {
      return publicMeta({
        dataDir: 'C:\\private\\prompt-gallery',
        proxyUrl: 'https://proxy.example/private',
        rawError: new Error('/srv/nova/private/source.json'),
        diagnostics: {
          stack: 'Error: failed at /srv/nova/private/server.js:1',
          localPath: '/srv/nova/private',
        },
        sources: [{
          ...publicMeta().sources[0],
          proxyUrl: 'https://proxy.example/private',
          rawError: { stack: '/srv/nova/private/source.js:1' },
        }],
      });
    },
  };
  const routes = createPromptGalleryApi(service);

  const prompts = routes.getPrompts();
  const meta = routes.getMeta();
  assert.deepEqual(prompts, [publicPrompt()]);
  assert.deepEqual(meta, publicMeta());
  assertNoPrivateMetadata(prompts);
  assertNoPrivateMetadata(meta);

  assert.deepEqual(createPromptGalleryApi({
    getPublished: () => ({ dataDir: 'C:\\private\\prompt-gallery' }),
    getMeta: () => ['not metadata'],
  }).getPrompts(), []);
  assert.deepEqual(createPromptGalleryApi({
    getPublished: () => [],
    getMeta: () => ['not metadata'],
  }).getMeta(), {
    publishedCount: 0,
    refreshedAt: null,
    nextRefreshAt: null,
    sources: [],
  });
});

test('API helper replaces thrown getter details with a generic error', () => {
  const routes = createPromptGalleryApi({
    getPublished() {
      throw new Error('read C:\\private\\prompt-gallery\\published.json failed');
    },
    getMeta() {
      throw new Error('proxyUrl=https://proxy.example/private');
    },
  });

  for (const getter of [routes.getPrompts, routes.getMeta]) {
    assert.throws(getter, (error) => {
      assert.equal(error.message, 'Prompt gallery unavailable');
      assertNoPrivateMetadata({ message: error.message });
      return true;
    });
  }
});

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode})\n${output.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process may still be binding the port.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`server did not start\n${output.join('')}`);
}

test('server exposes service-backed prompt APIs and keeps blacklist compatibility', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gallery-api-'));
  const port = await reservePort();
  const output = [];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NOVA_TASK_DB: path.join(tempDir, 'tasks.sqlite'),
      NOVA_IMAGE_DIR: path.join(tempDir, 'images'),
      NOVA_PROMPT_IMAGE_CACHE_DIR: path.join(tempDir, 'prompt-images'),
      NOVA_PROMPT_GALLERY_DIR: path.join(tempDir, 'prompt-gallery'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => output.push(chunk.toString()));
  child.stderr.on('data', chunk => output.push(chunk.toString()));
  t.after(async () => {
    const exitPromise = child.exitCode === null
      ? new Promise(resolve => child.once('exit', resolve))
      : Promise.resolve();
    if (child.exitCode === null) child.kill();
    let timeout;
    await Promise.race([
      exitPromise,
      new Promise(resolve => { timeout = setTimeout(resolve, 2_000); }),
    ]);
    clearTimeout(timeout);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(`${baseUrl}/api/nova/queue-status`, child, output);

  const promptsResponse = await fetch(`${baseUrl}/api/nova/prompts`);
  const prompts = await promptsResponse.json();
  assert.equal(promptsResponse.status, 200);
  assert.match(promptsResponse.headers.get('content-type') || '', /^application\/json/);
  assert.equal(promptsResponse.headers.get('cache-control'), 'no-store');
  assert.ok(Array.isArray(prompts) && prompts.length > 0);
  assert.equal(typeof prompts[0].contentHash, 'string');

  const metaResponse = await fetch(`${baseUrl}/api/nova/prompts/meta`);
  const meta = await metaResponse.json();
  assert.equal(metaResponse.status, 200);
  assert.match(metaResponse.headers.get('content-type') || '', /^application\/json/);
  assert.equal(metaResponse.headers.get('cache-control'), 'no-store');
  assert.equal(meta.publishedCount, prompts.length);
  assert.ok(Array.isArray(meta.sources));
  assertNoPrivateMetadata(meta);

  const blacklistResponse = await fetch(`${baseUrl}/api/nova/blacklist`);
  const blacklist = await blacklistResponse.json();
  assert.equal(blacklistResponse.status, 200);
  assert.ok(Array.isArray(blacklist.keywords));
});
