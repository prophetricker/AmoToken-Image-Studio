import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReversePromptForm } from '@/components/ReversePromptForm';
import {
  saveReverseHistoryEntry,
  saveReverseResult,
} from '@/lib/reverse-prompt-store';

const mocks = vi.hoisted(() => ({
  loadReverseResults: vi.fn(),
  saveReverseDraft: vi.fn(),
  clearReverseDraft: vi.fn(),
  saveReverseResult: vi.fn(),
  saveReverseHistoryEntry: vi.fn(),
  addTextAsset: vi.fn(),
  streamReversePrompt: vi.fn(),
  getConfiguredTextModel: vi.fn(),
  getDefaultConfiguredTextModel: vi.fn(),
  prepareUploadImage: vi.fn(),
}));

vi.mock('@/lib/reverse-prompt-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reverse-prompt-store')>();
  return {
    ...actual,
    loadReverseResults: mocks.loadReverseResults,
    saveReverseDraft: mocks.saveReverseDraft,
    clearReverseDraft: mocks.clearReverseDraft,
    saveReverseResult: mocks.saveReverseResult,
    saveReverseHistoryEntry: mocks.saveReverseHistoryEntry,
  };
});

vi.mock('@/lib/upload-image-cache', () => ({
  prepareUploadImage: mocks.prepareUploadImage,
}));

vi.mock('@/lib/asset-store', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/asset-store')>();
  return {
    ...actual,
    addTextAsset: mocks.addTextAsset,
  };
});

vi.mock('@/lib/model-endpoints', () => ({
  getConfiguredTextModel: mocks.getConfiguredTextModel,
  getDefaultConfiguredTextModel: mocks.getDefaultConfiguredTextModel,
}));

vi.mock('@/lib/reverse-prompt-client', () => ({
  streamReversePrompt: mocks.streamReversePrompt,
}));

vi.mock('@/lib/reverse-prompt-config', () => ({
  DEFAULT_REVERSE_MODE: 'style-extract',
  REVERSE_PROMPT_MODE_OPTIONS: [
    { value: 'style-extract', label: '风格提取', description: '提取风格' },
    { value: 'replicate', label: '高保真复刻', description: '复刻画面' },
  ],
  getDefaultReversePromptModelId: () => 'helper',
  getReversePromptModelOptionsList: () => [
    { value: 'helper', label: 'Helper', provider: 'openai', description: 'helper model' },
  ],
  getReverseModelOption: () => ({ value: 'helper', label: 'Helper', provider: 'openai', description: 'helper model' }),
  getReverseModeOption: (mode: string) => (
    mode === 'replicate'
      ? { value: 'replicate', label: '高保真复刻', description: '复刻画面' }
      : { value: 'style-extract', label: '风格提取', description: '提取风格' }
  ),
  isReversePromptMode: (value: string) => value === 'style-extract' || value === 'replicate',
  isReversePromptModel: (value: string) => value === 'helper',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadReverseResults.mockResolvedValue({
    current: null,
    previous: null,
    history: [
      {
        slot: 'history:1772800000000',
        text: 'cinematic shark portrait',
        model: 'helper',
        mode: 'replicate',
        timestamp: 1772800000000,
      },
      {
        slot: 'history:1772790000000',
        text: 'soft watercolor toy shark',
        model: 'helper',
        mode: 'style-extract',
        timestamp: 1772790000000,
      },
    ],
    draft: null,
  });
  mocks.saveReverseDraft.mockResolvedValue(undefined);
  mocks.clearReverseDraft.mockResolvedValue(undefined);
  mocks.saveReverseResult.mockResolvedValue(undefined);
  mocks.saveReverseHistoryEntry.mockResolvedValue(undefined);
  mocks.addTextAsset.mockResolvedValue({
    id: 'text-asset-1',
    kind: 'text',
    hash: 'text-hash-1',
    name: 'saved reverse prompt',
    content: 'saved reverse prompt',
    sizeBytes: 20,
    tags: [],
    note: '',
    sourceKind: 'reverse-prompt',
    sourceLabel: '反推提示词',
    createdAt: 1772800000000,
    updatedAt: 1772800000000,
  });
  mocks.prepareUploadImage.mockResolvedValue({
    id: 'upload-1',
    name: 'shark.png',
    preview: 'data:image/png;base64,preview',
    dataUrl: 'data:image/png;base64,image',
    mimeType: 'image/png',
    originalSize: 100,
    processedSize: 100,
    cacheHit: false,
  });
  mocks.getConfiguredTextModel.mockReturnValue({
    id: 'helper',
    protocol: 'openai',
    name: 'Helper',
    modelId: 'gpt-5.4-mini',
    apiKey: 'sk-test',
    baseUrl: 'https://amotoken.cc/v1',
  });
  mocks.getDefaultConfiguredTextModel.mockReturnValue({
    id: 'helper',
    protocol: 'openai',
    name: 'Helper',
    modelId: 'gpt-5.4-mini',
    apiKey: 'sk-test',
    baseUrl: 'https://amotoken.cc/v1',
  });
  mocks.streamReversePrompt.mockImplementation((_input, callbacks) => {
    queueMicrotask(() => callbacks.onDone('fresh reverse prompt'));
    return { abort: vi.fn(), promise: Promise.resolve() };
  });
});

describe('ReversePromptForm v0.6 history', () => {
  it('shows multiple reverse prompt history items and can reuse one for generation', async () => {
    const onUsePrompt = vi.fn();
    render(<ReversePromptForm onUsePrompt={onUsePrompt} />);

    expect(await screen.findByText('历史记录')).toBeInTheDocument();
    expect(screen.getByText(/cinematic shark portrait/)).toBeInTheDocument();
    expect(screen.getByText(/soft watercolor toy shark/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '用于生图' })[0]);

    await waitFor(() => {
      expect(onUsePrompt).toHaveBeenCalledWith('cinematic shark portrait');
    });
  });

  it('keeps the current reverse result out of history until it is replaced by a new run', async () => {
    mocks.loadReverseResults.mockResolvedValue({
      current: null,
      previous: null,
      history: [],
      draft: null,
    });

    const { container } = render(<ReversePromptForm />);
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['image'], 'shark.png', { type: 'image/png' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(mocks.prepareUploadImage).toHaveBeenCalled());

    fireEvent.click(screen.getByTitle('开始反推提示词'));

    expect(await screen.findByText(/fresh reverse prompt/)).toBeInTheDocument();
    expect(saveReverseResult).toHaveBeenCalledWith(expect.objectContaining({
      slot: 'current',
      text: 'fresh reverse prompt',
    }));
    expect(saveReverseHistoryEntry).not.toHaveBeenCalled();
    expect(screen.queryByText('历史记录')).not.toBeInTheDocument();

    mocks.streamReversePrompt.mockImplementationOnce((_input, callbacks) => {
      queueMicrotask(() => callbacks.onDone('second reverse prompt'));
      return { abort: vi.fn(), promise: Promise.resolve() };
    });
    fireEvent.click(screen.getByTitle('开始反推提示词'));

    await waitFor(() => {
      expect(saveReverseHistoryEntry).toHaveBeenCalledWith(expect.objectContaining({
        text: 'fresh reverse prompt',
      }));
    });
    expect(await screen.findByText(/second reverse prompt/)).toBeInTheDocument();
  });

  it('saves a reverse prompt result into the text asset library', async () => {
    render(<ReversePromptForm />);

    expect(await screen.findByText('历史记录')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '存素材' })[0]);

    await waitFor(() => {
      expect(mocks.addTextAsset).toHaveBeenCalledWith({
        content: 'cinematic shark portrait',
        sourceKind: 'reverse-prompt',
        sourceLabel: '反推提示词',
        sourceRef: 'history:1772800000000',
      });
    });
  });
});
