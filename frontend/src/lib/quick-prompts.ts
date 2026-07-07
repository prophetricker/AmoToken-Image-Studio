export type PromptMode = 'text-to-image' | 'image-to-image';

export interface QuickPromptItem {
  title: string;
  content: string;
  type: 1 | 2;
}

const FEATURED_TITLES: Record<PromptMode, string[]> = {
  'text-to-image': [
    '学术论文白板讲解',
    '论转教授白板板书',
    '概念可视化/知识地图',
    '收藏版史诗叙事海报',
    '复古平面半调杂志海报',
    '半调双色雕刻海报',
  ],
  'image-to-image': [
    '图片去水印',
    '人物/物品替换',
    '商品替换',
    '服装/试衣替换',
    '智能抠图',
    '转二次元风格',
    '多图融合',
  ],
};

export function promptTypeForMode(mode: PromptMode): 1 | 2 {
  return mode === 'text-to-image' ? 1 : 2;
}

export function getPromptModeLabel(itemOrMode: QuickPromptItem | PromptMode): string {
  if (typeof itemOrMode === 'string') {
    return itemOrMode === 'text-to-image' ? '文生图' : '图生图';
  }
  return itemOrMode.type === 1 ? '文生图' : '图生图';
}

export function getPromptSummary(content: string, maxLength = 44): string {
  const normalized = content
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

export function filterPromptsForMode(prompts: QuickPromptItem[], mode: PromptMode): QuickPromptItem[] {
  const type = promptTypeForMode(mode);
  return prompts.filter(prompt => prompt.type === type);
}

export function getFeaturedPrompts(prompts: QuickPromptItem[], mode: PromptMode, limit = 6): QuickPromptItem[] {
  const candidates = filterPromptsForMode(prompts, mode);
  const priority = FEATURED_TITLES[mode];
  const seen = new Set<string>();
  const featured: QuickPromptItem[] = [];

  for (const title of priority) {
    const match = candidates.find(prompt => prompt.title === title);
    if (match && !seen.has(match.title)) {
      featured.push(match);
      seen.add(match.title);
    }
  }

  for (const prompt of candidates) {
    if (featured.length >= limit) break;
    if (!seen.has(prompt.title)) {
      featured.push(prompt);
      seen.add(prompt.title);
    }
  }

  return featured.slice(0, limit);
}

export async function fetchQuickPrompts(): Promise<QuickPromptItem[]> {
  try {
    const res = await fetch('/api/nova/prompts');
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is QuickPromptItem => (
      typeof item?.title === 'string'
      && typeof item?.content === 'string'
      && (item.type === 1 || item.type === 2)
    ));
  } catch {
    return [];
  }
}
