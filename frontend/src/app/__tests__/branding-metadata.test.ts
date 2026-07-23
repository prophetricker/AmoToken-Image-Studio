import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('AmoToken Image Studio branding', () => {
  it('uses AmoToken metadata and transparent logo assets', () => {
    const manifest = JSON.parse(readSource('public/manifest.json')) as {
      name: string;
      short_name: string;
      description: string;
      screenshots: Array<{ label: string }>;
    };
    const layout = readSource('src/app/layout.tsx');

    expect(manifest.name).toBe('AmoToken Image Studio');
    expect(manifest.short_name).toBe('AmoToken Image');
    expect(manifest.description).toContain('AmoToken');
    expect(manifest.screenshots.every(item => item.label.includes('AmoToken'))).toBe(true);
    expect(layout).toContain('AmoToken Image Studio');
    expect(layout).toContain('/amotoken.png');
  });

  it('replaces old visible shell marks without removing attribution', () => {
    const header = readSource('src/components/workspace/WorkspaceHeader.tsx');
    const shell = readSource('src/components/workspace/WorkspaceShell.tsx');
    const settings = readSource('src/components/SettingsModal.tsx');
    const visibleShell = `${header}\n${shell}`;

    expect(visibleShell).toContain('/amotoken.png');
    expect(visibleShell).toContain('AmoToken Image Studio');
    expect(visibleShell).not.toContain('Nova Image logo');
    expect(visibleShell).not.toMatch(/>Nova Image</);
    expect(settings).toContain('AmoToken Image Studio');
    expect(settings).toContain('tianjiangqiji/nova-image-studio');
  });
});
