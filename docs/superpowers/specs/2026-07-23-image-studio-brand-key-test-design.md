# AmoToken Image Studio Brand and Key Test Design

## Goal

Make the local Nova Image Studio preview visibly consistent with the AmoToken
homepage, provide a safe way to choose a user's `生图专用` token from
the AmoToken console, and make the local preview capable of a real image
generation test without deploying production.

## Scope and Branches

- Nova work is implemented on `feature/image-studio-brand-key-test`, forked
  from `feature/image-product-catalog`.
- NewAPI key-picker work is implemented on
  `feature/image-studio-key-picker`, forked from
  `feature/image-product-routing`.
- The two parent branches remain unchanged.
- No production deployment is included in this change.

## Visual Design

Use `docs/amotoken.png` as the product mark for the Nova header, wide-mode
sidebar, metadata, and PWA icons. The page title and visible product copy use
`AmoToken Image Studio`; no Nova default mark remains in the user-facing shell.

Reuse the existing AmoToken homepage harbor implementation for the motion
language: shallow layered waves, two or three small boats, bounded horizontal
motion, and pointer influence. The scene is a background layer with
`pointer-events: none`, does not change document flow, and is clipped by the
workspace shell. Motion is reduced or paused when the user enables reduced
motion. Existing workspace controls, task cards, and light/dark theme tokens
remain the source of truth for content surfaces.

The effect is intentionally restrained: no full-screen marketing hero, no
opaque color block behind the workbench, and no continuous canvas animation.

## Key Selection Flow

Nova settings keeps manual token paste as a fallback and adds an explicit
`Select AmoToken image token` action. The action opens a same-origin console
page at the AmoToken host in a popup.

The console page:

1. Requires the normal dashboard session.
2. Lists only tokens owned by the current user whose group is exactly
   `生图专用`.
3. Shows token name, status, remaining quota, and model-limit summary, but not
   the raw token.
4. Returns a token only after an explicit user selection.

The return channel uses `postMessage` with a random state value. The target
origin is validated against a server-side allowlist before the raw key is
returned. Production allows `https://img.amotoken.cc`; local verification
allows `http://127.0.0.1:43200` and `http://localhost:43200`. The raw key is
never placed in a URL and no wildcard credentialed CORS is added.

The NewAPI endpoint rechecks ownership and the exact token group at the moment
the key is revealed. This prevents a modified browser page from using the
picker to reveal a different group token.

## Local Real-Image Test

The first local generation test points Nova at `https://amotoken.cc/v1` and
uses an existing low-quota image token pasted manually. This verifies the real
OpenAI-compatible image request and result polling without waiting for a
production deployment of the picker.

The local test matrix is:

- one `gpt-image-2` text-to-image request at 1K, 1:1, one image;
- one single-image edit request using the generated output;
- one failed request using a deliberately invalid prompt or invalid model,
  confirming the concise failure card and no fabricated cost;
- one popup key-picker flow against a local NewAPI process using the test
  allowlist.

The image request must remain server-task based. The browser submits a task,
the Nova backend calls the configured API base URL with the selected token,
and the browser polls the task result. No token is logged or included in task
logs.

## Non-goals

- No server deployment, DNS change, Basic Auth change, or production database
  mutation.
- No replacement of NewAPI's token, billing, routing, or channel ownership
  logic.
- No public image gallery, GIF, canvas, or new image provider in this change.

## Acceptance Criteria

- A fresh local page visibly uses the AmoToken mark and harbor visual language
  at both wide and narrow viewports.
- Reduced-motion mode keeps the page usable and stops decorative motion.
- The picker never displays or returns a token outside the exact image group.
- An explicit selection is required before a raw token reaches Nova.
- Local 1K text-to-image and image-to-image requests can complete through the
  real AmoToken API with a low-quota test token.
- Existing Nova tests remain green and no parent branch changes.
