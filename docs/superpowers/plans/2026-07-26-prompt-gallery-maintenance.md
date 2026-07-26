# Prompt Gallery Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a stable, slowly rotating prompt gallery of about 1,000 image-backed prompts from multiple sources while fixing low-risk dependency vulnerabilities and leaving the production container untouched.

**Architecture:** Move source fetching and parsing from the browser into focused CommonJS backend modules. Persist one last-good snapshot per source, derive a deterministic balanced public snapshot, and expose prompts plus source health through Nova APIs; the frontend becomes an API-only viewer. Keep image downloads lazy and bounded by the existing cache.

**Tech Stack:** Node.js 22, CommonJS, native `fetch`, Next.js 16 static export, React 19, TypeScript, Node test runner, Vitest, Playwright, Docker.

---

## File Map

- `backend/prompt-gallery-sources.js`: enabled source definitions, URLs, license metadata, parser kind, and minimum counts.
- `backend/prompt-gallery-parsers.js`: pure JSON/Markdown parsers and URL normalization; no filesystem or network access.
- `backend/prompt-gallery-policy.js`: normalization, content hash, safety filtering, quality ranking, deduplication, balancing, and bounded rotation.
- `backend/prompt-gallery-store.js`: valid JSON loading and atomic per-source/published/manifest writes.
- `backend/prompt-gallery-service.js`: direct/proxy fetching, concurrency control, last-good behavior, refresh lifecycle, and metadata.
- `backend/prompt-gallery-cli.js`: one-shot bundled snapshot refresh for maintainers.
- `backend/fixtures/prompt-gallery/*`: small, deterministic parser fixtures for every source kind.
- `backend/*.test.js`: Node tests for the modules above.
- `backend/server.js`: API and lifecycle integration only.
- `frontend/src/lib/prompt-gallery-data.ts`: server-record normalization, categories, search/filter, and image proxy URLs only.
- `frontend/src/lib/prompt-gallery-client.ts`: `/api/nova/prompts` and `/api/nova/prompts/meta` client contracts.
- `frontend/src/components/PromptGallery.tsx`: render server prompts and source metadata without external fetching.

### Task 1: Establish Security And Test Baselines

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `docs/nova-image-studio-dependency-audit-2026-07-26.md`

- [ ] **Step 1: Capture the pre-change test baseline**

Run from the repository root:

```powershell
npm.cmd run test:run
```

Expected: the existing frontend suite and both backend test files pass before dependency edits.

- [ ] **Step 2: Apply only compatible security updates**

Run:

```powershell
cd backend
npm.cmd install undici@^8.9.0 ws@^8.21.1 better-sqlite3@^12.11.1
cd ..\frontend
npm.cmd install next@^16.2.12 vitest@^3.2.7
```

Do not run `npm audit fix --force`, downgrade `next-pwa`, or replace the service worker in this task.

- [ ] **Step 3: Verify dependency updates do not change behavior**

Run:

```powershell
cd backend
npm.cmd test
npm.cmd run lint
cd ..\frontend
npm.cmd run test:run
npm.cmd run lint
npm.cmd run build
```

Expected: all commands pass; the frontend still emits a static export.

- [ ] **Step 4: Record actual audit boundaries**

Run all three audits and write their actual severity counts and package names into `docs/nova-image-studio-dependency-audit-2026-07-26.md`:

```powershell
cd frontend
npm.cmd audit --json
npm.cmd audit --omit=dev --json
cd ..\backend
npm.cmd audit --omit=dev --json
```

The document must explicitly state that frontend modules are present in the Docker builder but absent from the production image, while backend production dependencies are copied into the runtime image. Any remaining `next-pwa`/Workbox finding is recorded as deferred builder-chain maintenance, not reported as fixed.

- [ ] **Step 5: Commit the dependency baseline**

```powershell
git add backend/package.json backend/package-lock.json frontend/package.json frontend/package-lock.json docs/nova-image-studio-dependency-audit-2026-07-26.md
git commit -m "chore: patch image studio dependencies"
```

### Task 2: Port And Expand Source Parsers

**Files:**
- Create: `backend/prompt-gallery-sources.js`
- Create: `backend/prompt-gallery-parsers.js`
- Create: `backend/prompt-gallery-parsers.test.js`
- Create: `backend/fixtures/prompt-gallery/nanobanana.json`
- Create: `backend/fixtures/prompt-gallery/markdown-awesome.md`
- Create: `backend/fixtures/prompt-gallery/markdown-gpt4o.md`
- Create: `backend/fixtures/prompt-gallery/markdown-youmind.md`
- Create: `backend/fixtures/prompt-gallery/davidwu.json`
- Create: `backend/fixtures/prompt-gallery/zerolu-nanobanana.md`
- Create: `backend/fixtures/prompt-gallery/wuyoscar-gpt-image2.md`

- [ ] **Step 1: Write failing parser contract tests**

Create tests using this contract:

```js
const { parseSourceDocuments } = require('./prompt-gallery-parsers');

test('parses every enabled source fixture into image-backed records', () => {
  for (const source of PROMPT_GALLERY_SOURCES) {
    const documents = loadFixtureDocuments(source.id);
    const prompts = parseSourceDocuments(source, documents);
    assert.ok(prompts.length > 0, source.id);
    assert.ok(prompts.every(prompt => prompt.title && prompt.content));
    assert.ok(prompts.every(prompt => prompt.images.length > 0));
    assert.ok(prompts.every(prompt => prompt.source === source.id));
    assert.ok(prompts.every(prompt => prompt.sourceUrl === source.sourceUrl));
  }
});
```

Also assert that `EvoLinkAI` is absent, and that the two new sources report `license: 'MIT'`.

- [ ] **Step 2: Run the parser tests and confirm failure**

```powershell
cd backend
node --test prompt-gallery-parsers.test.js
```

Expected: FAIL because source and parser modules do not exist.

- [ ] **Step 3: Define eight enabled sources**

Export definitions with this stable shape:

```js
{
  id: 'wuyoscar-gpt-image2',
  label: 'wuyoscar/GPT-Image2-Skill',
  sourceUrl: 'https://github.com/wuyoscar/GPT-Image2-Skill',
  license: 'MIT',
  parser: 'wuyoscar-markdown',
  minimumCount: 20,
  documents: [{
    name: 'README.zh.md',
    directUrl: 'https://raw.githubusercontent.com/wuyoscar/GPT-Image2-Skill/main/README.zh.md',
    proxyUrl: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/wuyoscar/GPT-Image2-Skill/main/README.zh.md',
  }],
  rawBaseUrl: 'https://raw.githubusercontent.com/wuyoscar/GPT-Image2-Skill/main',
}
```

Use analogous definitions for the six reachable existing sources plus `ZeroLu/awesome-nanobanana-pro`. Set conservative minimums below observed healthy counts: `1000`, `40`, `50`, `100`, `100`, `400`, `20`, and `20` respectively.

- [ ] **Step 4: Implement pure parsers**

Export:

```js
function parseSourceDocuments(source, documents) {}
function inferPromptCategory(title, content, tags) {}
function extractMarkdownImages(rawBaseUrl, block) {}
function absolutizeSourceImage(rawBaseUrl, value) {}
```

Port the existing Nanobanana, Markdown Awesome, GPT4o, YouMind, and DavidWu behavior. Add:

- `zerolu-markdown`: split at `###` headings, pair the nearest `<img src>` with the following `**Prompt:**` fenced block, and use heading text or image alt text as title.
- `wuyoscar-markdown`: split gallery sections at `####` headings, pair each `**提示词 ...**` fenced block with the corresponding table image, and preserve Chinese headings.

Every result must have `id`, `title`, `content`, `images`, `tags`, `contributor`, `notes`, `source`, `sourceUrl`, `category`, and stable `uniqueKey` fields. Parser functions must not call `fetch`.

- [ ] **Step 5: Run parser tests**

```powershell
node --test prompt-gallery-parsers.test.js
```

Expected: PASS for all seven fixture formats and eight enabled definitions.

- [ ] **Step 6: Commit source parsing**

```powershell
git add backend/prompt-gallery-sources.js backend/prompt-gallery-parsers.js backend/prompt-gallery-parsers.test.js backend/fixtures/prompt-gallery
git commit -m "feat: add server prompt source parsers"
```

### Task 3: Build The Publication Policy

**Files:**
- Create: `backend/prompt-gallery-policy.js`
- Create: `backend/prompt-gallery-policy.test.js`
- Modify: `backend/prompt-image-cache.js`
- Create: `backend/prompt-image-cache.test.js`

- [ ] **Step 1: Write failing policy tests**

Cover these exact cases:

```js
test('keeps neutral visual vocabulary but blocks explicit phrases', () => {
  assert.equal(isPromptAllowed(prompt('wet leather collar product photo'), keywords), true);
  assert.equal(isPromptAllowed(prompt('explicit prohibited phrase'), ['explicit prohibited phrase']), false);
});

test('deduplicates normalized content and keeps the higher-quality record', () => {
  const result = prepareCandidates([lowQualityDuplicate, highQualityDuplicate], policyOptions);
  assert.equal(result.length, 1);
  assert.equal(result[0].source, highQualityDuplicate.source);
});

test('selects 1000 deterministically with source and category soft caps', () => {
  const first = selectPublishedCandidates(candidatePool, { targetCount: 1000, sourceCap: 400, categoryCap: 250 });
  const second = selectPublishedCandidates([...candidatePool].reverse(), { targetCount: 1000, sourceCap: 400, categoryCap: 250 });
  assert.deepEqual(first.map(item => item.uniqueKey), second.map(item => item.uniqueKey));
});

test('rotates no more than 20 records after initial publication', () => {
  const next = rotatePublished(previous, desired, { targetCount: 1000, maxChanges: 20 });
  assert.ok(addedKeys(previous, next).length <= 20);
  assert.ok(removedKeys(previous, next).length <= 20);
});
```

Also test recovery from fewer than 950 records, rejection of records without allowed images, Chinese-facing title preference, and empty category removal.

- [ ] **Step 2: Add strict GitHub attachment image support**

Add tests proving these URL rules:

```js
assert.equal(isAllowedPromptImageUrl('https://github.com/user-attachments/assets/3a056a8d-904e-4b3e-b0d2-b5122758b7f5'), true);
assert.equal(isAllowedPromptImageUrl('https://github.com/org/repo/issues/1'), false);
assert.equal(isAllowedPromptImageUrl('https://evil.example/user-attachments/assets/abc'), false);
```

Update `prompt-image-cache.js` to allow only `github.com/user-attachments/assets/<uuid>` in addition to existing raw GitHub image paths. Extensionless attachment URLs use the response content type for the final cache filename.

- [ ] **Step 3: Run focused tests and confirm failure before implementation**

```powershell
node --test prompt-gallery-policy.test.js prompt-image-cache.test.js
```

- [ ] **Step 4: Implement pure selection functions**

Export this API:

```js
module.exports = {
  AMBIGUOUS_STANDALONE_TERMS,
  createContentHash,
  isPromptAllowed,
  normalizePromptRecord,
  prepareCandidates,
  selectPublishedCandidates,
  rotatePublished,
  summarizeCategories,
};
```

`AMBIGUOUS_STANDALONE_TERMS` is the explicit set `banana`, `香蕉`, `chest`, `collar`, `leather`, `thick`, `wet`, `exposure`, `胸部`, `衣领`, `皮革`, `厚实`, `湿润`, and `曝光`; these values are removed from standalone hard matching. Other configured blacklist phrases retain whole-word Latin matching or substring CJK matching.

Normalize whitespace and case before SHA-256 hashing. Reject missing title/content/image and images that fail `isAllowedPromptImageUrl`. Rank complete Chinese-facing records, then sort by score and content hash. Apply source/category caps in the first pass and relax caps only to fill the 950-record minimum. Preserve valid previous records and limit steady-state additions/removals to 20; an empty or sub-950 initial snapshot may fill directly to 1,000.

- [ ] **Step 5: Run policy and image-cache tests**

```powershell
node --test prompt-gallery-policy.test.js prompt-image-cache.test.js
```

Expected: PASS with deterministic ordering and strict URL checks.

- [ ] **Step 6: Commit publication policy**

```powershell
git add backend/prompt-gallery-policy.js backend/prompt-gallery-policy.test.js backend/prompt-image-cache.js backend/prompt-image-cache.test.js
git commit -m "feat: curate stable prompt gallery selection"
```

### Task 4: Persist Last-Good Snapshots And Refresh Safely

**Files:**
- Create: `backend/prompt-gallery-store.js`
- Create: `backend/prompt-gallery-store.test.js`
- Create: `backend/prompt-gallery-service.js`
- Create: `backend/prompt-gallery-service.test.js`
- Modify: `.gitignore`

- [ ] **Step 1: Write failing atomic store tests**

Use `fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gallery-'))` and assert:

```js
const store = createPromptGalleryStore(tempDir);
store.saveSource('source-a', [{ uniqueKey: 'a' }]);
assert.deepEqual(store.loadSource('source-a'), [{ uniqueKey: 'a' }]);
assert.equal(findTemporaryJsonFiles(tempDir).length, 0);
```

Also verify malformed JSON returns `null`, a failed rename leaves the previous valid file readable, and published/manifest files use separate paths.

- [ ] **Step 2: Write failing service tests**

Inject `fetchImpl`, `now`, and a temporary store. Cover:

- direct URL failure followed by proxy success;
- HTTP errors and parser errors retaining the previous source snapshot;
- a successful count below `minimumCount` being recorded as `count_collapse` without overwrite;
- no more than two active source fetches;
- first refresh publishing 1,000 and later refresh rotating at most 20;
- metadata containing source ID, label, source URL, license, status, candidate count, last success, and refresh times without filesystem paths or stack traces.

Use this service interface:

```js
const service = createPromptGalleryService({
  dataDir,
  bundledSnapshotPath,
  blacklistPath,
  sources,
  fetchImpl,
  logger,
  now,
});

service.load();
await service.refresh({ initial: true });
service.start({ initialDelayMs: 60_000, intervalMs: 72 * 60 * 60 * 1000 });
service.stop();
service.getPublished();
service.getMeta();
```

- [ ] **Step 3: Run focused tests and confirm failure**

```powershell
node --test prompt-gallery-store.test.js prompt-gallery-service.test.js
```

- [ ] **Step 4: Implement atomic store operations**

Write UTF-8 JSON to `<target>.<pid>.<timestamp>.tmp`, flush and close it, then rename it over the target. Persist under:

```text
<dataDir>/sources/<source-id>.json
<dataDir>/published.json
<dataDir>/manifest.json
```

Ignore `backend/data/` in `.gitignore` so local refresh state cannot enter git.

- [ ] **Step 5: Implement refresh orchestration**

Use a two-worker queue. Fetch every declared document direct-first and proxy-second with an `AbortController` timeout of 25 seconds. Parse only after all required documents arrive. Treat zero/below-minimum/parser failure as failed and retain last-good. Merge all last-good records, apply policy, atomically save source snapshots before the merged publication, then update the manifest.

The scheduler uses unref'd timers, prevents overlapping refreshes, starts after 60 seconds, and repeats every 72 hours. `load()` distinguishes a persisted `published.json` from the bundled fallback: when per-source persistent state does not exist, the first scheduled refresh is an initial fill rather than a 20-record rotation. Text refresh must never prefetch images.

- [ ] **Step 6: Run store and service tests**

```powershell
node --test prompt-gallery-store.test.js prompt-gallery-service.test.js
```

Expected: PASS including retention and concurrency checks.

- [ ] **Step 7: Commit persistence and refresh service**

```powershell
git add .gitignore backend/prompt-gallery-store.js backend/prompt-gallery-store.test.js backend/prompt-gallery-service.js backend/prompt-gallery-service.test.js
git commit -m "feat: persist prompt gallery last-good snapshots"
```

### Task 5: Integrate Nova APIs And Lifecycle

**Files:**
- Modify: `backend/server.js`
- Create: `backend/prompt-gallery-api.test.js`

- [ ] **Step 1: Add a testable API responder**

Create failing tests around an exported helper from `prompt-gallery-service.js`:

```js
const routes = createPromptGalleryApi(service);
assert.deepEqual(routes.getPrompts(), service.getPublished());
assert.deepEqual(routes.getMeta(), service.getMeta());
```

The metadata test must assert that `dataDir`, local paths, raw exception objects, and proxy URLs are absent.

- [ ] **Step 2: Run the API test and confirm failure**

```powershell
node --test prompt-gallery-api.test.js
```

- [ ] **Step 3: Wire the service into `server.js`**

Initialize once using:

```js
const promptGalleryService = createPromptGalleryService({
  dataDir: process.env.NOVA_PROMPT_GALLERY_DIR || path.join(__dirname, 'data', 'prompt-gallery'),
  bundledSnapshotPath: path.join(__dirname, 'prompts.json'),
  blacklistPath: path.join(__dirname, 'blacklist.json'),
  sources: PROMPT_GALLERY_SOURCES,
  fetchImpl: fetch,
  logger: console,
});

promptGalleryService.load();
promptGalleryService.start({ initialDelayMs: 60_000, intervalMs: 72 * 60 * 60 * 1000 });
```

Replace direct `prompts.json` reads in `GET /api/nova/prompts` with `getPublished()`. Add `GET /api/nova/prompts/meta` returning the sanitized metadata with `Cache-Control: no-store`. Leave `/api/nova/blacklist` available for compatibility, but the frontend will no longer apply it after publication.

- [ ] **Step 4: Run backend tests and lint**

```powershell
cd backend
npm.cmd test
npm.cmd run lint
```

Expected: all backend tests pass and startup code has no leaked timer handles in tests.

- [ ] **Step 5: Commit server integration**

```powershell
git add backend/server.js backend/prompt-gallery-api.test.js
git commit -m "feat: expose stable prompt gallery api"
```

### Task 6: Make The Frontend API-Only

**Files:**
- Create: `frontend/src/lib/prompt-gallery-client.ts`
- Create: `frontend/src/lib/__tests__/prompt-gallery-client.test.ts`
- Modify: `frontend/src/lib/prompt-gallery-data.ts`
- Modify: `frontend/src/lib/__tests__/prompt-gallery-data.test.ts`
- Modify: `frontend/src/components/PromptGallery.tsx`
- Modify: `frontend/src/components/__tests__/PromptGallerySubcomponents.test.tsx`

- [ ] **Step 1: Write failing client tests**

Define contracts:

```ts
export interface PromptGallerySourceMeta {
  id: string;
  label: string;
  sourceUrl: string;
  license: string;
  status: 'healthy' | 'stale' | 'failed' | 'pending';
  candidateCount: number;
  lastSuccessAt: string | null;
}

export interface PromptGalleryMeta {
  publishedCount: number;
  refreshedAt: string | null;
  nextRefreshAt: string | null;
  sources: PromptGallerySourceMeta[];
}
```

Tests assert `fetchPromptGallery()` and `fetchPromptGalleryMeta()` call only same-origin `/api/nova/...` paths, reject empty/invalid prompt responses with `提示词广场暂不可用`, and do not invoke an external fallback.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
cd frontend
npm.cmd run test:run -- src/lib/__tests__/prompt-gallery-client.test.ts src/lib/__tests__/prompt-gallery-data.test.ts
```

- [ ] **Step 3: Split API access from local data helpers**

Move server response normalization into `prompt-gallery-client.ts`. Remove `PROMPT_DATA_SOURCES`, all remote `fetchSource` functions, and source-specific parsers from the frontend bundle. Keep category normalization, image proxy mapping, search, and visible-category helpers in `prompt-gallery-data.ts`.

Change `filterPromptGalleryPrompts` to filter only by search and selected category. Safety and Chinese-facing selection have already occurred on the server, so the frontend must not reapply the old 491-keyword list and shrink 1,000 records back to 326.

- [ ] **Step 4: Update the gallery component**

Load prompts and metadata in parallel. Render the existing cards/search/categories unchanged. Populate the source popover from metadata and show `来源信息暂不可用` only inside the popover when metadata fails; prompt cards remain usable. If prompts fail, show the existing compact error state with `提示词广场暂不可用`.

- [ ] **Step 5: Run focused frontend tests**

```powershell
npm.cmd run test:run -- src/lib/__tests__/prompt-gallery-client.test.ts src/lib/__tests__/prompt-gallery-data.test.ts src/components/__tests__/PromptGallerySubcomponents.test.tsx
```

Expected: PASS and test fetch calls contain no GitHub or proxy host.

- [ ] **Step 6: Commit the API-only frontend**

```powershell
git add frontend/src/lib/prompt-gallery-client.ts frontend/src/lib/__tests__/prompt-gallery-client.test.ts frontend/src/lib/prompt-gallery-data.ts frontend/src/lib/__tests__/prompt-gallery-data.test.ts frontend/src/components/PromptGallery.tsx frontend/src/components/__tests__/PromptGallerySubcomponents.test.tsx
git commit -m "refactor: load prompt gallery from nova snapshots"
```

### Task 7: Generate And Validate The Initial 1,000-Record Bundle

**Files:**
- Create: `backend/prompt-gallery-cli.js`
- Create: `backend/prompt-gallery-cli.test.js`
- Modify: `backend/package.json`
- Modify: `backend/prompts.json`

- [ ] **Step 1: Write a failing CLI argument test**

Extract `parseCliArgs` and assert:

```js
assert.deepEqual(parseCliArgs(['--bundle']), {
  bundle: true,
  output: path.join(__dirname, 'prompts.json'),
});
assert.throws(() => parseCliArgs(['--output', '..\\outside.json']), /backend directory/);
```

The CLI must never accept credentials and must write only inside `backend/` for bundle mode.

- [ ] **Step 2: Run the CLI test and confirm failure**

```powershell
cd backend
node --test prompt-gallery-cli.test.js
```

- [ ] **Step 3: Implement one-shot bundle refresh**

Add the package script:

```json
"prompts:refresh": "node prompt-gallery-cli.js --bundle"
```

The command creates a temporary data directory, performs an initial full refresh, requires a final count between 950 and 1,050, validates every record through publication policy, writes formatted UTF-8 JSON atomically to `backend/prompts.json`, prints per-source candidate counts, and removes the temporary data directory in `finally`.

- [ ] **Step 4: Refresh the bundled snapshot over the network**

```powershell
npm.cmd run prompts:refresh
```

Expected summary includes eight source statuses, a candidate pool greater than 1,000, and `published=1000`. A failed source may use an existing fixture only in tests, never in the real bundle command; if healthy last-good data is unavailable, the command must fail instead of silently publishing a partial bundle below 950.

- [ ] **Step 5: Validate the generated snapshot offline**

```powershell
node -e "const p=require('./prompts.json'); if(p.length<950||p.length>1050) process.exit(1); if(p.some(x=>!x.title||!x.content||!x.images?.length)) process.exit(2); console.log(p.length)"
node --test prompt-gallery-cli.test.js prompt-gallery-policy.test.js prompt-gallery-parsers.test.js
```

Expected: prints a count in range and all tests pass.

- [ ] **Step 6: Commit the initial bundle**

```powershell
git add backend/package.json backend/prompt-gallery-cli.js backend/prompt-gallery-cli.test.js backend/prompts.json
git commit -m "data: publish curated prompt gallery snapshot"
```

### Task 8: Full Local Verification And Stop Gate

**Files:**
- Modify only files required by failures found during verification.

- [ ] **Step 1: Run complete automated verification**

```powershell
cd frontend
npm.cmd run test:run
npm.cmd run lint
cd ..\backend
npm.cmd test
npm.cmd run lint
cd ..
npm.cmd run build
git diff --check
```

Expected: all frontend/backend tests pass, lint passes, the static build succeeds, and no whitespace errors are reported.

- [ ] **Step 2: Build the production image locally**

```powershell
docker build -t amotoken/nova-image-studio:prompt-gallery-local .
```

Expected: image builds without critical backend runtime audit findings. Builder-only residual findings match the dependency audit document.

- [ ] **Step 3: Start an isolated local preview**

Run the image with a temporary local data directory, loopback binding, and production-equivalent resource limits on an unused port such as 43200. Do not connect it to production NewAPI credentials.

```powershell
docker run --rm --name nova-prompt-gallery-local --cpus 1.5 --memory 1536m -p 127.0.0.1:43200:3000 amotoken/nova-image-studio:prompt-gallery-local
```

- [ ] **Step 4: Verify with Playwright**

At desktop and mobile widths, verify:

- prompt total is between 950 and 1,050;
- category chips contain no empty categories;
- search reduces results without changing the underlying snapshot;
- source popover lists healthy/stale source metadata in Chinese-facing UI;
- the browser makes no requests to GitHub, X, or `proxy.ccode.vip` except image requests routed through `/api/nova/prompt-gallery/image`;
- lazy scrolling loads additional cards without layout overlap or horizontal overflow;
- opening a card, copying a prompt, and adding it to the material library still work.

- [ ] **Step 5: Run read-only production preflight**

```powershell
ssh -o BatchMode=yes root@64.90.3.77 "docker ps --format '{{.Names}}|{{.Status}}|{{.Image}}'; df -h /; free -h; docker inspect nova-image-studio --format '{{json .HostConfig.Memory}}|{{json .HostConfig.NanoCpus}}|{{json .HostConfig.PortBindings}}'"
```

Expected: current Nova and NewAPI remain running; this command makes no changes.

- [ ] **Step 6: Stop before production changes**

Stop and remove only the local preview container. Review `git status`, commits, screenshots, audit summary, and local verification results with the user. Do not build on the server, push a production tag, replace/restart the running Nova container, alter its environment, or change Nginx until the user gives a new explicit deployment approval.
