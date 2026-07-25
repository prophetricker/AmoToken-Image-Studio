# Image Studio Full Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose GIF generation and infinite canvas globally while ensuring their paid requests use only products supported by the live AmoToken image catalog.

**Architecture:** Keep feature visibility, GIF workflow rules, and canvas product validation in separate focused modules. Reuse the existing quote and task APIs so NewAPI remains the authority for token access, product availability, charging, and channel routing.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Zustand, Playwright, Docker.

---

### Task 1: Publish Candidate Features By Default

**Files:**
- Modify: `frontend/src/lib/candidate-capabilities.ts`
- Test: `frontend/src/lib/__tests__/candidate-capabilities.test.ts`

- [ ] Replace the hidden-by-default assertion with assertions that both capability resolvers return `true` without build flags, URL parameters, or storage.
- [ ] Run `npm.cmd run test:run -- src/lib/__tests__/candidate-capabilities.test.ts` from `frontend/` and confirm the new assertion fails because the current default is `false`.
- [ ] Change the resolver fallback to enabled while preserving `?novaCandidateModes=0` as a persistent opt-out and `?novaCandidateModes=1` as an opt-in.
- [ ] Add a test proving the stored disabled preference remains effective without a query parameter.
- [ ] Run the focused test and confirm it passes.

### Task 2: Make GIF Generation Catalog-Compatible

**Files:**
- Modify: `frontend/src/lib/gif-job-store.ts`
- Modify: `frontend/src/hooks/useGifWorkflow.ts`
- Modify: `frontend/src/components/GifGenerationWorkspace.tsx`
- Modify: `frontend/src/components/gif/GifParametersPanel.tsx`
- Modify: `frontend/src/components/gif/GifReviewPanel.tsx`
- Test: `frontend/src/lib/__tests__/gif-job-store.test.ts`
- Test: `frontend/src/hooks/__tests__/useGifWorkflow.test.tsx`
- Test: `frontend/src/components/gif/__tests__/GifPanels.test.tsx`

- [ ] Add failing tests asserting `GIF_GRID_CUSTOM_SIZE === '2048x1536'`, the twelve frames are `512x512`, `GIF_MAX_REF_IMAGES === 3`, and the normal catalog-backed AmoToken model is selected.
- [ ] Run the GIF store test and confirm the old 3264x2448/6-reference/4K-gray behavior fails those assertions.
- [ ] Update GIF constants and model filtering so the normal 2K-capable AmoToken image model is offered without the gray 4K alias.
- [ ] Run the GIF store tests and confirm they pass.
- [ ] Add a failing workflow test asserting submission requests an edit quote for 2K, custom size 2048x1536, count 1, and template-plus-user reference count.
- [ ] Update `submitGrid` to obtain a fresh bound quote immediately before calling `createNovaTask`, then pass the quote through the existing task client contract.
- [ ] Run the workflow tests and confirm they pass.
- [ ] Add a failing panel test asserting the displayed estimate is the live quote text and contains no hard-coded RMB range or 4K requirement.
- [ ] Update the GIF workspace and panels with loading, unavailable, and quoted price states while retaining the statement that local GIF encoding has no extra charge.
- [ ] Run all focused GIF tests and confirm they pass.

### Task 3: Constrain Infinite Canvas To The Catalog

**Files:**
- Create: `frontend/src/components/canvas/canvas-product-policy.ts`
- Modify: `frontend/src/components/canvas/canvas-generation-service.ts`
- Modify: `frontend/src/components/canvas/components/canvas-config-node-panel.tsx`
- Modify: `frontend/src/components/canvas/stores/use-canvas-config-store.ts`
- Test: `frontend/src/components/canvas/__tests__/canvas-product-policy.test.ts`
- Test: `frontend/src/components/canvas/__tests__/canvas-generation-service.test.ts`

- [ ] Add policy tests for selecting the AmoToken catalog model, defaulting to 1K, removing unsupported custom sizes, keeping generation available, and disabling edit when no matching edit product exists.
- [ ] Run the policy test and confirm it fails because the policy module does not exist.
- [ ] Implement pure catalog normalization and validation helpers in `canvas-product-policy.ts` using the existing model registry and fetched product catalog types.
- [ ] Run the policy test and confirm it passes.
- [ ] Add service tests asserting unsupported custom size and unsupported edit requests fail before `createNovaTask`, while a supported generation request reaches it.
- [ ] Add service-boundary validation and a fresh quote before task creation.
- [ ] Run the canvas service tests and confirm they pass.
- [ ] Update persisted canvas defaults and the config panel so unsupported controls cannot be selected and unavailability is explained next to the Generate command.
- [ ] Run all focused canvas tests and confirm they pass.

### Task 4: Full Verification And Visual Review

**Files:**
- Modify only files required by failures found during verification.

- [ ] Run `npm.cmd run test:run` from `frontend/` and confirm all tests pass.
- [ ] Run `npm.cmd run build` from the repository root and confirm the production frontend and backend build completes.
- [ ] Start the local production preview on an unused loopback port.
- [ ] Use Playwright at desktop and mobile widths to verify all seven tabs appear without a query, GIF and canvas render, text does not overlap, and the page has no horizontal overflow.
- [ ] Visit `?novaCandidateModes=0` and confirm the emergency off switch hides GIF and canvas only for that browser.
- [ ] Review `git diff --check`, `git status --short`, and the final diff for unrelated changes.

### Task 5: Commit, Push, Deploy Nova, And Smoke Test

**Files:**
- No additional source files expected.

- [ ] Commit the verified release on `feature/image-studio-full-release` and push the branch.
- [ ] Build a new Nova image on `64.90.3.77` from the pushed commit without rebuilding or replacing NewAPI.
- [ ] Replace only the Nova container, preserving data mounts, environment, CPU limit 1.5, RAM limit 1536 MB, restart policy, and `127.0.0.1:3001` binding.
- [ ] Verify `https://img.amotoken.cc/` and the local Nova health endpoint return 200.
- [ ] Verify the Nova container has zero restarts, no OOM state, and no new fatal errors in recent logs.
- [ ] Verify public TCP port 3001 remains inaccessible.
- [ ] Report that feature/UI smoke checks passed, and explicitly distinguish them from a paid end-to-end GIF generation test unless a valid user token was used.
