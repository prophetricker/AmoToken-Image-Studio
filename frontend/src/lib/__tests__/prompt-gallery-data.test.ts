import { describe, expect, it } from 'vitest';
import {
  ALL_CATEGORY,
  filterPromptGalleryPrompts,
  getPromptCategories,
  normalizePromptCategory,
  toPromptGalleryImageSrc,
} from '@/lib/prompt-gallery-data';

const serverPrompt = {
  id: 'server-1',
  title: 'Stable poster prompt',
  content: 'Create a clean poster composition.',
  images: ['https://example.com/poster.png'],
  tags: ['poster'],
  contributor: 'AmoToken',
  notes: '',
  source: 'local',
  sourceUrl: 'https://example.com/source',
  category: 'poster',
};

describe('prompt gallery filtering helpers', () => {
  it('normalizes long-tail categories and only returns categories with prompts', () => {
    expect(normalizePromptCategory('图像模板 - 产品海报')).toBe('图像模板');
    expect(normalizePromptCategory('视频模板 - 动画')).toBe('视频模板');
    expect(normalizePromptCategory('角色肖像')).toBe('人像/角色');

    const categories = getPromptCategories([
      { category: '图像模板 - 产品海报' },
      { category: '视频模板 - 动画' },
      { category: '角色肖像' },
    ]);

    expect(categories).toEqual([ALL_CATEGORY, '人像/角色', '图像模板', '视频模板']);
  });

  it('filters only by search and selected category without language or blacklist removal', () => {
    const prompts = [
      { ...serverPrompt, title: 'Brand portrait poster', content: 'This contains the old bra keyword.', category: '海报/广告', uniqueKey: 'a' },
      { ...serverPrompt, title: 'English only prompt', content: 'No Chinese text here.', category: '产品/电商', uniqueKey: 'b' },
      { ...serverPrompt, title: '中文角色', content: '这里包含旧黑名单内容', category: '人像/角色', uniqueKey: 'c' },
    ];

    expect(filterPromptGalleryPrompts(prompts)).toHaveLength(3);
    expect(filterPromptGalleryPrompts(prompts, { searchQuery: 'english' }).map(prompt => prompt.uniqueKey)).toEqual(['b']);
    expect(filterPromptGalleryPrompts(prompts, { selectedCategory: '人像/角色' }).map(prompt => prompt.uniqueKey)).toEqual(['c']);
  });

  it('maps external gallery images through the same-origin image endpoint', () => {
    expect(toPromptGalleryImageSrc('https://github.com/user-attachments/assets/demo')).toBe(
      '/api/nova/prompt-gallery/image?url=https%3A%2F%2Fgithub.com%2Fuser-attachments%2Fassets%2Fdemo',
    );
  });
});
