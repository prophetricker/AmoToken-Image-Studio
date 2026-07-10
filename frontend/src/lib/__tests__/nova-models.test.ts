import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
  AMOTOKEN_IMAGE_MODEL_ID,
  AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID,
  AMOTOKEN_TEXT_MODEL_ID,
  buildAmoTokenRegistry,
  getPublicAmoTokenImageCapabilities,
  loadRegistry,
  saveRegistry,
  saveAmoTokenToken,
} from '@/lib/nova-models';
import { CANDIDATE_MODES_STORAGE_KEY } from '@/lib/candidate-capabilities';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  delete process.env.NEXT_PUBLIC_NOVA_CANDIDATE_MODES;
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  });
});

describe('AmoToken model registry', () => {
  it('builds image models and one text helper model from a user token', () => {
    const registry = buildAmoTokenRegistry('sk-test-token');

    expect(registry.imageModels).toHaveLength(2);
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
    expect(registry.imageModels[1]).toMatchObject({
      id: AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
      protocol: 'openai',
      modelId: 'gpt-image-2-1k-backup',
      apiKey: 'sk-test-token',
      baseUrl: 'https://amotoken.cc/v1',
      maxRefImages: 4,
      maxOutputSize: '1K',
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

    expect(registry.imageModels.map(model => model.id)).toEqual([
      AMOTOKEN_IMAGE_MODEL_ID,
      AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
    ]);
    expect(registry.textModels.map(model => model.id)).toEqual([AMOTOKEN_TEXT_MODEL_ID]);
    expect(capabilities.map(item => item.id)).toEqual([
      AMOTOKEN_IMAGE_MODEL_ID,
      AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
    ]);
    expect(capabilities.every(item => item.visible && !item.gray)).toBe(true);
  });

  it('adds the 1K backup model when loading an older AmoToken registry', () => {
    store.set('nova-model-registry', JSON.stringify({
      imageModels: [
        {
          id: AMOTOKEN_IMAGE_MODEL_ID,
          protocol: 'openai',
          name: 'AmoToken GPT Image 2',
          modelId: 'gpt-image-2',
          apiKey: 'sk-live-token',
          baseUrl: 'https://amotoken.cc/v1',
          builtinPreset: 'gpt-image-2',
          maxRefImages: 4,
          maxOutputSize: '2K',
          supportsAdvancedParams: true,
        },
      ],
      textModels: [],
      defaults: {
        textToImage: AMOTOKEN_IMAGE_MODEL_ID,
        imageToImage: AMOTOKEN_IMAGE_MODEL_ID,
      },
    }));

    const registry = loadRegistry();

    expect(registry.imageModels.map(model => model.id)).toEqual([
      AMOTOKEN_IMAGE_MODEL_ID,
      AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
    ]);
    expect(registry.imageModels[1]).toMatchObject({
      modelId: 'gpt-image-2-1k-backup',
      maxOutputSize: '1K',
      apiKey: 'sk-live-token',
    });
    expect(registry.defaults.textToImage).toBe(AMOTOKEN_IMAGE_MODEL_ID);
  });

  it('adds the 4K gray-test image model only when candidate modes are enabled', () => {
    saveAmoTokenToken('sk-live-token');
    localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');

    const registry = loadRegistry();

    expect(registry.imageModels.map(model => model.id)).toEqual([
      AMOTOKEN_IMAGE_MODEL_ID,
      AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
      AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID,
    ]);
    expect(registry.imageModels[2]).toMatchObject({
      id: AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID,
      protocol: 'openai',
      modelId: 'gpt-image-2',
      apiKey: 'sk-live-token',
      baseUrl: 'https://amotoken.cc/v1',
      maxRefImages: 4,
      maxOutputSize: '4K',
      supportsAdvancedParams: true,
    });
    expect(registry.defaults.textToImage).toBe(AMOTOKEN_IMAGE_MODEL_ID);
    expect(registry.defaults.imageToImage).toBe(AMOTOKEN_IMAGE_MODEL_ID);
  });

  it('removes the 4K gray-test image model when candidate modes are disabled', () => {
    saveAmoTokenToken('sk-live-token');
    localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');
    expect(loadRegistry().imageModels.map(model => model.id)).toContain(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID);

    localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'disabled');

    expect(loadRegistry().imageModels.map(model => model.id)).toEqual([
      AMOTOKEN_IMAGE_MODEL_ID,
      AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
    ]);
  });

  it('does not persist the runtime-only 4K gray-test image model when saving a derived registry', () => {
    saveAmoTokenToken('sk-live-token');
    localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');

    const derived = loadRegistry();
    saveRegistry(derived);

    const raw = JSON.parse(store.get('nova-model-registry') || '{}') as { imageModels?: Array<{ id?: string }> };
    expect(raw.imageModels?.map(model => model.id)).toEqual([
      AMOTOKEN_IMAGE_MODEL_ID,
      AMOTOKEN_IMAGE_MODEL_1K_BACKUP_ID,
    ]);
  });
});
