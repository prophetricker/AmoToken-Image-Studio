# AmoToken Image Studio Brand And Key Test Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the isolated Nova worktree visibly match AmoToken, let users choose an eligible image token through a safe popup while retaining manual paste, and complete local 1K text-to-image and image-to-image tests without deploying production.

**Architecture:** Keep Nova as the browser workbench plus server-side task runner. Add a lightweight CSS/SVG harbor background and AmoToken assets around the existing workspace, a state-and-origin checked popup client for token selection, and a strict legacy `gpt-image-2` 1K fallback when the catalog/quote APIs are not yet available. Exact catalog quotes remain mandatory whenever those APIs are available.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind/CSS, Vitest, React Testing Library, Node task backend, Playwright.

---

## Boundaries And File Map

- Work only in `C:\Users\EZ\.config\superpowers\worktrees\AmoToken-Image-Studio\feature-image-studio-brand-key-test`.
- Do not change `feature/image-product-catalog`, production DNS, Basic Auth, or any server container.
- Never put a real token in source, fixtures, screenshots, shell arguments, logs, URLs, or commits.
- Create `frontend/src/components/brand/AmoTokenHarborScene.tsx`: decorative three-boat harbor layer and reduced-motion/pointer behavior.
- Create `frontend/src/components/brand/harbor-boat.tsx` and `frontend/src/components/brand/harbor-fleet.ts`: adapted main-site boat art and deterministic three-boat fixture.
- Create `frontend/src/components/brand/amotoken-harbor.css`: theme-aware waves, boat tracks, stacking, and reduced-motion rules.
- Create `frontend/src/components/brand/__tests__/AmoTokenHarborScene.test.tsx`: structure and reduced-motion behavior.
- Create `frontend/src/lib/amotoken-key-picker.ts` and `frontend/src/lib/__tests__/amotoken-key-picker.test.ts`: popup URL, random state, exact message validation, timeout, and cleanup.
- Create `frontend/src/lib/amotoken-image-fallback.ts` and its test: strict quote-free 1K capability and submission guard.
- Modify `frontend/src/components/SettingsModal.tsx` and its test: picker action plus existing manual fallback.
- Modify `frontend/src/components/ImageGenerationWorkbench.tsx` and its test: fallback catalog and quote-unavailable UX.
- Modify `frontend/src/lib/workspace-task-service.ts` and its test: optional quote only for the guarded fallback.
- Modify `frontend/src/components/workspace/WorkspaceHeader.tsx`, `frontend/src/components/workspace/WorkspaceShell.tsx`, `frontend/src/app/layout.tsx`, `frontend/public/manifest.json`, and branding assets.

### Task 1: Add The Lightweight AmoToken Harbor Layer

**Files:**
- Create: `frontend/src/components/brand/AmoTokenHarborScene.tsx`
- Create: `frontend/src/components/brand/harbor-boat.tsx`
- Create: `frontend/src/components/brand/harbor-fleet.ts`
- Create: `frontend/src/components/brand/amotoken-harbor.css`
- Create: `frontend/src/components/brand/__tests__/AmoTokenHarborScene.test.tsx`
- Modify: `frontend/src/components/workspace/WorkspaceShell.tsx`

- [ ] **Step 1: Write the failing component tests**

Test the user-visible contract, not animation timing:

```tsx
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AmoTokenHarborScene } from '@/components/brand/AmoTokenHarborScene';

describe('AmoTokenHarborScene', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('renders three decorative boats behind the workbench', () => {
    render(<AmoTokenHarborScene />);
    const scene = screen.getByTestId('amotoken-harbor-scene');
    expect(scene).toHaveAttribute('aria-hidden', 'true');
    expect(scene).toHaveAttribute('data-motion', 'full');
    expect(scene.querySelectorAll('[data-harbor-boat]')).toHaveLength(3);
    expect(scene.querySelector('canvas')).toBeNull();
  });

  it('marks the scene as reduced when the OS requests reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    render(<AmoTokenHarborScene />);
    expect(screen.getByTestId('amotoken-harbor-scene')).toHaveAttribute('data-motion', 'reduced');
  });

  it('updates bounded pointer variables in full-motion mode', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    render(<AmoTokenHarborScene />);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth, clientY: 0 }));
    const scene = screen.getByTestId('amotoken-harbor-scene');
    expect(scene.style.getPropertyValue('--harbor-pointer-x')).toBe('7px');
    expect(scene.style.getPropertyValue('--harbor-pointer-y')).toBe('-3px');
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module failure**

Run: `npm.cmd run test:run -- frontend/src/components/brand/__tests__/AmoTokenHarborScene.test.tsx`

Expected: FAIL because `AmoTokenHarborScene` does not exist.

- [ ] **Step 3: Bring over the deterministic boat renderer**

Copy these two exact source files from the sibling NewAPI worktree, preserving their copyright headers:

```text
C:\Users\EZ\.config\superpowers\worktrees\AmoToken\feature-image-studio-key-picker\new-api\web\default\src\features\home\components\harbor-boat.tsx
C:\Users\EZ\.config\superpowers\worktrees\AmoToken\feature-image-studio-key-picker\new-api\web\default\src\features\home\lib\harbor-fleet.ts
```

Place them as `frontend/src/components/brand/harbor-boat.tsx` and `frontend/src/components/brand/harbor-fleet.ts`. Change only their relative type import so `harbor-boat.tsx` imports `HarborBoatSpec` from `./harbor-fleet`. Do not bring over Canvas hooks, reroll controls, rarity labels, or main-site status UI.

- [ ] **Step 4: Implement the scene without Canvas**

Use three fixed boat variants adapted from the main-site Harbor Fleet files at `new-api/web/default/src/features/home/components/harbor-boat.tsx`. Render them in one absolute, `pointer-events-none` scene with two CSS wave layers. The component must expose only this stable shell:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { HarborBoat } from './harbor-boat';
import { createHarborFleet, createSeededRandom } from './harbor-fleet';
import './amotoken-harbor.css';

const STUDIO_FLEET = createHarborFleet(3, createSeededRandom(20260720));

export function AmoTokenHarborScene() {
  const [reduced, setReduced] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1)) * 7;
        const y = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1)) * 3;
        sceneRef.current?.style.setProperty('--harbor-pointer-x', `${x}px`);
        sceneRef.current?.style.setProperty('--harbor-pointer-y', `${y}px`);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
    };
  }, [reduced]);

  return (
    <div
      aria-hidden="true"
      className="amotoken-studio-harbor"
      data-motion={reduced ? 'reduced' : 'full'}
      data-testid="amotoken-harbor-scene"
      ref={sceneRef}
    >
      <div className="amotoken-studio-wave is-back" />
      {STUDIO_FLEET.map((boat, index) => (
        <div
          className={`amotoken-studio-boat is-${['far', 'middle', 'near'][index]}`}
          data-harbor-boat
          key={`${boat.rarity}-${index}`}
        >
          <HarborBoat spec={boat} />
        </div>
      ))}
      <div className="amotoken-studio-wave is-front" />
    </div>
  );
}
```

Do not add a reroll control or rarity UI. In CSS, use existing theme tokens (`--background`, `--primary`, `--muted`) with restrained teal/coral accents, fixed scene height, stable boat tracks, and these mandatory rules:

```css
.amotoken-studio-harbor { position: fixed; inset: auto 0 0; z-index: 0; height: min(24vh, 220px); overflow: hidden; pointer-events: none; opacity: .34; }
.amotoken-studio-wave { position: absolute; right: -8%; bottom: -45%; left: -8%; height: 88%; border-radius: 46% 51% 0 0; background: color-mix(in srgb, var(--primary) 18%, var(--background)); }
.amotoken-studio-boat { position: absolute; width: 104px; height: 84px; translate: var(--harbor-pointer-x, 0px) var(--harbor-pointer-y, 0px); animation: amotoken-studio-voyage 22s linear infinite, amotoken-studio-bob 4.8s ease-in-out infinite; }
.amotoken-studio-harbor[data-motion='reduced'] .amotoken-studio-boat,
.amotoken-studio-harbor[data-motion='reduced'] .amotoken-studio-wave { animation: none; }
@media (max-width: 640px) { .amotoken-studio-boat.is-far { display: none; } }
```

Place `<AmoTokenHarborScene />` once in `WorkspaceShell`, before the content shell. Give the content wrapper `relative z-10`; do not alter card dimensions or scrolling.

- [ ] **Step 5: Run focused and workspace tests**

Run: `npm.cmd run test:run -- frontend/src/components/brand/__tests__/AmoTokenHarborScene.test.tsx frontend/src/components/workspace/__tests__/WorkspaceModeTabs.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the harbor layer**

```powershell
git add frontend/src/components/brand frontend/src/components/workspace/WorkspaceShell.tsx
git commit -m "feat: add AmoToken harbor backdrop"
```

### Task 2: Replace The Visible Product Branding

**Files:**
- Create: `frontend/public/amotoken.png`
- Modify: `frontend/public/favicon.png`
- Modify: `frontend/public/icon-192.png`
- Modify: `frontend/public/icon-512.png`
- Modify: `frontend/public/icon-maskable-512.png`
- Modify: `frontend/public/manifest.json`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/workspace/WorkspaceHeader.tsx`
- Modify: `frontend/src/components/workspace/WorkspaceShell.tsx`
- Modify: `frontend/src/components/SettingsModal.tsx`
- Test: `frontend/src/components/__tests__/SettingsModal.test.tsx`
- Create: `frontend/src/app/__tests__/branding-metadata.test.ts`

- [ ] **Step 1: Add failing branding assertions**

Extend existing tests to expect `AmoToken Image Studio`, `/amotoken.png`, and no `Nova Image logo` accessible label in the header/settings shell. Create `branding-metadata.test.ts` using `node:fs` to parse `frontend/public/manifest.json` and read `layout.tsx`, `WorkspaceHeader.tsx`, and `WorkspaceShell.tsx`; assert AmoToken title/logo references exist and the old default title/logo label does not.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm.cmd run test:run -- frontend/src/components/__tests__/SettingsModal.test.tsx frontend/src/components/workspace`

Expected: FAIL on the old product name/logo.

- [ ] **Step 3: Copy and generate the AmoToken assets**

Copy `D:\MyProject\AmoToken\docs\amotoken.png` to `frontend/public/amotoken.png`. Use the installed `sharp` package to produce 192, 512, maskable 512, and favicon PNGs from that source; preserve transparency and use `contain`, never add a white background.

Run this from the Nova worktree root after the copy:

```powershell
@'
const sharp = require('./frontend/node_modules/sharp');
const source = './frontend/public/amotoken.png';
Promise.all([
  sharp(source).resize(64, 64, { fit: 'contain' }).png().toFile('./frontend/public/favicon.png'),
  sharp(source).resize(192, 192, { fit: 'contain' }).png().toFile('./frontend/public/icon-192.png'),
  sharp(source).resize(512, 512, { fit: 'contain' }).png().toFile('./frontend/public/icon-512.png'),
  sharp(source).resize(512, 512, { fit: 'contain' }).extend({ top: 52, bottom: 52, left: 52, right: 52, background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize(512, 512).png().toFile('./frontend/public/icon-maskable-512.png'),
]).catch(error => { console.error(error); process.exitCode = 1; });
'@ | node
```

- [ ] **Step 4: Update product metadata and visible shell copy**

Set manifest `name` to `AmoToken Image Studio`, `short_name` to `AmoToken Image`, description to `AmoToken AI 生图工作台`, screenshot labels to AmoToken wording, and metadata title/description/icons to the new assets. Replace both header/sidebar marks and titles with:

```tsx
<img src="/amotoken.png" alt="AmoToken Image Studio" className="... object-contain" />
<h1>AmoToken Image Studio</h1>
<p>爱词元 AI 生图工作台</p>
```

Change the Settings “about” heading to `AmoToken Image Studio`; retain the upstream project link as attribution. Search user-facing TSX/JSON for old default shell wording and update only branding, not internal type names, local-storage keys, API paths, or upstream attribution.

- [ ] **Step 5: Verify and commit branding**

Run: `npm.cmd run test:run -- frontend/src/app/__tests__/branding-metadata.test.ts frontend/src/components/__tests__/SettingsModal.test.tsx frontend/src/components/workspace`

Run: `rg -n "Nova Image logo|>Nova Image<|Nova Image - AI|Nova Image Studio - AI" frontend/src frontend/public/manifest.json`

Expected: tests PASS; search has no old default shell branding, while attribution may remain.

```powershell
git add frontend/public frontend/src/app/layout.tsx frontend/src/app/__tests__/branding-metadata.test.ts frontend/src/components/SettingsModal.tsx frontend/src/components/workspace
git commit -m "feat: apply AmoToken Image Studio branding"
```

### Task 3: Build The Safe Popup Client

**Files:**
- Create: `frontend/src/lib/amotoken-key-picker.ts`
- Create: `frontend/src/lib/__tests__/amotoken-key-picker.test.ts`

- [ ] **Step 1: Write failing tests for popup and message validation**

Cover: 32 random bytes encoded as 64 lowercase hex characters; URL contains only `callback_origin` and `state`; wrong event origin/source/state is ignored; exact valid message resolves the key; popup-blocked, closed, and timeout paths reject; all listeners/timers are cleaned up.

Use this message contract:

```ts
export interface AmoTokenKeyPickerMessage {
  source: 'amotoken-image-studio-key';
  state: string;
  key: string;
}
```

- [ ] **Step 2: Run the tests and confirm the missing module failure**

Run: `npm.cmd run test:run -- frontend/src/lib/__tests__/amotoken-key-picker.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the exact-origin popup flow**

Export `requestAmoTokenImageToken(options?)`. Default console origin is `https://amotoken.cc`; local tests can inject a console origin and clock functions. Generate state with `crypto.getRandomValues`, open:

```text
https://amotoken.cc/image-studio/connect?callback_origin=<encoded window.location.origin>&state=<64 hex chars>
```

Accept a message only when all are true:

```ts
event.origin === consoleOrigin
event.source === popup
event.data.source === 'amotoken-image-studio-key'
event.data.state === state
typeof event.data.key === 'string' && event.data.key.length > 0
```

Never print the URL after a key could be present, never put the key into navigation/history, close the popup on completion, and use a five-minute timeout.

- [ ] **Step 4: Run tests and commit**

Run: `npm.cmd run test:run -- frontend/src/lib/__tests__/amotoken-key-picker.test.ts`

Expected: PASS.

```powershell
git add frontend/src/lib/amotoken-key-picker.ts frontend/src/lib/__tests__/amotoken-key-picker.test.ts
git commit -m "feat: add secure AmoToken key picker client"
```

### Task 4: Connect The Picker To Settings With Manual Fallback

**Files:**
- Modify: `frontend/src/components/SettingsModal.tsx`
- Modify: `frontend/src/components/__tests__/SettingsModal.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Mock `requestAmoTokenImageToken`. Assert the new `从 AmoToken 选择生图密钥` button calls it, saves the returned key through the same registry path as manual paste, triggers `onApiKeyChange`, and shows `令牌已保存`. Assert a rejected popup leaves the existing token unchanged and presents a concise error. Keep the current manual paste test.

- [ ] **Step 2: Confirm failure**

Run: `npm.cmd run test:run -- frontend/src/components/__tests__/SettingsModal.test.tsx`

Expected: FAIL because the picker button is absent.

- [ ] **Step 3: Implement one shared save path**

Extract a component-local `saveToken(token: string)` used by both manual and popup paths. Add an icon+text button above the manual input, a loading label `正在打开 AmoToken…`, and keep Base URL/protocol/model ID hidden. Do not automatically open the popup on page load.

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd run test:run -- frontend/src/components/__tests__/SettingsModal.test.tsx`

Expected: PASS.

```powershell
git add frontend/src/components/SettingsModal.tsx frontend/src/components/__tests__/SettingsModal.test.tsx
git commit -m "feat: select image token from AmoToken settings"
```

### Task 5: Define And Enforce The Strict Quote-Free 1K Contract

**Files:**
- Create: `frontend/src/lib/amotoken-image-fallback.ts`
- Create: `frontend/src/lib/__tests__/amotoken-image-fallback.test.ts`
- Modify: `frontend/src/lib/workspace-task-service.ts`
- Modify: `frontend/src/lib/__tests__/workspace-task-service.test.ts`

- [ ] **Step 1: Write failing fallback contract and service tests**

Test that the fallback catalog contains one `gpt-image-2` option for generation and edit, only 1K sizes (`1024x1024`, `1536x1024`, `1024x1536`), quality `auto`, count 1, and at most one reference. Add service tests proving: a valid quote is still checked; a missing quote is accepted only for strict fallback text/edit inputs; 2K, count 2, another model, non-auto quality, or two references without a quote is rejected before `createNovaTask`; accepted fallback jobs/task payloads omit `imageQuote`; stored cards do not invent a cost.

- [ ] **Step 2: Confirm failure**

Run: `npm.cmd run test:run -- frontend/src/lib/__tests__/amotoken-image-fallback.test.ts frontend/src/lib/__tests__/workspace-task-service.test.ts`

Expected: FAIL because the fallback module does not exist and submit input currently requires a quote.

- [ ] **Step 3: Implement the fallback catalog and one service authorization function**

Export `LEGACY_AMOTOKEN_IMAGE_CATALOG` and `isLegacyAmoTokenImageSubmission` from the new module. The guard returns true only for provider model `gpt-image-2`, output tier `1K`, one output, an allowed 1K size, quality `auto`, and reference count 0 or 1.

Change both submit input interfaces and `createBaseJob` to `quote?: AmoTokenImageQuote`. Add one `submissionHasValidBillingContext(...)` function:

```ts
if (input.quote) return quoteMatchesSubmission(input.quote, input, mode, providerModel, referenceCount, token);
return isLegacyAmoTokenImageSubmission({
  providerModel,
  mode,
  outputSize: input.outputSize,
  size: input.customSize,
  quality: input.gptImageQuality,
  count: input.parallelCount,
  referenceImageCount: referenceCount,
});
```

Pass `imageQuote: input.quote` to the task client; JSON serialization omits it when undefined. Do not weaken `quoteMatchesSubmission`.

- [ ] **Step 4: Run focused tests and commit**

Run: `npm.cmd run test:run -- frontend/src/lib/__tests__/amotoken-image-fallback.test.ts frontend/src/lib/__tests__/workspace-task-service.test.ts`

Expected: PASS.

```powershell
git add frontend/src/lib/amotoken-image-fallback.ts frontend/src/lib/__tests__/amotoken-image-fallback.test.ts frontend/src/lib/workspace-task-service.ts frontend/src/lib/__tests__/workspace-task-service.test.ts
git commit -m "feat: guard quote-free legacy image tasks"
```

### Task 6: Use The Fallback When Catalog And Quote APIs Are Unavailable

**Files:**
- Modify: `frontend/src/components/ImageGenerationWorkbench.tsx`
- Modify: `frontend/src/components/__tests__/ImageGenerationWorkbench.test.tsx`

- [ ] **Step 1: Write failing workbench behavior tests**

Test that a 404/503 catalog response installs the fallback option and shows `精确报价暂不可用`. Assert both text submission and a one-reference-image edit become enabled without calling `/api/nova/image-products/quote`, and their submit callbacks receive `quote: undefined`. Preserve existing tests proving exact quote display and submit-time revalidation when the catalog succeeds.

- [ ] **Step 2: Confirm failure**

Run: `npm.cmd run test:run -- frontend/src/components/__tests__/ImageGenerationWorkbench.test.tsx`

Expected: FAIL because catalog errors currently block submission.

- [ ] **Step 3: Implement explicit exact-versus-legacy catalog mode**

Track `catalogSource: 'exact' | 'legacy'`. On catalog fetch failure, install `LEGACY_AMOTOKEN_IMAGE_CATALOG`, set source `legacy`, clear quote state, and keep the workbench usable. Skip quote fetching in legacy mode, show `精确报价暂不可用`, and allow submit only when `isLegacyAmoTokenImageSubmission(...)` is true. In exact mode retain the current active-quote and submit-time re-quote requirements unchanged. The submit handler branches once: exact mode re-quotes and forwards the result; legacy mode forwards `quote: undefined` directly.

- [ ] **Step 4: Verify and commit**

Run: `npm.cmd run test:run -- frontend/src/components/__tests__/ImageGenerationWorkbench.test.tsx frontend/src/lib/__tests__/workspace-task-service.test.ts`

Expected: PASS.

```powershell
git add frontend/src/components/ImageGenerationWorkbench.tsx frontend/src/components/__tests__/ImageGenerationWorkbench.test.tsx
git commit -m "feat: allow guarded 1k generation without catalog"
```

### Task 7: Full Local Verification And Real Image Tests

**Files:**
- Create screenshots under `D:\MyProject\AmoToken\output\playwright\` (do not commit them).
- Modify only a file named in Tasks 1-6 when a verification failure proves that task incomplete; add a focused regression test before the fix.

- [ ] **Step 1: Run the complete Nova checks**

Run: `npm.cmd run test:run`

Expected: all existing and new Vitest tests pass.

Run: `npm.cmd run lint`

Expected: no lint errors.

Run: `npm.cmd run build`

Expected: Next.js production build succeeds.

- [ ] **Step 2: Replace only the stale local preview**

Confirm the listener owner before stopping it:

```powershell
Get-NetTCPConnection -LocalPort 43200 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess
Get-CimInstance Win32_Process -Filter "ProcessId=<OwningProcess>" | Select-Object ProcessId,CommandLine
```

Stop it only if it is the known local Nova `node backend/server.js`. Start this worktree with hidden process environment `NODE_ENV=production`, `HOSTNAME=127.0.0.1`, and `PORT=43200`; redirect stdout/stderr to ignored local files. Do not touch any remote host.

- [ ] **Step 3: Verify layout in a real browser**

Using the Playwright skill, capture wide `1440x1000` and mobile `390x844` screenshots. Check AmoToken logo/title, three boats on wide and two on mobile, no content overlap, no horizontal overflow, readable light/dark themes, and reduced-motion mode. Save as:

```text
D:\MyProject\AmoToken\output\playwright\image-studio-brand-wide.png
D:\MyProject\AmoToken\output\playwright\image-studio-brand-mobile.png
```

- [ ] **Step 4: Run the real 1K tests without exposing a token**

Pause for the user to paste an existing low-quota `生图专用` token into the local settings UI; do not ask them to send it in chat. Then generate one 1K, 1:1 text image through `https://amotoken.cc/v1`, use that result as the sole reference for a 1K edit, and verify both cards complete with downloadable images. Confirm the network/task logs contain no raw token and the UI says `精确报价暂不可用` rather than showing a fabricated price.

- [ ] **Step 5: Verify the popup against local NewAPI after its companion plan is complete**

With local NewAPI authenticated and callback allowlist containing both local port origins, select an enabled `生图专用` key, verify the popup closes and Nova saves it, then test wrong-state and wrong-origin messages are ignored. No production deployment is needed.

- [ ] **Step 6: Final diff and commit**

Run: `git status --short`

Run: `git diff --check`

Run: `git log --oneline --decorate -8`

Expected: only intended source/docs/assets are tracked; no token, DB, log, screenshot, cache, or build output is staged.

Commit any scoped verification fix separately, then stop. Do not merge or deploy without explicit user approval.
