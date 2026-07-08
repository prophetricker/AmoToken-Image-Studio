import type { PromptGalleryData, PromptGalleryItem, PromptGallerySection } from '@/lib/prompt-gallery-types';

export interface PromptDataSource {
  name: string;
  url: string;
  sourceUrl: string;
  type: string;
  baseUrl?: string;
  caseFiles?: string[];
  modelTag?: string;
}

export type PromptWithKey = PromptGalleryItem & { uniqueKey: string };

export const PROMPT_DATA_SOURCES: PromptDataSource[] = [
  {
    name: 'nanobanana',
    url: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/unknowlei/nanobanana-website/refs/heads/main/public/data.json',
    sourceUrl: 'https://github.com/unknowlei/nanobanana-website',
    type: 'nanobanana',
  },
  {
    name: 'gpt-image-2-prompts',
    url: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main/data/ingested_tweets.json',
    sourceUrl: 'https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts',
    baseUrl: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts/main',
    type: 'gpt-image-2',
    caseFiles: ['README.md', 'cases/ad-creative.md', 'cases/character.md', 'cases/comparison.md', 'cases/ecommerce.md', 'cases/portrait.md', 'cases/poster.md', 'cases/ui.md'],
  },
  {
    name: 'awesome-gpt-image',
    url: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/README.zh-CN.md',
    sourceUrl: 'https://github.com/ZeroLu/awesome-gpt-image',
    baseUrl: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main',
    type: 'markdown-awesome',
  },
  {
    name: 'awesome-gpt4o-image-prompts',
    url: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main/README.zh-CN.md',
    sourceUrl: 'https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts',
    baseUrl: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/ImgEdify/Awesome-GPT4o-Image-Prompts/main',
    type: 'markdown-gpt4o',
  },
  {
    name: 'youmind-gpt-image-2',
    url: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README_zh.md',
    sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2',
    baseUrl: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main',
    type: 'markdown-youmind',
    modelTag: 'gpt-image-2',
  },
  {
    name: 'youmind-nano-banana-pro',
    url: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main/README_zh.md',
    sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts',
    baseUrl: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts/main',
    type: 'markdown-youmind',
    modelTag: 'nano-banana-pro',
  },
  {
    name: 'davidwu-gpt-image2-prompts',
    url: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main/prompts.json',
    sourceUrl: 'https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts',
    baseUrl: 'https://proxy.ccode.vip/https/raw.githubusercontent.com/davidwuw0811-boop/awesome-gpt-image2-prompts/main',
    type: 'davidwu-json',
  },
];

export const DEFAULT_CATEGORIES = ['全部', '海报', '角色', '电商', 'UI', '风格转换', 'gpt-image-2', 'gpt4o', '其他'];

export const ALL_CATEGORY = '全部';

export function toPromptGalleryImageSrc(imageUrl?: string): string {
  const value = imageUrl?.trim() || '';
  if (!value) return '';
  if (
    value.startsWith('/')
    || value.startsWith('data:')
    || value.startsWith('blob:')
  ) {
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
  [/^(海报|广告|Logo|品牌)/i, '海报/广告'],
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLatinKeyword(keyword: string): boolean {
  return /^[a-z0-9][a-z0-9 -]*$/i.test(keyword);
}

function keywordMatchesText(text: string, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return false;
  if (isLatinKeyword(normalized)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`, 'i').test(text);
  }
  return text.includes(normalized);
}

export function isPromptBlockedByKeywords(prompt: PromptGalleryItem, keywords: string[]): boolean {
  const text = [
    prompt.title,
    prompt.content,
    prompt.notes || '',
  ].join(' ').toLowerCase();
  return keywords.some(keyword => keywordMatchesText(text, keyword));
}

export async function fetchPromptBlacklist(): Promise<string[]> {
  try {
    const res = await fetch('/api/nova/blacklist', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as { keywords?: unknown };
    return Array.isArray(data.keywords)
      ? data.keywords.filter((keyword: unknown): keyword is string => typeof keyword === 'string').map(keyword => keyword.toLowerCase())
      : [];
  } catch {
    return [];
  }
}

export interface PromptGalleryFilterOptions {
  blacklist?: string[];
  searchQuery?: string;
  selectedCategory?: string;
  includeContributorInSearch?: boolean;
  includeNotesInSearch?: boolean;
  includeTagsInSearch?: boolean;
  includeSourceInSearch?: boolean;
}

export function promptHasChinese(prompt: Pick<PromptGalleryItem, 'title' | 'content'>): boolean {
  return /[\u4e00-\u9fa5]/.test(prompt.title) || /[\u4e00-\u9fa5]/.test(prompt.content);
}

function promptMatchesSearch(prompt: PromptWithKey, query: string, options: PromptGalleryFilterOptions): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const values = [
    prompt.title,
    prompt.content,
  ];
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
    blacklist = [],
    searchQuery = '',
    selectedCategory = ALL_CATEGORY,
  } = options;

  return prompts.filter((prompt) => {
    if (blacklist.length > 0 && isPromptBlockedByKeywords(prompt, blacklist)) return false;
    if (!promptHasChinese(prompt)) return false;
    if (selectedCategory !== ALL_CATEGORY && prompt.category !== selectedCategory) return false;
    return promptMatchesSearch(prompt, searchQuery, options);
  });
}

export function getPromptCategories(prompts: Array<Pick<PromptWithKey, 'category'>>): string[] {
  const categories = Array.from(new Set(
    prompts
      .map(prompt => normalizePromptCategory(prompt.category))
      .filter(category => category && category !== ALL_CATEGORY)
  )).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const priority = ['海报/广告', '人像/角色', '产品/电商', 'UI与界面', '3D/材质', '动漫/插画', '摄影', '场景/空间', '信息图/文档', '图像模板', '视频模板', '其他'];
  return [
    ALL_CATEGORY,
    ...priority.filter(category => categories.includes(category)),
    ...categories.filter(category => !priority.includes(category)),
  ];
}

/** 从 GitHub 来源链接推导展示名（owner/repo），用于来源列表展示 */
export function getPromptSourceLabel(sourceUrl: string): string {
  return sourceUrl.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
}

// --- Parsing utilities ---

export function inferCategory(title: string, content: string, tags: string[]): string {
  const text = `${title} ${content} ${tags.join(' ')}`.toLowerCase();
  if (text.includes('海报') || text.includes('poster')) return '海报/广告';
  if (text.includes('角色') || text.includes('character') || text.includes('oc')) return '人像/角色';
  if (text.includes('电商') || text.includes('商品') || text.includes('product')) return '产品/电商';
  if (text.includes('ui') || text.includes('界面') || text.includes('设计')) return 'UI';
  if (text.includes('风格') || text.includes('转换') || text.includes('style')) return '创意转换';
  if (text.includes('gpt4o')) return 'gpt4o';
  if (text.includes('gpt-image-2')) return 'gpt-image-2';
  return '其他';
}

function splitBeforeHeading(markdown: string, prefix: string): string[] {
  const blocks: string[] = [];
  const lines = markdown.split('\n');
  let current: string[] = [];
  for (const line of lines) {
    if (line.startsWith(prefix) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }
  return blocks;
}

function firstMatch(value: string, pattern: RegExp): string {
  const match = value.match(pattern);
  return match && match[1] ? match[1] : '';
}

function absoluteImage(baseURL: string, image: string): string {
  if (!image) return '';
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${baseURL}/${image.replace(/^\./, '').replace(/^\//, '')}`;
}

function extractMarkdownImages(baseURL: string, block: string): string[] {
  const seen = new Set<string>();
  const images: string[] = [];
  const patterns = [/<img[^>]+src="([^"]+)"/g, /!\[[^\]]*\]\(([^)]+)\)/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(block)) !== null) {
      const image = absoluteImage(baseURL, match[1]);
      if (image && !seen.has(image)) {
        seen.add(image);
        images.push(image);
      }
    }
  }
  return images;
}

function tagsFromHeading(heading: string): string[] {
  if (!heading) return [];
  return heading.replace(/[^\p{L}\p{N}/&、与 ]/gu, '').split(/\s*(\/|&|、|与)\s*/).map(t => t.trim().toLowerCase()).filter(Boolean);
}

function tagsFromCategory(category?: string): string[] {
  if (!category) return [];
  return category.replace(/\s+Cases$/i, '').split(/\s*(&|and)\s*/).map(t => t.trim()).filter(Boolean);
}

function youMindTags(title: string, modelTag: string): string[] {
  const tags = [modelTag];
  const parts = title.split(' - ', 2);
  if (parts.length > 1) {
    tags.push(...tagsFromHeading(parts[0]));
  }
  return tags;
}

function collectGptImage2Cases(cases: Record<string, string>, markdown: string) {
  const re = /### Case \d+: \[[^\]]+\]\(([^)]+)\).*?\*\*Prompt:\*\*\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/g;
  let match;
  while ((match = re.exec(markdown)) !== null) {
    cases[match[1]] = match[2].trim();
  }
}

// --- Source-specific parsers ---

function parseNanobanana(json: unknown, source: PromptDataSource): PromptWithKey[] {
  const results: PromptWithKey[] = [];
  const data = json as PromptGalleryData;
  data.sections.forEach((section: PromptGallerySection, sectionIdx: number) => {
    section.prompts.forEach((prompt: PromptGalleryItem, promptIdx: number) => {
      const category = inferCategory(prompt.title, prompt.content, prompt.tags);
      results.push({
        ...prompt,
        source: source.name,
        sourceUrl: source.sourceUrl,
        category,
        uniqueKey: `${source.name}-${section.id}-${prompt.id}-${sectionIdx}-${promptIdx}`
      });
    });
  });
  return results;
}

async function parseGptImage2(source: PromptDataSource): Promise<PromptWithKey[]> {
  const cases: Record<string, string> = {};
  const res = await fetch(source.url);
  if (!res.ok) return [];
  const json = await res.json();

  if (source.caseFiles) {
    const markdownResults = await Promise.allSettled(
      source.caseFiles.map(file => fetch(`${source.baseUrl}/${file}`).then(r => r.ok ? r.text() : ''))
    );
    for (const result of markdownResults) {
      if (result.status === 'fulfilled' && result.value) {
        collectGptImage2Cases(cases, result.value);
      }
    }
  }

  const results: PromptWithKey[] = [];
  if (Array.isArray(json.records)) {
    json.records.forEach((record: { title?: string; tweet_url?: string; image_dir?: string; category?: string }, idx: number) => {
      if (!record.title) return;
      const promptText = cases[record.tweet_url || ''];
      if (!promptText) return;
      const imageUrl = `${source.baseUrl}/${record.image_dir}/output.jpg`;
      results.push({
        id: `gpt-image-2-${idx}`,
        title: record.title,
        content: promptText,
        images: [imageUrl],
        tags: tagsFromCategory(record.category),
        contributor: '',
        notes: '',
        source: source.name,
        sourceUrl: source.sourceUrl,
        category: 'gpt-image-2',
        uniqueKey: `${source.name}-${idx}`
      });
    });
  }
  return results;
}

async function parseMarkdownAwesome(source: PromptDataSource): Promise<PromptWithKey[]> {
  const res = await fetch(source.url);
  if (!res.ok) return [];
  const markdown = await res.text();
  const baseURL = source.baseUrl || '';
  const prompts: PromptWithKey[] = [];
  const sections = splitBeforeHeading(markdown, '## ');
  for (const section of sections) {
    const sectionTags = tagsFromHeading(firstMatch(section, /^##\s+(.+)$/m));
    const blocks = splitBeforeHeading(section, '### ');
    for (const block of blocks) {
      let title = firstMatch(block, /^###\s+(.+)$/m);
      title = title.replace(/\[([^\]]+)]\([^)]+\)/g, '$1').trim();
      const prompt = firstMatch(block, /\*\*提示词:\*\*\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/);
      if (!title || !prompt) continue;
      const category = inferCategory(title, prompt, sectionTags);
      const idx = prompts.length;
      prompts.push({
        id: `${source.name}-${idx}`,
        title,
        content: prompt.trim(),
        images: extractMarkdownImages(baseURL, block),
        tags: sectionTags,
        contributor: '',
        notes: '',
        source: source.name,
        sourceUrl: source.sourceUrl,
        category,
        uniqueKey: `${source.name}-${idx}`,
      });
    }
  }
  return prompts;
}

async function parseMarkdownGpt4o(source: PromptDataSource): Promise<PromptWithKey[]> {
  const res = await fetch(source.url);
  if (!res.ok) return [];
  const markdown = await res.text();
  const baseURL = source.baseUrl || '';
  const prompts: PromptWithKey[] = [];
  const blocks = splitBeforeHeading(markdown, '### ');
  for (const block of blocks) {
    const title = firstMatch(block, /^###\s+(.+)$/m).trim();
    const prompt = firstMatch(block, /- \*\*提示词文本：\*\*\s*`([\s\S]*?)`/);
    if (!title || !prompt) continue;
    const idx = prompts.length;
    prompts.push({
      id: `${source.name}-${idx}`,
      title,
      content: prompt.trim(),
      images: extractMarkdownImages(baseURL, block),
      tags: ['gpt4o'],
      contributor: '',
      notes: '',
      source: source.name,
      sourceUrl: source.sourceUrl,
      category: 'gpt4o',
      uniqueKey: `${source.name}-${idx}`,
    });
  }
  return prompts;
}

async function parseMarkdownYouMind(source: PromptDataSource): Promise<PromptWithKey[]> {
  const res = await fetch(source.url);
  if (!res.ok) return [];
  const markdown = await res.text();
  const baseURL = source.baseUrl || '';
  const modelTag = source.modelTag || '';
  const prompts: PromptWithKey[] = [];
  const blocks = splitBeforeHeading(markdown, '### ');
  for (const block of blocks) {
    const title = firstMatch(block, /^###\s+No\.\s*\d+:\s*(.+)$/m).trim();
    const prompt = firstMatch(block, /#### .*?提示词\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/);
    if (!title || !prompt) continue;
    const tags = youMindTags(title, modelTag);
    const category = inferCategory(title, prompt, tags);
    const idx = prompts.length;
    prompts.push({
      id: `${source.name}-${idx}`,
      title,
      content: prompt.trim(),
      images: extractMarkdownImages(baseURL, block),
      tags,
      contributor: '',
      notes: '',
      source: source.name,
      sourceUrl: source.sourceUrl,
      category,
      uniqueKey: `${source.name}-${idx}`,
    });
  }
  return prompts;
}

interface DavidWuItem {
  id?: string;
  title_cn?: string;
  title_en?: string;
  prompt?: string;
  image?: string;
  category_cn?: string;
  category?: string;
  author?: string;
  source?: string;
  needs_ref?: boolean;
  note?: string;
}

async function parseDavidWuJson(source: PromptDataSource): Promise<PromptWithKey[]> {
  const res = await fetch(source.url);
  if (!res.ok) return [];
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  const baseURL = source.baseUrl || '';
  const prompts: PromptWithKey[] = [];
  for (const item of json as DavidWuItem[]) {
    const title = item.title_cn?.trim() || item.title_en?.trim();
    if (!title) continue;
    const prompt = item.prompt?.trim();
    if (!prompt) continue;
    const image = absoluteImage(baseURL, item.image || '');
    const tags: string[] = [];
    if (item.category_cn) tags.push(item.category_cn);
    if (item.category) tags.push(item.category);
    if (item.author) tags.push(item.author);
    if (item.source) tags.push(item.source);
    if (item.needs_ref) tags.push('需要参考图');
    const category = inferCategory(title, prompt, tags);
    const idx = prompts.length;
    prompts.push({
      id: `${source.name}-${item.id || idx}`,
      title,
      content: prompt,
      images: image ? [image] : [],
      tags: tags.filter(Boolean),
      contributor: item.author || '',
      notes: item.note || '',
      source: source.name,
      sourceUrl: source.sourceUrl,
      category,
      uniqueKey: `${source.name}-${idx}`,
    });
  }
  return prompts;
}

// --- Fetch all sources in parallel ---

function fetchSource(source: PromptDataSource): Promise<PromptWithKey[]> {
  switch (source.type) {
    case 'nanobanana':
      return fetch(source.url)
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(json => parseNanobanana(json, source));
    case 'gpt-image-2':
      return parseGptImage2(source);
    case 'markdown-awesome':
      return parseMarkdownAwesome(source);
    case 'markdown-gpt4o':
      return parseMarkdownGpt4o(source);
    case 'markdown-youmind':
      return parseMarkdownYouMind(source);
    case 'davidwu-json':
      return parseDavidWuJson(source);
    default:
      return Promise.resolve([]);
  }
}

export interface FetchResult {
  prompts: PromptWithKey[];
  categories: string[];
}

type PromptSourceFetcher = () => Promise<FetchResult>;

function normalizeServerPrompt(raw: unknown, index: number): PromptWithKey | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Partial<PromptGalleryItem> & {
    source?: string;
    sourceUrl?: string;
    category?: string;
    uniqueKey?: string;
  };
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const content = typeof item.content === 'string' ? item.content.trim() : '';
  if (!title || !content) return null;
  const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === 'string') : [];
  const rawCategory = typeof item.category === 'string' && item.category.trim()
    ? item.category.trim()
    : inferCategory(title, content, tags);
  const category = normalizePromptCategory(rawCategory);
  const source = typeof item.source === 'string' && item.source.trim() ? item.source.trim() : 'server';
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `server-${index}`;
  return {
    id,
    title,
    content,
    images: Array.isArray(item.images) ? item.images.filter((image): image is string => typeof image === 'string') : [],
    tags,
    contributor: typeof item.contributor === 'string' ? item.contributor : '',
    notes: typeof item.notes === 'string' ? item.notes : '',
    source,
    sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : '',
    category,
    uniqueKey: typeof item.uniqueKey === 'string' && item.uniqueKey.trim()
      ? item.uniqueKey
      : `server-${source}-${id}-${index}`,
  };
}

function normalizeServerPromptData(data: unknown): PromptWithKey[] {
  const rawPrompts: unknown[] = [];
  if (Array.isArray(data)) {
    rawPrompts.push(...data);
  } else if (data && typeof data === 'object' && Array.isArray((data as PromptGalleryData).sections)) {
    for (const section of (data as PromptGalleryData).sections) {
      if (Array.isArray(section.prompts)) rawPrompts.push(...section.prompts);
    }
  }
  return rawPrompts
    .map((item, index) => normalizeServerPrompt(item, index))
    .filter((prompt): prompt is PromptWithKey => Boolean(prompt));
}

function categoriesFromPrompts(prompts: PromptWithKey[]): string[] {
  return getPromptCategories(prompts);
}

export async function fetchAllPromptSources(): Promise<FetchResult> {
  const settled = await Promise.allSettled(
    PROMPT_DATA_SOURCES.map(source => fetchSource(source))
  );

  const prompts: PromptWithKey[] = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      for (const p of result.value) {
        const normalizedPrompt = { ...p, category: normalizePromptCategory(p.category) };
        prompts.push(normalizedPrompt);
      }
    }
  }

  return {
    prompts,
    categories: getPromptCategories(prompts),
  };
}

export async function fetchStablePromptGallery(fallback: PromptSourceFetcher = fetchAllPromptSources): Promise<FetchResult> {
  try {
    const res = await fetch('/api/nova/prompts', { cache: 'no-store' });
    if (res.ok) {
      const prompts = normalizeServerPromptData(await res.json());
      if (prompts.length > 0) {
        return {
          prompts,
          categories: categoriesFromPrompts(prompts),
        };
      }
    }
  } catch {
    // External aggregation remains the fallback when the local snapshot is unavailable.
  }
  return fallback();
}
