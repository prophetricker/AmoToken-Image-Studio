export type AmoTokenImageOperationMode = 'generation' | 'edit';

export interface AmoTokenImageProduct {
  mode: AmoTokenImageOperationMode;
  resolutionTier: string;
  sizes: string[];
  quality: string;
}

export interface AmoTokenImageCatalogModel {
  id: string;
  displayName: string;
  maxCount: number;
  maxReferenceImages: number;
  products: AmoTokenImageProduct[];
}

export interface AmoTokenImageCatalog {
  version: string;
  models: AmoTokenImageCatalogModel[];
}

export interface AmoTokenImageResolutionTier {
  value: string;
  sizes: string[];
  qualities: string[];
}

export interface AmoTokenImageModeCapabilities {
  model: string;
  displayName: string;
  mode: AmoTokenImageOperationMode;
  maxCount: number;
  maxReferenceImages: number;
  resolutionTiers: AmoTokenImageResolutionTier[];
}

type FetchLike = typeof fetch;

const CATALOG_CACHE_TTL_MS = 30_000;
const catalogCache = new Map<string, { expiresAt: number; catalog: AmoTokenImageCatalog }>();
let activeCatalogToken = '';
let activeCatalog: AmoTokenImageCatalog | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asPositiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizeProductRow(value: unknown) {
  const row = asRecord(value);
  if (!row) return null;

  const model = String(row.model || '').trim();
  const displayName = String(row.display_name || '').trim();
  const mode = String(row.mode || '').trim().toLowerCase();
  const resolutionTier = String(row.resolution_tier || '').trim();
  const quality = String(row.quality || '').trim();
  const sizes = Array.isArray(row.sizes)
    ? row.sizes.map(size => String(size || '').trim()).filter(Boolean)
    : [];
  if (!model || !displayName || !resolutionTier || !quality || sizes.length === 0) return null;
  if (mode !== 'generation' && mode !== 'edit') return null;

  return {
    model,
    displayName,
    maxCount: asPositiveInteger(row.max_count, 1),
    maxReferenceImages: Math.max(0, Math.trunc(Number(row.max_reference_images) || 0)),
    product: {
      mode: mode as AmoTokenImageOperationMode,
      resolutionTier,
      sizes: Array.from(new Set(sizes)),
      quality,
    },
  };
}

export function normalizeAmoTokenImageCatalog(payload: unknown): AmoTokenImageCatalog {
  const root = asRecord(payload);
  const version = String(root?.catalog_version || '').trim();
  const rows = Array.isArray(root?.data) ? root.data : [];
  const models = new Map<string, AmoTokenImageCatalogModel>();

  for (const rawRow of rows) {
    const row = normalizeProductRow(rawRow);
    if (!row) continue;
    const current = models.get(row.model) || {
      id: row.model,
      displayName: row.displayName,
      maxCount: row.maxCount,
      maxReferenceImages: row.maxReferenceImages,
      products: [],
    };
    current.maxCount = Math.min(current.maxCount, row.maxCount);
    current.maxReferenceImages = Math.min(current.maxReferenceImages, row.maxReferenceImages);
    const duplicate = current.products.some(product => (
      product.mode === row.product.mode
      && product.resolutionTier === row.product.resolutionTier
      && product.quality === row.product.quality
      && product.sizes.join('\0') === row.product.sizes.join('\0')
    ));
    if (!duplicate) current.products.push(row.product);
    models.set(row.model, current);
  }

  if (!version || models.size === 0) {
    throw new Error('当前没有可用的生图模型');
  }
  return { version, models: Array.from(models.values()) };
}

export function getAmoTokenImageModeCapabilities(
  catalog: AmoTokenImageCatalog,
  modelId: string,
  mode: AmoTokenImageOperationMode,
): AmoTokenImageModeCapabilities | null {
  const model = catalog.models.find(item => item.id === modelId);
  if (!model) return null;

  const tiers = new Map<string, AmoTokenImageResolutionTier>();
  for (const product of model.products) {
    if (product.mode !== mode) continue;
    const tier = tiers.get(product.resolutionTier) || {
      value: product.resolutionTier,
      sizes: [],
      qualities: [],
    };
    for (const size of product.sizes) {
      if (!tier.sizes.includes(size)) tier.sizes.push(size);
    }
    if (!tier.qualities.includes(product.quality)) tier.qualities.push(product.quality);
    tiers.set(product.resolutionTier, tier);
  }
  if (tiers.size === 0) return null;

  return {
    model: model.id,
    displayName: model.displayName,
    mode,
    maxCount: model.maxCount,
    maxReferenceImages: model.maxReferenceImages,
    resolutionTiers: Array.from(tiers.values()),
  };
}

export function getAmoTokenImageModelOptions(
  catalog: AmoTokenImageCatalog,
  mode: AmoTokenImageOperationMode,
): Array<{ value: string; label: string; recommended: boolean }> {
  return catalog.models
    .filter(model => model.products.some(product => product.mode === mode))
    .map((model, index) => ({
      value: model.id,
      label: model.displayName,
      recommended: index === 0,
    }));
}

export function getAmoTokenImageProductSizes(
  catalog: AmoTokenImageCatalog,
  modelId: string,
  mode: AmoTokenImageOperationMode,
  resolutionTier: string,
  quality: string,
): string[] {
  const model = catalog.models.find(item => item.id === modelId);
  if (!model) return [];
  return Array.from(new Set(model.products
    .filter(product => (
      product.mode === mode
      && product.resolutionTier === resolutionTier
      && product.quality === quality
    ))
    .flatMap(product => product.sizes)));
}

const LEGACY_MODEL_ALIASES = new Set([
  'amotoken-gpt-image-2',
  'amotoken-gpt-image-2-1k-backup',
  'amotoken-gpt-image-2-4k-gray',
  'gpt-image-2-1k-backup',
]);

export function normalizeAmoTokenCatalogModelId(
  candidate: string | undefined,
  catalog: AmoTokenImageCatalog,
  mode: AmoTokenImageOperationMode,
): string {
  const options = getAmoTokenImageModelOptions(catalog, mode);
  if (candidate && options.some(option => option.value === candidate)) return candidate;
  if (candidate && LEGACY_MODEL_ALIASES.has(candidate)) {
    const stable = options.find(option => option.value === 'gpt-image-2');
    if (stable) return stable.value;
  }
  return options[0]?.value || '';
}

export function clearAmoTokenImageCatalogCache(): void {
  catalogCache.clear();
  activeCatalogToken = '';
  activeCatalog = null;
}

export function isModelInCurrentAmoTokenImageCatalog(token: string, modelId: string): boolean {
  const normalizedToken = token.trim();
  if (!normalizedToken || normalizedToken !== activeCatalogToken) return false;
  return activeCatalog?.models.some(model => model.id === modelId) === true;
}

export async function fetchAmoTokenImageCatalog(
  token: string,
  fetchImpl: FetchLike = fetch,
): Promise<AmoTokenImageCatalog> {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error('请先粘贴 AmoToken 令牌');

  if (activeCatalogToken !== normalizedToken) {
    catalogCache.clear();
    activeCatalogToken = normalizedToken;
    activeCatalog = null;
  }

  const cached = catalogCache.get(normalizedToken);
  if (cached && cached.expiresAt > Date.now()) return cached.catalog;

  const response = await fetchImpl('/api/nova/image-products/catalog', {
    method: 'GET',
    headers: { Authorization: `Bearer ${normalizedToken}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(response.status === 401 || response.status === 403
      ? 'AmoToken 令牌无效或无权使用生图模型'
      : '暂时无法读取生图模型，请稍后重试');
  }

  const catalog = normalizeAmoTokenImageCatalog(await response.json());
  if (activeCatalogToken === normalizedToken) {
    catalogCache.set(normalizedToken, { expiresAt: Date.now() + CATALOG_CACHE_TTL_MS, catalog });
    activeCatalog = catalog;
  }
  return catalog;
}
