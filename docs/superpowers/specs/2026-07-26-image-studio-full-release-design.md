# Image Studio Full Release Design

## Goal

Publish GIF generation and infinite canvas as normal Image Studio features while keeping every paid image request inside the AmoToken image product catalog. The release changes Nova only; NewAPI channel priorities, route costs, channel switches, and product prices remain administrator-managed.

## Product Behavior

- GIF and infinite canvas are visible by default for every visitor.
- `?novaCandidateModes=0` remains an emergency browser-local off switch. `?novaCandidateModes=1` restores the default.
- GIF generation creates one paid 2K sprite sheet and encodes the final GIF locally in the browser.
- The GIF sprite sheet is `2048x1536`, arranged as 4 columns by 3 rows, producing twelve `512x512` frames.
- GIF accepts at most three user reference images. The internal layout template is the fourth reference, matching the current product catalog maximum of four.
- GIF pricing comes from `/api/nova/image-products/quote`; no fixed RMB estimate is shown.
- Infinite canvas reads the same AmoToken catalog-backed model configuration as the normal generation workspace.
- Canvas requests must use a catalog-supported model, operation mode, output size, and reference-image count. Unsupported custom sizes are rejected before task creation.
- Text-to-image canvas generation remains available even when no reliable edit route exists. A canvas request containing reference images is unavailable until the catalog exposes a matching edit product.

## Architecture

Candidate feature visibility remains centralized in `candidate-capabilities.ts`, but changes from opt-in to default-on with a persistent emergency opt-out. GIF constants and model selection are normalized in `gif-job-store.ts`; the workflow obtains a short-lived quote immediately before task submission and passes it to the existing task client. Canvas gets a small catalog constraint layer that normalizes persisted configurations, derives allowed controls, and validates requests at the service boundary.

## Compatibility And Safety

- Existing saved GIF jobs continue to load; new submissions use the new grid specification.
- Existing canvas projects are not deleted. Invalid persisted settings are normalized to the current catalog defaults when edited or submitted.
- No NewAPI administrator configuration is changed by this release.
- Nova remains bound to `127.0.0.1:3001` in production and continues using its existing resource limits and mounts.
- A failed quote or unsupported product blocks submission before a paid task is created.

## Verification

- Unit tests cover default feature visibility, emergency override, GIF dimensions/reference limits/model selection/quote behavior, and canvas product validation.
- The complete frontend test suite and production build must pass.
- Desktop and mobile browser checks confirm all seven tabs are visible without a query parameter and that GIF/canvas surfaces have no overlap or horizontal overflow.
- Production smoke checks verify the public page, Nova health, loopback-only port binding, container restart count, and recent logs.
