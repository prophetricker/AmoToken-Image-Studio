import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const readFrontendSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('AmoToken workbench theme', () => {
  it('does not mount the animated harbor decoration', () => {
    const workspaceShell = readFrontendSource('src/components/workspace/WorkspaceShell.tsx');

    expect(workspaceShell).not.toContain('AmoTokenHarborScene');
  });

  it('uses the AmoToken homepage palette for light and dark themes', () => {
    const stylesheet = readFrontendSource('src/app/globals.css');

    expect(stylesheet).toContain('--primary: #14847d;');
    expect(stylesheet).toContain('--accent: #fce7df;');
    expect(stylesheet).toContain('--sidebar: #f4ecdd;');
    expect(stylesheet).toContain('--background: #081f23;');
    expect(stylesheet).toContain('--primary: #4fc092;');
  });
});
