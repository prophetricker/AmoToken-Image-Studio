import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCompatibleRetryData,
} from '@/lib/model-capabilities';
import { AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID, AMOTOKEN_IMAGE_MODEL_ID, saveAmoTokenToken } from '@/lib/nova-models';
import type { StoredJob } from '@/lib/job-store';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  delete process.env.NEXT_PUBLIC_NOVA_CANDIDATE_MODES;
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  });
});

describe('legacy AmoToken job compatibility', () => {
  it('migrates an old backup alias to the stable registry model for retry', () => {
    saveAmoTokenToken('sk-live-token');
    const job: StoredJob = {
      id: 'legacy-job',
      status: 'failed',
      mode: 'text-to-image',
      prompt: 'legacy prompt',
      output_size: '1K',
      temperature: 1,
      aspect_ratio: '1:1',
      model: AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
      created_at: '2026-07-22T00:00:00.000Z',
    };

    expect(getCompatibleRetryData(job).model).toBe(AMOTOKEN_IMAGE_MODEL_ID);
  });
});
