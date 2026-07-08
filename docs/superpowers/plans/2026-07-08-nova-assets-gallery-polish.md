# Nova Assets and Prompt Gallery Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the non-wide workspace navigation, make prompt gallery data resilient, add asset bulk tag tools, and make "add to assets" buttons show saved state with edited-asset duplicate semantics.

**Architecture:** Keep UI behavior client-side and dense. Move prompt gallery loading behind a stable `/api/nova/prompts` contract with external-source fallback metadata, while preserving the existing parser as a fallback. Extend asset-store duplicate detection so identical generated images can be re-added after the previous asset metadata was edited.

**Tech Stack:** Next.js 16, React 19, Vitest, Testing Library, local IndexedDB asset store, Node backend static API.

---

### Task 1: Workspace Tabs Stay Single Row

**Files:**
- Modify: `frontend/src/components/workspace/WorkspaceModeTabs.tsx`
- Test: `frontend/src/components/workspace/__tests__/WorkspaceModeTabs.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that renders `WorkspaceModeTabs` with `showPromptGallery` and asserts the tab list uses the five-column class:

```tsx
it('uses five columns when prompt gallery makes five public tabs', () => {
  const { container } = render(
    <Tabs value="image-generation">
      <WorkspaceModeTabs showPromptGallery />
    </Tabs>,
  );

  expect(container.querySelector('[role="tablist"]')).toHaveClass('sm:grid-cols-5');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm.cmd run test:run -- src/components/workspace/__tests__/WorkspaceModeTabs.test.tsx`

Expected: FAIL because the tab list currently falls back to `sm:grid-cols-3`.

- [ ] **Step 3: Write minimal implementation**

Change the grid column selection so `allTabs.length === 5` returns `sm:grid-cols-5`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm.cmd run test:run -- src/components/workspace/__tests__/WorkspaceModeTabs.test.tsx`

Expected: PASS.

### Task 2: Stable Prompt Gallery Source

**Files:**
- Modify: `frontend/src/lib/prompt-gallery-data.ts`
- Modify: `frontend/src/components/PromptGallery.tsx`
- Test: `frontend/src/lib/__tests__/prompt-gallery-data.test.ts`

- [ ] **Step 1: Write the failing tests**

Create tests for:
- `fetchStablePromptGallery()` reads `/api/nova/prompts` and returns mapped prompts when the local server has data.
- It falls back to `fetchAllPromptSources()` when `/api/nova/prompts` is empty or unavailable.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm.cmd run test:run -- src/lib/__tests__/prompt-gallery-data.test.ts`

Expected: FAIL because `fetchStablePromptGallery` does not exist.

- [ ] **Step 3: Write minimal implementation**

Add `fetchStablePromptGallery()` that fetches `/api/nova/prompts` first, normalizes either flat prompt arrays or section-shaped data into `PromptWithKey[]`, derives categories, then falls back to `fetchAllPromptSources()`.

- [ ] **Step 4: Wire PromptGallery**

Replace the direct `fetchAllPromptSources()` call in `PromptGallery.tsx` with `fetchStablePromptGallery()`.

- [ ] **Step 5: Run tests to verify pass**

Run: `cd frontend && npm.cmd run test:run -- src/lib/__tests__/prompt-gallery-data.test.ts`

Expected: PASS.

### Task 3: Asset Bulk Tags

**Files:**
- Modify: `frontend/src/components/assets/AssetsWorkspace.tsx`
- Test: `frontend/src/components/__tests__/AssetsWorkspace.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a test that selects the visible text asset, opens a bulk tag action, enters a new tag, saves, and expects `updateTextAsset` to be called with merged tags.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm.cmd run test:run -- src/components/__tests__/AssetsWorkspace.test.tsx`

Expected: FAIL because bulk tag controls do not exist.

- [ ] **Step 3: Write minimal implementation**

Add a compact "batch tags" toolbar button when one or more assets are selected. Add a dialog/popover with an input for tags to add and, when a tag filter is active, a one-click remove-current-tag action. Reuse `updateImageAsset` and `updateTextAsset`.

- [ ] **Step 4: Run test to verify pass**

Run: `cd frontend && npm.cmd run test:run -- src/components/__tests__/AssetsWorkspace.test.tsx`

Expected: PASS.

### Task 4: Add-to-Assets Saved Button State

**Files:**
- Modify: `frontend/src/lib/asset-store.ts`
- Modify: `frontend/src/lib/image-actions.ts`
- Modify: `frontend/src/components/workspace/results/CompletedJobCard.tsx`
- Modify: `frontend/src/components/workspace/results/ImageHoverActions.tsx`
- Modify: `frontend/src/components/workspace/results/HistoryImagePreview.tsx`
- Modify: `frontend/src/components/prompt-gallery/PromptGallerySubcomponents.tsx`
- Test: `frontend/src/lib/__tests__/image-actions-assets.test.ts`
- Test: `frontend/src/components/workspace/results/__tests__/CompletedJobCard.test.tsx` if needed.

- [ ] **Step 1: Write failing image action test**

Test that adding the same image with the same source returns the existing asset while it is unedited, but creates a new asset after the existing asset's metadata was updated. This is tested at the image-action layer with mocked asset-store functions because the project does not include fake IndexedDB for direct store tests.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm.cmd run test:run -- src/lib/__tests__/image-actions-assets.test.ts`

Expected: FAIL because add-to-assets currently uses plain hash duplicate detection.

- [ ] **Step 3: Write minimal store/action implementation**

Add a `metadataEditedAt?: number` field to image/text asset records, set it in update functions, and change `addImagePayloadToAssets()` to only treat the same source image as already existing when `metadataEditedAt` is absent.

- [ ] **Step 4: Add button-local state**

Make add-to-assets action return its result. Track saved payload ids in the visible image action components and show a check state after success. On repeat click, show "already added" without writing again.

- [ ] **Step 5: Run targeted tests**

Run all touched test files:

```powershell
cd frontend
npm.cmd run test:run -- src/components/workspace/__tests__/WorkspaceModeTabs.test.tsx src/lib/__tests__/prompt-gallery-data.test.ts src/components/__tests__/AssetsWorkspace.test.tsx src/lib/__tests__/image-actions-assets.test.ts
```

Expected: PASS.

### Task 5: Full Verification

**Files:**
- No new feature files.

- [ ] **Step 1: Run full frontend tests**

Run: `npm.cmd run test:run`

Expected: all tests pass, with no new failures beyond pre-existing warnings.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: build exits 0.

- [ ] **Step 3: Review diff**

Run: `git diff --stat` and `git diff --check`

Expected: no whitespace errors; diff is scoped to plan.
