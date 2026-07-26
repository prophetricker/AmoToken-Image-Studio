import {
  fetchPromptGallery,
  fetchPromptGalleryMeta,
  type PromptGalleryMeta,
} from '@/lib/prompt-gallery-client';
import type { PromptWithKey } from '@/lib/prompt-gallery-data';

export const PROMPT_GALLERY_CACHE_TTL_MS = 5 * 60 * 1000;

export interface PromptGallerySnapshot {
  prompts: PromptWithKey[];
  meta: PromptGalleryMeta | null;
}

interface PromptGalleryCacheOptions {
  fetchPrompts?: () => Promise<PromptWithKey[]>;
  fetchMeta?: () => Promise<PromptGalleryMeta>;
  now?: () => number;
  ttlMs?: number;
}

export function createPromptGalleryCache({
  fetchPrompts = fetchPromptGallery,
  fetchMeta = fetchPromptGalleryMeta,
  now = Date.now,
  ttlMs = PROMPT_GALLERY_CACHE_TTL_MS,
}: PromptGalleryCacheOptions = {}) {
  let cached: { snapshot: PromptGallerySnapshot; loadedAt: number } | null = null;
  let inFlight: Promise<PromptGallerySnapshot> | null = null;

  function peek(): PromptGallerySnapshot | null {
    return cached?.snapshot ?? null;
  }

  function load(): Promise<PromptGallerySnapshot> {
    if (cached && now() - cached.loadedAt < ttlMs) {
      return Promise.resolve(cached.snapshot);
    }
    if (inFlight) return inFlight;

    const request = Promise.allSettled([fetchPrompts(), fetchMeta()])
      .then(([promptsResult, metaResult]) => {
        if (promptsResult.status === 'rejected') throw promptsResult.reason;
        const snapshot = {
          prompts: promptsResult.value,
          meta: metaResult.status === 'fulfilled'
            ? metaResult.value
            : cached?.snapshot.meta ?? null,
        };
        cached = { snapshot, loadedAt: now() };
        return snapshot;
      })
      .finally(() => {
        if (inFlight === request) inFlight = null;
      });

    inFlight = request;
    return request;
  }

  return { load, peek };
}

export const promptGalleryCache = createPromptGalleryCache();
