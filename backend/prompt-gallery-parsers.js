const { createHash } = require('node:crypto');

function splitBeforeHeading(markdown, prefix) {
  const blocks = [];
  let current = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith(prefix) && current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) blocks.push(current.join('\n'));
  return blocks;
}

function firstMatch(value, pattern) {
  const match = value.match(pattern);
  return match?.[1] || '';
}

function cleanMarkdownTitle(value) {
  return String(value || '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function absolutizeSourceImage(rawBaseUrl, value) {
  const image = String(value || '').trim();
  if (!image) return '';
  if (/^https?:\/\//i.test(image)) return isValidHttpImage(image) ? image : '';
  if (/^[a-z][a-z\d+.-]*:/i.test(image)) return '';
  if (image.startsWith('//')) {
    const absoluteImage = `https:${image}`;
    return isValidHttpImage(absoluteImage) ? absoluteImage : '';
  }
  const base = String(rawBaseUrl || '').replace(/\/+$/, '');
  if (!base) return image;
  const absoluteImage = `${base}/${image.replace(/^(?:\.\/|\/)+/, '')}`;
  return isValidHttpImage(absoluteImage) ? absoluteImage : '';
}

function isValidHttpImage(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function extractImageEntries(rawBaseUrl, block) {
  const entries = [];
  const patterns = [
    {
      pattern: /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
      altPattern: /\balt\s*=\s*["']([^"']*)["']/i,
    },
    {
      pattern: /!\[([^\]]*)]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g,
    },
  ];

  for (const { pattern, altPattern } of patterns) {
    let match;
    while ((match = pattern.exec(block)) !== null) {
      const isHtml = Boolean(altPattern);
      const value = isHtml ? match[1] : (match[2] || match[3]);
      const alt = isHtml ? (match[0].match(altPattern)?.[1] || '') : match[1];
      const image = absolutizeSourceImage(rawBaseUrl, value);
      if (image) entries.push({ image, alt: alt.trim(), index: match.index });
    }
  }

  return entries.sort((left, right) => left.index - right.index);
}

function extractMarkdownImages(rawBaseUrl, block) {
  const seen = new Set();
  return extractImageEntries(rawBaseUrl, block)
    .map(entry => entry.image)
    .filter((image) => {
      if (seen.has(image)) return false;
      seen.add(image);
      return true;
    });
}

function tagsFromHeading(heading) {
  if (!heading) return [];
  return heading
    .replace(/[^\p{L}\p{N}/&、与 ]/gu, '')
    .split(/\s*(?:\/|&|、|与)\s*/)
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean);
}

function youMindTags(title, modelTag) {
  const tags = modelTag ? [modelTag] : [];
  const parts = title.split(' - ', 2);
  if (parts.length > 1) tags.push(...tagsFromHeading(parts[0]));
  return tags;
}

function inferPromptCategory(title, content, tags = []) {
  const text = `${title || ''} ${content || ''} ${tags.join(' ')}`.toLowerCase();
  if (text.includes('海报') || text.includes('poster')) return '海报/广告';
  if (text.includes('角色') || text.includes('character') || /(^|\W)oc(\W|$)/i.test(text)) return '人像/角色';
  if (text.includes('电商') || text.includes('商品') || text.includes('product')) return '产品/电商';
  if (/(^|\W)ui(\W|$)/i.test(text) || text.includes('界面') || text.includes('设计')) return 'UI';
  if (text.includes('风格') || text.includes('转换') || text.includes('style')) return '创意转换';
  if (text.includes('gpt4o')) return 'gpt4o';
  if (text.includes('gpt-image-2')) return 'gpt-image-2';
  return '其他';
}

function normalizeIdentityValue(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function createIdentityHash(title, content, images) {
  const identity = JSON.stringify([
    normalizeIdentityValue(title),
    normalizeIdentityValue(content),
    images.map(normalizeIdentityValue).sort(),
  ]);
  return createHash('sha256').update(identity).digest('hex').slice(0, 20);
}

function createPrompt(source, values) {
  const tags = Array.isArray(values.tags) ? values.tags.filter(Boolean) : [];
  const images = Array.from(new Set(
    (Array.isArray(values.images) ? values.images : [])
      .map(image => String(image || '').trim())
      .filter(isValidHttpImage),
  ));
  const title = String(values.title || '').trim();
  const content = String(values.content || '').trim();
  return {
    title,
    content,
    images,
    tags,
    contributor: String(values.contributor || ''),
    notes: String(values.notes || ''),
    source: source.id,
    sourceUrl: source.sourceUrl,
    category: values.category || inferPromptCategory(values.title, values.content, tags),
    nativeId: String(values.nativeId || values.id || '').trim(),
    identityHash: createIdentityHash(title, content, images),
  };
}

function finalizePrompts(source, candidates) {
  const validCandidates = candidates.filter(candidate => (
    candidate.title && candidate.content && candidate.images.length > 0
  ));
  const deduplicated = [];
  const seenRecords = new Set();
  for (const candidate of validCandidates) {
    const recordKey = `${candidate.nativeId}\0${candidate.identityHash}`;
    if (seenRecords.has(recordKey)) continue;
    seenRecords.add(recordKey);
    deduplicated.push(candidate);
  }

  const nativeIdCounts = new Map();
  for (const candidate of deduplicated) {
    if (!candidate.nativeId) continue;
    nativeIdCounts.set(candidate.nativeId, (nativeIdCounts.get(candidate.nativeId) || 0) + 1);
  }

  return deduplicated.map(({ nativeId, identityHash, ...candidate }) => {
    const encodedNativeId = encodeURIComponent(nativeId);
    const stableId = nativeId
      ? `${source.id}-${encodedNativeId}${nativeIdCounts.get(nativeId) > 1 ? `-${identityHash}` : ''}`
      : `${source.id}-${identityHash}`;
    return {
      id: stableId,
      ...candidate,
      uniqueKey: stableId,
    };
  });
}

function documentContents(documents) {
  if (Array.isArray(documents)) {
    return documents.map(document => document?.content).filter(content => typeof content === 'string');
  }
  if (documents && typeof documents === 'object') {
    return Object.values(documents)
      .map(document => typeof document === 'string' ? document : document?.content)
      .filter(content => typeof content === 'string');
  }
  return [];
}

function parseNanobanana(source, raw) {
  const data = JSON.parse(raw);
  const prompts = [];
  if (!Array.isArray(data?.sections)) return prompts;
  data.sections.forEach((section) => {
    if (!Array.isArray(section?.prompts)) return;
    section.prompts.forEach((prompt) => {
      prompts.push(createPrompt(source, {
        ...prompt,
        nativeId: prompt.id,
        images: Array.isArray(prompt.images)
          ? prompt.images.map(image => absolutizeSourceImage(source.rawBaseUrl, image))
          : [],
      }));
    });
  });
  return prompts;
}

function parseMarkdownAwesome(source, markdown) {
  const prompts = [];
  for (const section of splitBeforeHeading(markdown, '## ')) {
    const sectionTags = tagsFromHeading(firstMatch(section, /^##\s+(.+)$/m));
    for (const block of splitBeforeHeading(section, '### ')) {
      const title = cleanMarkdownTitle(firstMatch(block, /^###\s+(.+)$/m));
      const content = firstMatch(
        block,
        /\*\*提示词[:：]\*\*\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/,
      );
      if (!title || !content) continue;
      prompts.push(createPrompt(source, {
        title,
        content,
        images: extractMarkdownImages(source.rawBaseUrl, block),
        tags: sectionTags,
      }));
    }
  }
  return prompts;
}

function parseMarkdownGpt4o(source, markdown) {
  const prompts = [];
  for (const block of splitBeforeHeading(markdown, '### ')) {
    const title = cleanMarkdownTitle(firstMatch(block, /^###\s+(.+)$/m));
    const content = firstMatch(block, /-\s*\*\*提示词文本[:：]\*\*\s*`([\s\S]*?)`/);
    if (!title || !content) continue;
    prompts.push(createPrompt(source, {
      title,
      content,
      images: extractMarkdownImages(source.rawBaseUrl, block),
      tags: ['gpt4o'],
      category: 'gpt4o',
    }));
  }
  return prompts;
}

function parseMarkdownYouMind(source, markdown) {
  const prompts = [];
  for (const block of splitBeforeHeading(markdown, '### ')) {
    const title = cleanMarkdownTitle(firstMatch(block, /^###\s+No\.\s*\d+:\s*(.+)$/m));
    const content = firstMatch(
      block,
      /#### .*?提示词\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/,
    );
    if (!title || !content) continue;
    const tags = youMindTags(title, source.modelTag || '');
    prompts.push(createPrompt(source, {
      title,
      content,
      images: extractMarkdownImages(source.rawBaseUrl, block),
      tags,
    }));
  }
  return prompts;
}

function parseDavidWu(source, raw) {
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) return [];
  const prompts = [];
  for (const item of data) {
    const title = String(item?.title_cn || item?.title_en || '').trim();
    const content = String(item?.prompt || '').trim();
    if (!title || !content) continue;
    const tags = [item.category_cn, item.category, item.author, item.source];
    if (item.needs_ref) tags.push('需要参考图');
    const image = absolutizeSourceImage(source.rawBaseUrl, item.image);
    prompts.push(createPrompt(source, {
      nativeId: item.id,
      title,
      content,
      images: image ? [image] : [],
      tags,
      contributor: item.author,
      notes: item.note,
    }));
  }
  return prompts;
}

function stripNumberedHeading(value) {
  return cleanMarkdownTitle(value).replace(/^\d+(?:\.\d+)*\.?\s*/, '').trim();
}

function parseZeroLu(source, markdown) {
  const prompts = [];
  for (const section of splitBeforeHeading(markdown, '## ')) {
    const tags = tagsFromHeading(firstMatch(section, /^##\s+(.+)$/m));
    for (const block of splitBeforeHeading(section, '### ')) {
      const promptPattern = /\*\*Prompt[:：]\*\*\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/gi;
      const images = extractImageEntries(source.rawBaseUrl, block);
      let match;
      while ((match = promptPattern.exec(block)) !== null) {
        const image = images.filter(entry => entry.index < match.index).at(-1) || images[0];
        const heading = stripNumberedHeading(firstMatch(block, /^###\s+(.+)$/m));
        const title = heading || image?.alt;
        if (!title || !image?.image || !match[1].trim()) continue;
        prompts.push(createPrompt(source, {
          title,
          content: match[1],
          images: [image.image],
          tags,
        }));
      }
    }
  }
  return prompts;
}

function labeledWuyoscarPrompts(block) {
  const matches = [];
  const pattern = /\*\*提示词(?:\s+([A-Z]))?(?:\s*[—–-]\s*([^*\r\n]+))?\*\*\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/gi;
  let match;
  while ((match = pattern.exec(block)) !== null) {
    matches.push({
      label: match[1]?.toUpperCase() || '',
      title: cleanMarkdownTitle(match[2]),
      content: match[3].trim(),
    });
  }
  return matches;
}

function parseWuyoscar(source, markdown) {
  const prompts = [];
  for (const block of splitBeforeHeading(markdown, '#### ')) {
    const tableMarkup = block.match(/<table\b[\s\S]*?<\/table>/gi)?.join('\n') || '';
    const tableImages = extractImageEntries(source.rawBaseUrl, tableMarkup);
    const images = tableImages.length > 0
      ? tableImages
      : extractImageEntries(source.rawBaseUrl, block);
    if (images.length === 0) continue;
    const heading = cleanMarkdownTitle(firstMatch(block, /^####\s+(.+)$/m));
    const labeledPrompts = labeledWuyoscarPrompts(block);

    if (labeledPrompts.length > 0) {
      labeledPrompts.forEach((prompt, promptIndex) => {
        const labeledIndex = prompt.label ? prompt.label.charCodeAt(0) - 65 : promptIndex;
        const image = images[labeledIndex] || images[promptIndex];
        if (!image || !prompt.content) return;
        prompts.push(createPrompt(source, {
          title: prompt.title || image.alt || heading,
          content: prompt.content,
          images: [image.image],
          tags: ['gpt-image-2'],
        }));
      });
      continue;
    }

    const content = firstMatch(
      block,
      /<summary>[^\n]*提示词[^\n]*<\/summary>\s*\r?\n\s*```[\w-]*\r?\n([\s\S]*?)\r?\n```/i,
    );
    if (heading && content) {
      prompts.push(createPrompt(source, {
        title: heading,
        content,
        images: [images[0].image],
        tags: ['gpt-image-2'],
      }));
    }
  }
  return prompts;
}

function parseSourceDocuments(source, documents) {
  const contents = documentContents(documents);
  const first = contents[0] || '';
  const markdown = contents.join('\n\n');
  let prompts;
  switch (source?.parser) {
    case 'nanobanana-json':
      prompts = parseNanobanana(source, first);
      break;
    case 'markdown-awesome':
      prompts = parseMarkdownAwesome(source, markdown);
      break;
    case 'markdown-gpt4o':
      prompts = parseMarkdownGpt4o(source, markdown);
      break;
    case 'markdown-youmind':
      prompts = parseMarkdownYouMind(source, markdown);
      break;
    case 'davidwu-json':
      prompts = parseDavidWu(source, first);
      break;
    case 'zerolu-markdown':
      prompts = parseZeroLu(source, markdown);
      break;
    case 'wuyoscar-markdown':
      prompts = parseWuyoscar(source, markdown);
      break;
    default:
      return [];
  }
  return finalizePrompts(source, prompts);
}

module.exports = {
  parseSourceDocuments,
  inferPromptCategory,
  extractMarkdownImages,
  absolutizeSourceImage,
};
