import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasConfigNodePanel } from '@/components/canvas/components/canvas-config-node-panel';
import { clearAmoTokenImageCatalogCache } from '@/lib/amotoken-image-catalog';
import { saveAmoTokenToken } from '@/lib/nova-models';
import type { CanvasGenerationConfig } from '@/components/canvas/types';

const config: CanvasGenerationConfig = {
  model: 'amotoken-gpt-image-2',
  outputSize: '1K',
  aspectRatio: '1:1',
  temperature: 1,
  count: 1,
  gptImageQuality: 'auto',
  gptImageStyle: 'auto',
  gptImageBackground: 'auto',
};

function renderPanel(
  imageCount = 0,
  panelConfig = config,
  onConfigChange = vi.fn(),
) {
  return render(
    <CanvasConfigNodePanel
      prompt="一张测试图"
      references={[]}
      config={panelConfig}
      lockResultNodes={false}
      referenceLimit={{ imageCount, max: 4, exceeded: false }}
      busy={false}
      optimizing={false}
      onPromptChange={vi.fn()}
      onConfigChange={onConfigChange}
      onToggleLock={vi.fn()}
      onSelect={vi.fn()}
      onOptimizePrompt={vi.fn()}
      onGenerate={vi.fn()}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  clearAmoTokenImageCatalogCache();
  vi.unstubAllGlobals();
  saveAmoTokenToken('sk-canvas-user');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/nova/image-products/catalog') {
      return new Response(JSON.stringify({
        catalog_version: 'image-v12',
        data: [{
          model: 'gpt-image-2', display_name: 'GPT Image 2', mode: 'generation',
          resolution_tier: '1K', sizes: ['1024x1024'], quality: 'auto',
          max_count: 1, max_reference_images: 4,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(input) === '/api/nova/image-products/quote') {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        data: {
          catalog_version: 'image-v12', model: body.model, display_name: 'GPT Image 2',
          mode: body.mode, resolution: '1K', size: body.size, quality: body.quality,
          count: body.count, reference_image_count: body.reference_image_count,
          unit_price: 0.3, total_price: 0.3, currency: 'API_CREDIT', available: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('{}', { status: 404 });
  }));
});

describe('canvas config product state', () => {
  it('shows the exact generation quote and enables a supported request', async () => {
    renderPanel();

    expect(await screen.findByText(/预计消耗 \$0\.30 API 额度/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成' })).toBeEnabled();
  });

  it('disables image editing until an edit product is available', async () => {
    renderPanel(1);

    expect(await screen.findByText(/当前模型暂不支持图生图/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '生成' })).toBeDisabled();
  });

  it('moves a legacy canvas config onto the first catalog-supported size and ratio', async () => {
    const onConfigChange = vi.fn();
    renderPanel(0, {
      ...config,
      outputSize: '4K',
      aspectRatio: '16:9',
      count: 4,
    }, onConfigChange);

    await waitFor(() => {
      expect(onConfigChange).toHaveBeenCalledWith(expect.objectContaining({
        outputSize: '1K',
        aspectRatio: '1:1',
        count: 1,
      }));
    });
  });
});
