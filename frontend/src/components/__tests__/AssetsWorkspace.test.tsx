import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetsWorkspace } from '@/components/assets/AssetsWorkspace';
import type { TextAsset } from '@/lib/asset-store';

const assetStoreMocks = vi.hoisted(() => ({
  listAssets: vi.fn(),
  updateImageAsset: vi.fn(),
  updateTextAsset: vi.fn(),
  addTextAsset: vi.fn(),
  addImageAsset: vi.fn(),
  deleteAsset: vi.fn(),
  getAssetBlob: vi.fn(),
  getAssetThumbnailBlob: vi.fn(),
}));

vi.mock('@/lib/asset-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/asset-store')>();
  return {
    ...actual,
    addImageAsset: assetStoreMocks.addImageAsset,
    addTextAsset: assetStoreMocks.addTextAsset,
    deleteAsset: assetStoreMocks.deleteAsset,
    getAssetBlob: assetStoreMocks.getAssetBlob,
    getAssetThumbnailBlob: assetStoreMocks.getAssetThumbnailBlob,
    listAssets: assetStoreMocks.listAssets,
    updateImageAsset: assetStoreMocks.updateImageAsset,
    updateTextAsset: assetStoreMocks.updateTextAsset,
  };
});

vi.mock('@/lib/image-actions', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/image-actions')>();
  return {
    ...actual,
    dispatchImageActionToast: vi.fn(),
    runImageAction: vi.fn(),
  };
});

const textAsset: TextAsset = {
  id: 'text-asset-1',
  kind: 'text',
  hash: 'text-hash-1',
  name: '海报关系图提示词',
  content: '为海贼王生成高设计感角色关系海报',
  sizeBytes: 48,
  tags: ['海报', '关系图'],
  note: '适合提示词广场复用',
  sourceKind: 'prompt-gallery',
  sourceLabel: '提示词广场',
  sourceRef: 'prompt:one-piece',
  createdAt: 1772800000000,
  updatedAt: 1772800000000,
  lastUsedAt: 1772800000000,
};

describe('AssetsWorkspace text assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assetStoreMocks.listAssets.mockResolvedValue([textAsset]);
    assetStoreMocks.updateTextAsset.mockResolvedValue(undefined);
  });

  it('shows recognizable text asset metadata and saves edits', async () => {
    render(<AssetsWorkspace active />);

    expect(await screen.findByText('海报关系图提示词')).toBeInTheDocument();
    expect(screen.getAllByText('海报').length).toBeGreaterThan(0);
    expect(screen.getAllByText('关系图').length).toBeGreaterThan(0);
    expect(screen.getByText('适合提示词广场复用')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '编辑提示词素材' }));

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '漫画关系海报' } });
    fireEvent.change(screen.getByLabelText('标签'), { target: { value: '漫画 海报 收藏' } });
    fireEvent.change(screen.getByLabelText('备注'), { target: { value: '给关系图工作流复用' } });
    fireEvent.change(screen.getByLabelText('提示词内容'), { target: { value: '生成可读性更高的角色关系图' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(assetStoreMocks.updateTextAsset).toHaveBeenCalledWith('text-asset-1', {
        name: '漫画关系海报',
        tags: ['漫画', '海报', '收藏'],
        note: '给关系图工作流复用',
        content: '生成可读性更高的角色关系图',
      });
    });
  });

  it('adds tags to selected assets in bulk', async () => {
    const asciiAsset: TextAsset = {
      ...textAsset,
      id: 'text-asset-ascii',
      name: 'Poster prompt',
      content: 'Poster prompt content',
      tags: ['poster'],
      note: 'Reusable prompt',
    };
    assetStoreMocks.listAssets.mockResolvedValue([asciiAsset]);

    render(<AssetsWorkspace active />);

    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'bulk asset tags' }));
    fireEvent.change(screen.getByLabelText('bulk tags to add'), { target: { value: 'favorite reusable' } });
    fireEvent.click(screen.getByRole('button', { name: 'apply bulk tags' }));

    await waitFor(() => {
      expect(assetStoreMocks.updateTextAsset).toHaveBeenCalledWith('text-asset-ascii', {
        tags: ['poster', 'favorite', 'reusable'],
      });
    });
  });

  it('removes the active tag from selected assets in bulk', async () => {
    const asciiAsset: TextAsset = {
      ...textAsset,
      id: 'text-asset-ascii',
      name: 'Poster prompt',
      content: 'Poster prompt content',
      tags: ['poster', 'favorite'],
      note: 'Reusable prompt',
    };
    assetStoreMocks.listAssets.mockResolvedValue([asciiAsset]);

    render(<AssetsWorkspace active />);

    fireEvent.click(await screen.findByRole('button', { name: 'filter tag poster' }));
    fireEvent.click(await screen.findByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'bulk asset tags' }));
    fireEvent.click(screen.getByRole('button', { name: 'remove active tag from selected assets' }));

    await waitFor(() => {
      expect(assetStoreMocks.updateTextAsset).toHaveBeenCalledWith('text-asset-ascii', {
        tags: ['favorite'],
      });
    });
  });
});
