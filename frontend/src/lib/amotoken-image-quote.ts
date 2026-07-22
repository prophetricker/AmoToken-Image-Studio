import type { AmoTokenImageOperationMode } from '@/lib/amotoken-image-catalog';

export interface AmoTokenImageQuoteInput {
  model: string;
  mode: AmoTokenImageOperationMode;
  size: string;
  quality: string;
  count: number;
  referenceImageCount: number;
}

export interface AmoTokenImageQuote {
  catalogVersion: string;
  model: string;
  displayName: string;
  mode: AmoTokenImageOperationMode;
  resolutionTier: string;
  size: string;
  quality: string;
  count: number;
  referenceImageCount: number;
  unitPrice: number;
  totalPrice: number;
  currency: 'API_CREDIT';
  available: true;
}

type FetchLike = typeof fetch;
type NovaImageMode = 'text-to-image' | 'image-to-image' | 'multi-image-fusion';

const QUOTE_BINDING = Symbol('amotoken-image-quote-binding');
const QUOTE_MAX_AGE_MS = 30_000;

interface QuoteBinding {
  token: string;
  quotedAt: number;
}

type BoundAmoTokenImageQuote = AmoTokenImageQuote & {
  [QUOTE_BINDING]?: QuoteBinding;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function toAmoTokenImageOperationMode(mode: NovaImageMode): AmoTokenImageOperationMode {
  return mode === 'text-to-image' ? 'generation' : 'edit';
}

function normalizeQuote(payload: unknown): AmoTokenImageQuote {
  const root = asRecord(payload);
  const data = asRecord(root?.data);
  if (!data || data.available !== true) throw new Error('当前规格暂不可用');

  const mode = String(data.mode || '').trim();
  const quote = {
    catalogVersion: String(data.catalog_version || '').trim(),
    model: String(data.model || '').trim(),
    displayName: String(data.display_name || '').trim(),
    mode,
    resolutionTier: String(data.resolution || '').trim(),
    size: String(data.size || '').trim(),
    quality: String(data.quality || '').trim(),
    count: Number(data.count),
    referenceImageCount: Number(data.reference_image_count),
    unitPrice: Number(data.unit_price),
    totalPrice: Number(data.total_price),
    currency: String(data.currency || '').trim(),
    available: true as const,
  };
  if (
    !quote.catalogVersion || !quote.model || !quote.displayName
    || (mode !== 'generation' && mode !== 'edit')
    || !quote.resolutionTier || !quote.size || !quote.quality
    || !Number.isInteger(quote.count) || quote.count < 1
    || !Number.isInteger(quote.referenceImageCount) || quote.referenceImageCount < 0
    || !Number.isFinite(quote.unitPrice) || quote.unitPrice < 0
    || !Number.isFinite(quote.totalPrice) || quote.totalPrice < 0
    || quote.currency !== 'API_CREDIT'
  ) {
    throw new Error('生图报价返回格式无效');
  }
  return quote as AmoTokenImageQuote;
}

export function bindAmoTokenImageQuote(
  quote: AmoTokenImageQuote,
  token: string,
  quotedAt = Date.now(),
): AmoTokenImageQuote {
  Object.defineProperty(quote, QUOTE_BINDING, {
    configurable: true,
    enumerable: false,
    value: { token: token.trim(), quotedAt },
  });
  return quote;
}

export function isAmoTokenImageQuoteFreshForToken(
  quote: AmoTokenImageQuote,
  token: string,
  now = Date.now(),
): boolean {
  const binding = (quote as BoundAmoTokenImageQuote)[QUOTE_BINDING];
  return Boolean(
    binding
    && binding.token === token.trim()
    && now >= binding.quotedAt
    && now - binding.quotedAt <= QUOTE_MAX_AGE_MS,
  );
}

export async function fetchAmoTokenImageQuote(
  token: string,
  input: AmoTokenImageQuoteInput,
  fetchImpl: FetchLike = fetch,
): Promise<AmoTokenImageQuote> {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error('请先粘贴 AmoToken 令牌');

  const response = await fetchImpl('/api/nova/image-products/quote', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${normalizedToken}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      model: input.model,
      mode: input.mode,
      size: input.size,
      quality: input.quality,
      count: input.count,
      reference_image_count: input.referenceImageCount,
    }),
  });
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? 'AmoToken 令牌无效或无权使用该生图模型'
      : '暂时无法获取生图报价，请稍后重试');
  }
  return bindAmoTokenImageQuote(normalizeQuote(await response.json()), normalizedToken);
}

export function formatAmoTokenImageQuote(quote: AmoTokenImageQuote): string {
  const amount = quote.totalPrice.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
    useGrouping: false,
  });
  return `预计消耗 $${amount} API 额度`;
}
