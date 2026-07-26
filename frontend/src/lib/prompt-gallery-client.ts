import {
  normalizePromptCategory,
  type PromptWithKey,
} from '@/lib/prompt-gallery-data';

export interface PromptGallerySourceMeta {
  id: string;
  label: string;
  sourceUrl: string;
  license: string;
  status: 'healthy' | 'stale' | 'failed' | 'pending';
  candidateCount: number;
  lastSuccessAt: string | null;
}

export interface PromptGalleryMeta {
  publishedCount: number;
  refreshedAt: string | null;
  nextRefreshAt: string | null;
  sources: PromptGallerySourceMeta[];
}

const PROMPTS_ERROR = '提示词广场暂不可用';
const META_ERROR = '来源信息暂不可用';
const SOURCE_STATUSES = new Set<PromptGallerySourceMeta['status']>([
  'healthy',
  'stale',
  'failed',
  'pending',
]);

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(trimmedString).filter(Boolean);
}

function normalizePrompt(raw: unknown): PromptWithKey | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const id = trimmedString(item.id);
  const uniqueKey = trimmedString(item.uniqueKey);
  const title = trimmedString(item.title);
  const content = trimmedString(item.content);
  const images = stringArray(item.images);
  if (!id || !uniqueKey || !title || !content || images.length === 0) return null;

  const source = trimmedString(item.source) || 'nova';
  return {
    id,
    title,
    content,
    images,
    tags: stringArray(item.tags),
    contributor: trimmedString(item.contributor),
    notes: trimmedString(item.notes),
    source,
    sourceUrl: trimmedString(item.sourceUrl),
    category: normalizePromptCategory(trimmedString(item.category)),
    uniqueKey,
  };
}

function nullableTimestamp(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return undefined;
  return value;
}

function normalizeSourceMeta(raw: unknown): PromptGallerySourceMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const status = source.status;
  const lastSuccessAt = nullableTimestamp(source.lastSuccessAt);
  if (
    !trimmedString(source.id)
    || !trimmedString(source.label)
    || !trimmedString(source.sourceUrl)
    || !trimmedString(source.license)
    || typeof status !== 'string'
    || !SOURCE_STATUSES.has(status as PromptGallerySourceMeta['status'])
    || !Number.isInteger(source.candidateCount)
    || (source.candidateCount as number) < 0
    || lastSuccessAt === undefined
  ) {
    return null;
  }
  return {
    id: trimmedString(source.id),
    label: trimmedString(source.label),
    sourceUrl: trimmedString(source.sourceUrl),
    license: trimmedString(source.license),
    status: status as PromptGallerySourceMeta['status'],
    candidateCount: source.candidateCount as number,
    lastSuccessAt,
  };
}

function normalizeMeta(raw: unknown): PromptGalleryMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meta = raw as Record<string, unknown>;
  const refreshedAt = nullableTimestamp(meta.refreshedAt);
  const nextRefreshAt = nullableTimestamp(meta.nextRefreshAt);
  if (
    !Number.isInteger(meta.publishedCount)
    || (meta.publishedCount as number) < 0
    || refreshedAt === undefined
    || nextRefreshAt === undefined
    || !Array.isArray(meta.sources)
  ) {
    return null;
  }
  const sources = meta.sources.map(normalizeSourceMeta);
  if (sources.some(source => source === null)) return null;
  const sourceIds = new Set(sources.map(source => source?.id));
  if (sourceIds.size !== sources.length) return null;
  return {
    publishedCount: meta.publishedCount as number,
    refreshedAt,
    nextRefreshAt,
    sources: sources as PromptGallerySourceMeta[],
  };
}

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const requestOptions: RequestInit = { cache: 'no-store' };
  if (signal) requestOptions.signal = signal;
  const response = await fetch(path, requestOptions);
  if (!response.ok) throw new Error('request failed');
  return response.json();
}

export async function fetchPromptGallery(options: { signal?: AbortSignal } = {}): Promise<PromptWithKey[]> {
  try {
    const raw = await fetchJson('/api/nova/prompts', options.signal);
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('invalid prompts');
    const prompts = raw.map(normalizePrompt);
    if (prompts.some(prompt => prompt === null)) throw new Error('invalid prompts');
    const normalizedPrompts = prompts as PromptWithKey[];
    const uniqueKeys = new Set(normalizedPrompts.map(prompt => prompt.uniqueKey));
    if (uniqueKeys.size !== normalizedPrompts.length) throw new Error('duplicate prompt keys');
    return normalizedPrompts;
  } catch {
    throw new Error(PROMPTS_ERROR);
  }
}

export async function fetchPromptGalleryMeta(): Promise<PromptGalleryMeta> {
  try {
    const meta = normalizeMeta(await fetchJson('/api/nova/prompts/meta'));
    if (!meta) throw new Error('invalid metadata');
    return meta;
  } catch {
    throw new Error(META_ERROR);
  }
}
