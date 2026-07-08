import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';
import { toPromptGalleryImageSrc } from '@/lib/prompt-gallery-data';

const require = createRequire(import.meta.url);
const {
  getPromptImageCacheKey,
  isAllowedPromptImageUrl,
  normalizePromptImageUrl,
} = require('../../../../backend/prompt-image-cache.js') as {
  getPromptImageCacheKey: (url: string) => { fileName: string };
  isAllowedPromptImageUrl: (url: string) => boolean;
  normalizePromptImageUrl: (url: string) => string;
};

const proxiedRawImage = 'https://proxy.ccode.vip/https/raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main/images/1.png';
const rawImage = 'https://raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main/images/1.png';

describe('prompt gallery image proxy URLs', () => {
  it('rewrites external prompt gallery images through the Nova cache endpoint', () => {
    expect(toPromptGalleryImageSrc(proxiedRawImage)).toBe(
      `/api/nova/prompt-gallery/image?url=${encodeURIComponent(proxiedRawImage)}`,
    );
  });

  it('leaves local and inline images untouched', () => {
    expect(toPromptGalleryImageSrc('/api/nova/images/task-1/0')).toBe('/api/nova/images/task-1/0');
    expect(toPromptGalleryImageSrc('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(toPromptGalleryImageSrc('blob:https://img.amotoken.cc/abc')).toBe('blob:https://img.amotoken.cc/abc');
    expect(toPromptGalleryImageSrc('')).toBe('');
  });
});

describe('prompt gallery image cache guard', () => {
  it('normalizes existing ccode raw GitHub proxy URLs to direct raw GitHub URLs', () => {
    expect(normalizePromptImageUrl(proxiedRawImage)).toBe(rawImage);
    expect(getPromptImageCacheKey(proxiedRawImage).fileName).toBe(getPromptImageCacheKey(rawImage).fileName);
  });

  it('allows raw GitHub prompt images and rejects private network proxy targets', () => {
    expect(isAllowedPromptImageUrl(proxiedRawImage)).toBe(true);
    expect(isAllowedPromptImageUrl(rawImage)).toBe(true);
    expect(isAllowedPromptImageUrl('https://proxy.ccode.vip/http/127.0.0.1:3000/admin')).toBe(false);
    expect(isAllowedPromptImageUrl('http://127.0.0.1:3000/admin')).toBe(false);
  });
});
