# Prompt Gallery Maintenance Design

## Goal

Keep the public prompt gallery near 1,000 image-backed, useful prompts, refresh it slowly from multiple sources, and prevent transient source failures from shrinking the gallery. This release also applies low-risk dependency maintenance. It changes Nova only and must stop before replacing or restarting the running production container.

## Current Findings

- Production `/api/nova/prompts` returns 494 records from only `davidwu-gpt-image2-prompts`.
- The public page shows 326 records because 168 records match the current 491-keyword blacklist.
- The six currently reachable source adapters return 2,261 candidates in total and about 1,090 records after the existing public filter.
- `EvoLinkAI/awesome-gpt-image-2-API-and-Prompts` currently returns 404 and must not be treated as a successful empty source.
- The image cache contains 324 files and uses about 106 MB. The existing 512 MB limit is sufficient.
- The backend production dependency audit has one high-severity finding in `undici`. Frontend findings are primarily builder dependencies; Vitest and Next.js have compatible patch releases, while `next-pwa` requires a separate migration rather than a forced audit downgrade.

## Published Gallery Policy

- The initial refresh may grow the public gallery directly from 326 to a target of 1,000 records.
- The steady-state target range is 950 to 1,050 published records.
- After the initial refresh, one scheduled refresh may add at most 20 new records and retire at most 20 old records.
- A published record must have a non-empty title, a usable prompt, and at least one allowed HTTP image URL.
- Prompt content is normalized and deduplicated by a stable content hash. Duplicate records keep the higher-quality source metadata and image.
- Selection is deterministic. It preserves still-valid published records first, then fills vacancies from ranked candidates so a refresh does not reshuffle the whole gallery.
- No source may occupy more than 40 percent of the published gallery and no category may occupy more than 25 percent when enough alternatives exist.
- Empty categories are not returned to the frontend.

Quality ranking favors complete Chinese-facing titles, substantive prompts, working image references, known source metadata, and category diversity. It rejects malformed records and obvious spam rather than attempting an expensive model-based quality review.

## Content Filtering

The current blacklist mixes explicit safety terms with neutral photography and clothing vocabulary. The public filter will keep direct blocking for unambiguous explicit, violent, illegal, and other prohibited phrases. Ambiguous terms such as `chest`, `collar`, `leather`, `thick`, `wet`, and `exposure` will not block a record by themselves.

Filtering remains deterministic and local, so refreshing the gallery consumes no model tokens. It is a gallery curation layer, not a promise that a downstream image model will accept every published prompt.

## Sources

The service will activate the six existing reachable adapters:

- `unknowlei/nanobanana-website`
- `ZeroLu/awesome-gpt-image`
- `ImgEdify/Awesome-GPT4o-Image-Prompts`
- `YouMind-OpenLab/awesome-gpt-image-2`
- `YouMind-OpenLab/awesome-nano-banana-pro-prompts`
- `davidwuw0811-boop/awesome-gpt-image2-prompts`

The first source expansion adds adapters for the MIT-licensed `ZeroLu/awesome-nanobanana-pro` and `wuyoscar/GPT-Image2-Skill` repositories. Every adapter carries source and license metadata, a parser fixture, and a minimum expected record count. A parser returning zero records or dropping below its minimum is considered failed and cannot overwrite its last-good snapshot.

The dead EvoLink source remains disabled until its repository exposes a valid data path again.

## Server Architecture

Prompt aggregation moves behind the Nova backend. Browsers read only Nova's snapshot and no longer fan out requests to GitHub or `proxy.ccode.vip`.

Persistent files live under the existing mounted data directory:

- `data/prompt-gallery/sources/<source-id>.json`: one last-good snapshot per source
- `data/prompt-gallery/published.json`: the stable public selection
- `data/prompt-gallery/manifest.json`: source counts, refresh timestamps, errors, and snapshot versions

The bundled `backend/prompts.json` remains a cold-start fallback. Writes use a temporary file plus atomic rename so a crash cannot leave partial JSON.

The refresh worker starts after a 60-second delay and runs every 72 hours. It fetches at most two sources concurrently, uses a 25-second timeout per attempt, tries direct GitHub raw content before the existing proxy fallback, and preserves last-good data on timeout, non-2xx responses, parser errors, or suspicious count collapse. Refreshing text snapshots does not prefetch images.

`GET /api/nova/prompts` returns the published snapshot. A read-only `GET /api/nova/prompts/meta` endpoint returns source status, candidate counts, published count, and refresh times without credentials or internal filesystem paths.

## Frontend Behavior

- The existing gallery layout, search, categories, lazy rendering, and asset-library workflow remain unchanged.
- The displayed total reflects the stable server snapshot after public filtering.
- The frontend does not fall back to live external aggregation when the server returns a valid snapshot.
- If no persisted or bundled snapshot can be read, the gallery shows an unavailable state instead of a fluctuating partial result.
- Prompt images continue through `/api/nova/prompt-gallery/image` and the existing bounded lazy cache.

## Dependency Maintenance

- Upgrade backend `undici` to the compatible 8.x fixed release and apply compatible patch/minor lockfile updates.
- Upgrade Next.js and Vitest to fixed compatible patch releases, then rerun complete tests and production builds.
- Do not run `npm audit fix --force` and do not accept the audit suggestion to downgrade `next-pwa`.
- Record remaining builder-only findings after the update. Replacing `next-pwa` and its Workbox chain is a separate maintenance change because it alters service-worker behavior.

## Verification

- Backend tests cover per-source last-good retention, count-collapse rejection, atomic snapshot writes, deterministic deduplication, category/source caps, 20-record rotation limits, and metadata output.
- Parser fixture tests cover every enabled source without depending on live network access.
- Frontend tests cover stable snapshot loading, empty-category removal, unavailable state, and the corrected safety-filter behavior.
- The complete frontend and backend test suites and the production Docker build must pass locally.
- A local browser check confirms approximately 1,000 cards, working search/categories, lazy image loading, and no unexpected external browser requests.
- A read-only production preflight checks disk, memory, mounts, port binding, and the current container. The work stops before building, replacing, restarting, or reconfiguring the production Nova container.

## Production Boundary

This work does not modify NewAPI, image channel priorities, image pricing, DNS, Nginx, or production credentials. Deployment requires a separate explicit approval after the local preview and verification results are presented.
