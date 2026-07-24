# Image Studio Theme Alignment Design

## Goal

Remove the animated harbor decoration from AmoToken Image Studio and align the existing workbench with the AmoToken homepage color system without changing layout or behavior.

## Visual Direction

- Remove all boats, waves, pointer-following motion, and harbor animation layers.
- Keep the current dense workbench layout and existing AmoToken logo treatment.
- Use deep teal for primary actions and focus states, mint for secondary data accents, coral for selective emphasis, and warm neutral surfaces in light mode.
- Use deep teal surfaces with mint primary accents in dark mode. Preserve semantic green, red, and amber status colors.

## Implementation Boundary

- Remove the harbor scene import and render point from `WorkspaceShell`.
- Delete the now-unused harbor scene, fleet, boat renderer, styles, and component tests.
- Remap semantic theme tokens in `globals.css`; do not add component-level color overrides.
- Do not change key selection, generation behavior, routing, layout, or server configuration.

## Verification

- Confirm no harbor component or animation selectors remain in the frontend source.
- Run frontend tests, lint, and production build.
- Inspect the local preview at desktop and mobile sizes in light and dark themes, checking contrast, overflow, and the absence of decorative motion.
