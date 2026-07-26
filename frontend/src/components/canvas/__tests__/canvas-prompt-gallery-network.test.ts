import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('canvas prompt gallery network isolation', () => {
  it('never stores the original external image URL as a failed-import fallback', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/canvas/CanvasEditor.tsx'),
      'utf8',
    );

    expect(source).not.toMatch(/metadata:\s*\{\s*status:\s*["']success["'] as const,\s*content:\s*url/);
    expect(source).not.toContain('远程 URL 兜底');
    expect(source).toContain('Promise.allSettled');
    expect(source).toMatch(/await deleteStoredImages\(importedImages\.map/);
  });
});
