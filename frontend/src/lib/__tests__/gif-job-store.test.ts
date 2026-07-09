import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CANDIDATE_MODES_STORAGE_KEY } from '@/lib/candidate-capabilities';
import { getDefaultGifModelId, getGifCompatibleModels } from '@/lib/gif-job-store';
import { resolveImageTaskProvider } from '@/lib/ccode-task-client';
import {
  AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID,
  AMOTOKEN_IMAGE_MODEL_ID,
  saveAmoTokenToken,
} from '@/lib/nova-models';

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

describe('GIF gray-test model selection', () => {
  it('does not expose a GIF model when only the stable 2K AmoToken model is available', () => {
    saveAmoTokenToken('sk-live-token');

    expect(getGifCompatibleModels()).toEqual([]);
    expect(getDefaultGifModelId()).toBe('');
  });

  it('exposes the runtime-only 4K AmoToken model for GIF when candidate modes are enabled', () => {
    saveAmoTokenToken('sk-live-token');
    localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');

    expect(getGifCompatibleModels()).toEqual([
      {
        value: AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID,
        label: 'AmoToken GPT Image 2 4K 灰测',
      },
    ]);
    expect(getDefaultGifModelId()).toBe(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID);
  });

  it('routes the 4K gray-test model through the same AmoToken image model id', () => {
    saveAmoTokenToken('sk-live-token');
    localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');

    expect(resolveImageTaskProvider(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID)).toMatchObject({
      apiKey: 'sk-live-token',
      baseUrl: 'https://amotoken.cc',
      protocol: 'openai',
      modelId: 'gpt-image-2',
    });
    expect(resolveImageTaskProvider(AMOTOKEN_IMAGE_MODEL_ID).modelId).toBe('gpt-image-2');
  });
});
