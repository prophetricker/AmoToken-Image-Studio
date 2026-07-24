# Image Studio Theme Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the animated harbor background and align Image Studio with AmoToken's homepage palette.

**Architecture:** Keep the existing workbench structure intact. Remove the isolated decorative scene at its single composition point, then remap the shared CSS semantic tokens so existing components inherit the new palette consistently.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4, Vitest, Playwright visual inspection.

---

### Task 1: Remove The Harbor Decoration

**Files:**
- Modify: `frontend/src/components/workspace/WorkspaceShell.tsx`
- Delete: `frontend/src/components/brand/AmoTokenHarborScene.tsx`
- Delete: `frontend/src/components/brand/amotoken-harbor.css`
- Delete: `frontend/src/components/brand/harbor-boat.tsx`
- Delete: `frontend/src/components/brand/harbor-fleet.ts`
- Delete: `frontend/src/components/brand/__tests__/AmoTokenHarborScene.test.tsx`

- [x] Remove the scene import and render point from `WorkspaceShell`.
- [x] Delete the unused harbor implementation and its obsolete component tests.
- [x] Run `rg -n "AmoTokenHarborScene|amotoken-studio-wave|amotoken-studio-boat|data-harbor-boat" frontend/src --glob '!**/__tests__/**'` and expect no matches.

### Task 2: Remap The Shared Theme

**Files:**
- Modify: `frontend/src/app/globals.css`

- [x] Replace light semantic tokens with the AmoToken teal, mint, coral, and warm-neutral palette.
- [x] Replace explicit and system-preference dark tokens with deep-teal surfaces and accessible mint accents.
- [x] Preserve success, error, warning, and processing semantics.

### Task 3: Verify The Workbench

**Files:**
- Test: `frontend/src/components/**/__tests__/*.test.tsx`
- Test: `frontend/src/lib/__tests__/*.test.ts`

- [x] Run `npm.cmd run test:run` in `frontend` and expect all tests to pass.
- [x] Run ESLint against the changed TypeScript files and confirm no new errors; record unrelated existing full-repository lint failures.
- [x] Run `npm.cmd run build` in `frontend` and expect a successful production build.
- [x] Inspect `http://127.0.0.1:43200` at desktop and mobile widths in light and dark modes; confirm no boats or waves, no overflow, and readable contrast.
