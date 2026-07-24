import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('production Compose safeguards', () => {
  it('limits Nova resources so it cannot starve NewAPI', () => {
    const compose = readFileSync(resolve(process.cwd(), '..', 'docker-compose.yml'), 'utf8');

    expect(compose).toContain('cpus: "1.5"');
    expect(compose).toContain('mem_limit: "1536m"');
    expect(compose).toContain('memswap_limit: "1536m"');
  });
});
