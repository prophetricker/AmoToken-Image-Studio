# Nova Image Studio Dependency Audit - 2026-07-26

## Scope and runtime boundary

This maintenance pass updates only the five compatible dependency ranges requested for Nova Image Studio. It does not run `npm audit fix --force`, downgrade `next-pwa`, or change service-worker behavior.

The Dockerfile has two materially different dependency boundaries:

- `frontend-builder` runs `npm ci` and `npm run build`, but the production stage copies only `/app/frontend/out/`. Frontend `node_modules` is not copied into the runtime image. Even the frontend `--omit=dev` audit therefore describes packages classified as production dependencies by npm that are installed in the builder stage, not a Node dependency tree shipped in the production stage.
- `backend-deps` runs `npm ci --omit=dev`, and the production stage copies `/app/backend/node_modules/`. The backend production audit directly represents Node packages copied into the runtime image.

## Changes applied

| Area | Package | Manifest range | Locked version |
| --- | --- | --- | --- |
| Backend | `better-sqlite3` | `^12.5.0` to `^12.11.1` | `12.10.0` to `12.11.1` |
| Backend | `undici` | `^8.2.0` to `^8.9.0` | `8.3.0` to `8.9.0` |
| Backend | `ws` | `^8.20.0` to `^8.21.1` | `8.21.0` to `8.21.1` |
| Frontend | `next` | `^16.2.4` to `^16.2.12` | `16.2.6` to `16.2.12` |
| Frontend | `vitest` | `^3.2.4` to `^3.2.7` | `3.2.4` to `3.2.7` |

`next-pwa` remains at manifest range `^5.6.0` and locked version `5.6.0`. The successful frontend build still generates and registers the existing Workbox service worker.

## Audit results

The commands were run with npm 11.9.0 against `https://registry.npmjs.org/` after regenerating the lockfiles.

At audit time, the registry's Cloudflare response for the larger frontend advisory requests returned gzip bytes without a `Content-Encoding` header, causing npm's initial JSON parse to fail. The frontend commands were rerun with a process-local, ignored preloader that restored only the missing response header for the bulk advisory endpoint. It did not modify the request inventory, response body, lockfiles, or committed files. The counts below are npm's parsed audit results.

| Command | Low | Moderate | High | Critical | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| `cd frontend; npm audit --json` | 2 | 3 | 13 | 0 | 18 |
| `cd frontend; npm audit --omit=dev --json` | 0 | 0 | 10 | 0 | 10 |
| `cd backend; npm audit --omit=dev --json` | 0 | 0 | 0 | 0 | 0 |

### Frontend full audit package names

- Low: `body-parser`, `esbuild`
- Moderate: `@hono/node-server`, `@modelcontextprotocol/sdk`, `shadcn`
- High: `brace-expansion`, `fast-uri`, `hono`, `js-yaml`, `next`, `next-pwa`, `postcss`, `rollup-plugin-terser`, `serialize-javascript`, `sharp`, `vite`, `workbox-build`, `workbox-webpack-plugin`

### Frontend omit-dev audit package names

- High: `brace-expansion`, `fast-uri`, `next`, `next-pwa`, `postcss`, `rollup-plugin-terser`, `serialize-javascript`, `sharp`, `workbox-build`, `workbox-webpack-plugin`

### Backend omit-dev audit package names

No findings.

## Remaining findings

- The backend production dependency tree copied into the runtime image has no audit findings after the compatible upgrades.
- npm still reports `next` as high because its installed tree reaches current `postcss` and `sharp` advisories. The requested Next upgrade is applied, but the current audit is not fully clean and this report does not claim otherwise.
- `next-pwa`, `workbox-webpack-plugin`, `workbox-build`, `rollup-plugin-terser`, and `serialize-javascript` remain a deferred builder-chain maintenance item. npm's suggested automatic fix downgrades `next-pwa` to `2.0.2`, which is not an acceptable compatible remediation. A later migration or replacement must preserve the existing service-worker behavior and be tested separately.
- `brace-expansion` and `fast-uri` remain high findings in npm's frontend production classification. They are still confined to frontend builder `node_modules` by the current Dockerfile.
- The full audit additionally reports the dev/tooling-only package names listed above. These are builder-side findings and were outside this compatible, five-package update.
- npm suggests incompatible or misleading major-version fixes for some aggregate findings, including a Next downgrade to `9.3.3`; no forced audit fix was applied.

## Verification

| Command | Result |
| --- | --- |
| `cd backend; npm test` | Passed, 12/12 tests |
| `cd backend; npm run lint` | Passed |
| `cd frontend; npm run test:run` | Passed, 217/217 tests; existing React `act(...)` warnings remain |
| `cd frontend; npm run build` | Passed with Next 16.2.12 and existing PWA generation |
| `cd frontend; npm run lint` | Failed with 6 errors and 4 warnings in untouched source files |

The frontend lint findings are outside the dependency-only change: two `no-explicit-any` errors in `CanvasEditor.tsx`, React hook state/ref errors in `image-annotation-editor.tsx` and `PromptGalleryAccess.tsx`, and a `no-require-imports` error in `reverse-prompt-config.ts`, plus four warnings. No source file or ESLint package changed in this task.
