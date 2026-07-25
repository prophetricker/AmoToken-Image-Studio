import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GIF_FRAME_HEIGHT,
  GIF_FRAME_WIDTH,
  GIF_GRID_CUSTOM_SIZE,
  GIF_GRID_OUTPUT_SIZE,
  GIF_MAX_REF_IMAGES,
  getDefaultGifModelId,
  getGifCompatibleModels,
} from '@/lib/gif-job-store';
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

describe('GIF full-release product constraints', () => {
  it('uses a catalog-compatible 2K grid with twelve 512px frames and three user references', () => {
    expect(GIF_GRID_OUTPUT_SIZE).toBe('2K');
    expect(GIF_GRID_CUSTOM_SIZE).toBe('2048x1536');
    expect(GIF_FRAME_WIDTH).toBe(512);
    expect(GIF_FRAME_HEIGHT).toBe(512);
    expect(GIF_MAX_REF_IMAGES).toBe(3);
  });

  it('exposes the normal AmoToken model when its stable 2K configuration is available', () => {
    saveAmoTokenToken('sk-live-token');

    expect(getGifCompatibleModels()).toEqual([
      {
        value: AMOTOKEN_IMAGE_MODEL_ID,
        label: 'AmoToken GPT Image 2',
      },
    ]);
    expect(getDefaultGifModelId()).toBe(AMOTOKEN_IMAGE_MODEL_ID);
  });

  it('routes the 4K gray-test model through the same AmoToken image model id', () => {
    saveAmoTokenToken('sk-live-token');

    expect(resolveImageTaskProvider(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID)).toMatchObject({
      apiKey: 'sk-live-token',
      baseUrl: 'https://amotoken.cc',
      protocol: 'openai',
      modelId: 'gpt-image-2',
    });
    expect(resolveImageTaskProvider(AMOTOKEN_IMAGE_MODEL_ID).modelId).toBe('gpt-image-2');
  });
});
