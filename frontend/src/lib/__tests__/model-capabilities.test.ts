import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CANDIDATE_MODES_STORAGE_KEY } from '@/lib/candidate-capabilities';
import {
  getAspectRatioOptions,
  getCustomSizeMaxSide,
  normalizeCustomImageSize,
} from '@/lib/model-capabilities';
import { GIF_GRID_CUSTOM_SIZE } from '@/lib/gif-job-store';
import { AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID, saveAmoTokenToken } from '@/lib/nova-models';

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

function enableAmoToken4KGrayModel() {
  saveAmoTokenToken('sk-live-token');
  localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');
}

describe('AmoToken 4K gray-test layout limits', () => {
  it('only exposes 4K GPT Image 2 aspect ratios that fit the service size envelope', () => {
    enableAmoToken4KGrayModel();

    expect(getAspectRatioOptions(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID, '4K')).toEqual([
      { value: '16:9', label: '宽屏', resolution: '3840x2160' },
      { value: '9:16', label: '竖屏', resolution: '2160x3840' },
      { value: '21:9', label: '超宽屏', resolution: '3840x1648' },
    ]);
  });

  it('keeps 2K layouts broad while filtering invalid 4K square output', () => {
    enableAmoToken4KGrayModel();

    expect(getAspectRatioOptions(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID, '2K').map(option => option.value)).toContain('1:1');
    expect(getAspectRatioOptions(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID, '4K').map(option => option.value)).not.toContain('1:1');
  });

  it('allows the GIF grid custom size but rejects oversized square custom sizes', () => {
    enableAmoToken4KGrayModel();
    const maxSide = getCustomSizeMaxSide(AMOTOKEN_IMAGE_MODEL_4K_GRAY_ID);

    expect(normalizeCustomImageSize(GIF_GRID_CUSTOM_SIZE, maxSide)).toBe(GIF_GRID_CUSTOM_SIZE);
    expect(normalizeCustomImageSize('4096x4096', maxSide)).toBeUndefined();
  });
});
