import type { PromptGalleryItem } from '@/lib/prompt-gallery-types';

export type PromptWithKey = PromptGalleryItem & { uniqueKey: string };

export const ALL_CATEGORY = '全部';

export function toPromptGalleryImageSrc(imageUrl?: string): string {
  const value = imageUrl?.trim() || '';
  if (!value) return '';
  if (value.startsWith('/') || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  if (!/^https?:\/\//i.test(value)) return value;
  return `/api/nova/prompt-gallery/image?url=${encodeURIComponent(value)}`;
}

const CATEGORY_ALIASES: Array<[RegExp, string]> = [
  [/^图像模板/i, '图像模板'],
  [/^视频模板/i, '视频模板'],
  [/^(角色肖像|人像|肖像|portrait)/i, '人像/角色'],
  [/^(3D|三维|手办|材质)/i, '3D/材质'],
  [/^(产品|电商|商品)/i, '产品/电商'],
  [/^(UI|界面)/i, 'UI与界面'],
  [/^(海报|广告|Logo|品牌|poster)/i, '海报/广告'],
  [/^(动漫|插画)/i, '动漫/插画'],
  [/^(摄影|食物摄影)/i, '摄影'],
  [/^(风景|场景|建筑|空间)/i, '场景/空间'],
  [/^(信息图|文档)/i, '信息图/文档'],
];

export function normalizePromptCategory(category?: string): string {
  const value = category?.trim() || '其他';
  for (const [pattern, label] of CATEGORY_ALIASES) {
    if (pattern.test(value)) return label;
  }
  return value;
}

export interface PromptGalleryFilterOptions {
  searchQuery?: string;
  selectedCategory?: string;
  includeContributorInSearch?: boolean;
  includeNotesInSearch?: boolean;
  includeTagsInSearch?: boolean;
  includeSourceInSearch?: boolean;
}

function promptMatchesSearch(prompt: PromptWithKey, query: string, options: PromptGalleryFilterOptions): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const values = [prompt.title, prompt.content];
  if (options.includeContributorInSearch ?? true) values.push(prompt.contributor || '');
  if (options.includeNotesInSearch) values.push(prompt.notes || '');
  if (options.includeTagsInSearch) values.push(prompt.tags.join(' '));
  if (options.includeSourceInSearch) values.push(prompt.source || '');

  return values.some(value => value.toLowerCase().includes(normalizedQuery));
}

export function filterPromptGalleryPrompts(
  prompts: PromptWithKey[],
  options: PromptGalleryFilterOptions = {},
): PromptWithKey[] {
  const {
    searchQuery = '',
    selectedCategory = ALL_CATEGORY,
  } = options;

  return prompts.filter((prompt) => {
    if (selectedCategory !== ALL_CATEGORY && prompt.category !== selectedCategory) return false;
    return promptMatchesSearch(prompt, searchQuery, options);
  });
}

export function getPromptCategories(prompts: Array<Pick<PromptWithKey, 'category'>>): string[] {
  const categories = Array.from(new Set(
    prompts
      .map(prompt => normalizePromptCategory(prompt.category))
      .filter(category => category && category !== ALL_CATEGORY),
  )).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const priority = ['海报/广告', '人像/角色', '产品/电商', 'UI与界面', '3D/材质', '动漫/插画', '摄影', '场景/空间', '信息图/文档', '图像模板', '视频模板', '其他'];
  return [
    ALL_CATEGORY,
    ...priority.filter(category => categories.includes(category)),
    ...categories.filter(category => !priority.includes(category)),
  ];
}
