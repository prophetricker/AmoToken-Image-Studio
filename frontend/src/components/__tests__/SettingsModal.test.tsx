import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsModal } from '@/components/SettingsModal';
import { requestAmoTokenImageToken } from '@/lib/amotoken-key-picker';
import { AMOTOKEN_IMAGE_MODEL_ID, loadRegistry, saveAmoTokenToken } from '@/lib/nova-models';

vi.mock('@/lib/amotoken-key-picker', () => ({
  requestAmoTokenImageToken: vi.fn(),
}));

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  });
  vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
  vi.mocked(requestAmoTokenImageToken).mockReset();
});

describe('SettingsModal AmoToken setup', () => {
  it('shows token-only setup and hides raw model fields', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} onApiKeyChange={vi.fn()} />);

    expect(screen.getByText('AmoToken 令牌')).toBeInTheDocument();
    expect(screen.getByLabelText('AmoToken 令牌')).toBeInTheDocument();
    expect(screen.queryByText('Base URL')).not.toBeInTheDocument();
    expect(screen.queryByText('模型 ID')).not.toBeInTheDocument();
    expect(screen.queryByText('协议')).not.toBeInTheDocument();
  });

  it('shows the AmoToken product name in the about panel', () => {
    render(<SettingsModal isOpen onClose={vi.fn()} onApiKeyChange={vi.fn()} />);

    fireEvent.click(screen.getAllByRole('tab')[2]);

    expect(screen.getByText(/AmoToken Image Studio/)).toBeInTheDocument();
  });

  it('saves one token into the AmoToken preset registry', () => {
    const onApiKeyChange = vi.fn();
    render(<SettingsModal isOpen onClose={vi.fn()} onApiKeyChange={onApiKeyChange} />);

    fireEvent.change(screen.getByLabelText('AmoToken 令牌'), { target: { value: 'sk-test-token' } });
    fireEvent.click(screen.getByRole('button', { name: '保存令牌' }));

    const registry = loadRegistry();
    expect(registry.imageModels[0].id).toBe(AMOTOKEN_IMAGE_MODEL_ID);
    expect(registry.imageModels[0].apiKey).toBe('sk-test-token');
    expect(onApiKeyChange).toHaveBeenCalledWith('sk-test-token');
  });

  it('selects and saves an image token from AmoToken', async () => {
    const onApiKeyChange = vi.fn();
    vi.mocked(requestAmoTokenImageToken).mockResolvedValue('sk-picker-token');
    render(<SettingsModal isOpen onClose={vi.fn()} onApiKeyChange={onApiKeyChange} />);

    fireEvent.click(screen.getByRole('button', { name: '从 AmoToken 选择生图密钥' }));

    await waitFor(() => {
      expect(loadRegistry().imageModels[0].apiKey).toBe('sk-picker-token');
    });
    expect(onApiKeyChange).toHaveBeenCalledWith('sk-picker-token');
    expect(screen.getByText('令牌已保存')).toBeInTheDocument();
  });

  it('keeps the existing token when the picker fails', async () => {
    saveAmoTokenToken('sk-existing-token');
    vi.mocked(requestAmoTokenImageToken).mockRejectedValue(new Error('popup blocked'));
    render(<SettingsModal isOpen onClose={vi.fn()} onApiKeyChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '从 AmoToken 选择生图密钥' }));

    expect(await screen.findByText('无法打开 AmoToken 密钥选择，请重试')).toBeInTheDocument();
    expect(loadRegistry().imageModels[0].apiKey).toBe('sk-existing-token');
  });
});
