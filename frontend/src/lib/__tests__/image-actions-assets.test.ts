import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addImagePayloadToAssets } from '@/lib/image-actions';
import type { ImageAsset } from '@/lib/asset-store';

const assetStoreMocks = vi.hoisted(() => ({
  addImageAsset: vi.fn(),
  findImageAssetByBlob: vi.fn(),
  findImageAssetsByBlob: vi.fn(),
  getAssetBlob: vi.fn(),
  getAssetFileExtension: vi.fn(() => 'png'),
  touchImageAsset: vi.fn(),
}));

vi.mock('@/lib/asset-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/asset-store')>();
  return {
    ...actual,
    addImageAsset: assetStoreMocks.addImageAsset,
    findImageAssetByBlob: assetStoreMocks.findImageAssetByBlob,
    findImageAssetsByBlob: assetStoreMocks.findImageAssetsByBlob,
    getAssetBlob: assetStoreMocks.getAssetBlob,
    getAssetFileExtension: assetStoreMocks.getAssetFileExtension,
    touchImageAsset: assetStoreMocks.touchImageAsset,
  };
});

function makeAsset(overrides: Partial<ImageAsset> = {}): ImageAsset {
  return {
    id: 'asset-1',
    kind: 'image',
    blobKey: 'hash-1',
    hash: 'hash-1',
    name: 'Generated image',
    mimeType: 'image/png',
    sizeBytes: 4,
    tags: [],
    note: '',
    sourceKind: 'text-to-image',
    sourceLabel: 'Generated',
    sourceRef: 'job-1:0',
    createdAt: 1000,
    updatedAt: 1000,
    lastUsedAt: 1000,
    ...overrides,
  };
}

describe('addImagePayloadToAssets duplicate behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the existing asset when the same source image was not edited', async () => {
    const existingAsset = makeAsset();
    assetStoreMocks.findImageAssetsByBlob.mockResolvedValue([existingAsset]);

    const result = await addImagePayloadToAssets({
      blob: new Blob(['demo'], { type: 'image/png' }),
      sourceKind: 'text-to-image',
      sourceLabel: 'Generated',
      sourceRef: 'job-1:0',
    });

    expect(result).toEqual({ asset: existingAsset, alreadyExists: true });
    expect(assetStoreMocks.touchImageAsset).toHaveBeenCalledWith('asset-1');
    expect(assetStoreMocks.addImageAsset).not.toHaveBeenCalled();
  });

  it('creates a new asset when the previous same-source asset was edited', async () => {
    const editedAsset = makeAsset({ metadataEditedAt: 1500 } as Partial<ImageAsset>);
    const newAsset = makeAsset({ id: 'asset-2', createdAt: 2000, updatedAt: 2000 });
    assetStoreMocks.findImageAssetsByBlob.mockResolvedValue([editedAsset]);
    assetStoreMocks.addImageAsset.mockResolvedValue(newAsset);

    const result = await addImagePayloadToAssets({
      blob: new Blob(['demo'], { type: 'image/png' }),
      sourceKind: 'text-to-image',
      sourceLabel: 'Generated',
      sourceRef: 'job-1:0',
    });

    expect(result).toEqual({ asset: newAsset, alreadyExists: false });
    expect(assetStoreMocks.touchImageAsset).not.toHaveBeenCalled();
    expect(assetStoreMocks.addImageAsset).toHaveBeenCalledWith(expect.objectContaining({
      sourceKind: 'text-to-image',
      sourceRef: 'job-1:0',
    }));
  });
});
