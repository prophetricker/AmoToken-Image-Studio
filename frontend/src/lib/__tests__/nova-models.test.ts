import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AMOTOKEN_IMAGE_MODEL_ID,
  AMOTOKEN_TEXT_MODEL_ID,
  buildAmoTokenRegistry,
  getPublicAmoTokenImageCapabilities,
  loadRegistry,
  saveAmoTokenToken,
} from '@/lib/nova-models';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  });
});

describe('AmoToken model registry', () => {
  it('builds one image model and one text helper model from a user token', () => {
    const registry = buildAmoTokenRegistry('sk-test-token');

    expect(registry.imageModels).toHaveLength(1);
    expect(registry.imageModels[0]).toMatchObject({
      id: AMOTOKEN_IMAGE_MODEL_ID,
      protocol: 'openai',
      modelId: 'gpt-image-2',
      apiKey: 'sk-test-token',
      baseUrl: 'https://amotoken.cc/v1',
      maxRefImages: 4,
      maxOutputSize: '2K',
      supportsAdvancedParams: true,
    });
    expect(registry.textModels).toHaveLength(1);
    expect(registry.textModels[0]).toMatchObject({
      id: AMOTOKEN_TEXT_MODEL_ID,
      protocol: 'openai',
      modelId: 'gpt-5.4-mini',
      apiKey: 'sk-test-token',
      baseUrl: 'https://amotoken.cc/v1',
    });
    expect(registry.defaults).toMatchObject({
      textToImage: AMOTOKEN_IMAGE_MODEL_ID,
      imageToImage: AMOTOKEN_IMAGE_MODEL_ID,
      reversePrompt: AMOTOKEN_TEXT_MODEL_ID,
      agent: AMOTOKEN_TEXT_MODEL_ID,
      promptOptimize: AMOTOKEN_TEXT_MODEL_ID,
      imageDescribe: AMOTOKEN_TEXT_MODEL_ID,
    });
  });

  it('saves the AmoToken token into the registry without exposing hidden capabilities', () => {
    saveAmoTokenToken('sk-live-token');
    const registry = loadRegistry();
    const capabilities = getPublicAmoTokenImageCapabilities();

    expect(registry.imageModels.map(model => model.id)).toEqual([AMOTOKEN_IMAGE_MODEL_ID]);
    expect(registry.textModels.map(model => model.id)).toEqual([AMOTOKEN_TEXT_MODEL_ID]);
    expect(capabilities.map(item => item.id)).toEqual([AMOTOKEN_IMAGE_MODEL_ID]);
    expect(capabilities.every(item => item.visible && !item.gray)).toBe(true);
  });
});
