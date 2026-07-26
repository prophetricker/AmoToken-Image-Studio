const { createHash } = require('node:crypto');
const { isAllowedPromptImageUrl } = require('./prompt-image-cache');

const AMBIGUOUS_STANDALONE_TERMS = Object.freeze([
  'banana',
  '香蕉',
  'chest',
  'collar',
  'leather',
  'thick',
  'wet',
  'exposure',
  '胸部',
  '衣领',
  '皮革',
  '厚实',
  '湿润',
  '曝光',
]);

const AMBIGUOUS_TERM_SET = new Set(AMBIGUOUS_STANDALONE_TERMS);
const DEFAULT_IGNORABLE_PATTERN = /\p{Default_Ignorable_Code_Point}/gu;
const COMPACT_SEPARATOR_PATTERN = /[\p{P}\p{Z}\p{S}]+/gu;
const MAX_READABLE_IDENTITY_BASE_LENGTH = 160;

function normalizeText(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizePromptContent(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
}

function normalizeMatchBase(value) {
  return String(value || '').normalize('NFKC').toLowerCase();
}

function stripDefaultIgnorables(value) {
  return value.replace(DEFAULT_IGNORABLE_PATTERN, '');
}

function normalizeLatinTokens(value) {
  return value.replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeCompactText(value) {
  return stripDefaultIgnorables(value).replace(COMPACT_SEPARATOR_PATTERN, '');
}

function compilePromptBlacklist(rawKeywords = []) {
  const keywords = Array.isArray(rawKeywords) ? rawKeywords : rawKeywords?.keywords;
  const matchers = [];
  const seen = new Set();

  for (const rawKeyword of Array.isArray(keywords) ? keywords : []) {
    const base = normalizeMatchBase(rawKeyword);
    const stripped = stripDefaultIgnorables(base);
    const compact = normalizeCompactText(base);
    const isLatin = Boolean(compact) && /^[a-z0-9]+$/.test(compact);
    const value = isLatin ? normalizeLatinTokens(stripped) : compact;
    if (!value || AMBIGUOUS_TERM_SET.has(value)) continue;
    const matcherKey = `${isLatin ? 'latin' : 'compact'}\0${value}`;
    if (seen.has(matcherKey)) continue;
    seen.add(matcherKey);
    matchers.push({ isLatin, value });
  }

  return (record) => {
    const text = typeof record === 'string'
      ? record
      : [record?.title, record?.content, record?.notes].filter(Boolean).join(' ');
    const base = normalizeMatchBase(text);
    const stripped = stripDefaultIgnorables(base);
    let latinWithoutIgnorables;
    let latinWithIgnorableBoundaries;
    let compactText;

    return !matchers.some((matcher) => {
      if (!matcher.isLatin) {
        compactText ??= normalizeCompactText(base);
        return compactText.includes(matcher.value);
      }
      latinWithoutIgnorables ??= normalizeLatinTokens(stripped);
      latinWithIgnorableBoundaries ??= normalizeLatinTokens(
        base.replace(DEFAULT_IGNORABLE_PATTERN, ' '),
      );
      const tokenPhrase = ` ${matcher.value} `;
      return ` ${latinWithoutIgnorables} `.includes(tokenPhrase)
        || ` ${latinWithIgnorableBoundaries} `.includes(tokenPhrase);
    });
  };
}

function createContentHash(content) {
  const normalized = normalizeText(content).toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}

function isPromptAllowed(record, rawKeywords = []) {
  return compilePromptBlacklist(rawKeywords)(record);
}

function normalizePromptRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const title = normalizeText(record.title);
  const content = normalizePromptContent(record.content);
  const images = Array.from(new Set(
    (Array.isArray(record.images) ? record.images : [])
      .map(image => String(image || '').trim())
      .filter(isAllowedPromptImageUrl),
  ));
  if (!title || !content || images.length === 0) return null;

  const contentHash = createContentHash(content);
  const normalizedUniqueKey = normalizeText(record.uniqueKey);
  const normalizedId = normalizeText(record.id);
  const identityBase = normalizedUniqueKey || normalizedId;
  const boundedIdentityBase = identityBase.length > MAX_READABLE_IDENTITY_BASE_LENGTH
    ? createHash('sha256').update(identityBase).digest('hex')
    : identityBase;
  const publishedIdentity = boundedIdentityBase === contentHash
    || boundedIdentityBase.endsWith(`-${contentHash}`)
    ? boundedIdentityBase
    : (boundedIdentityBase ? `${boundedIdentityBase}-${contentHash}` : contentHash);
  return {
    id: publishedIdentity,
    title,
    content,
    images,
    tags: Array.from(new Set(
      (Array.isArray(record.tags) ? record.tags : [])
        .map(normalizeText)
        .filter(Boolean),
    )),
    contributor: normalizeText(record.contributor),
    notes: normalizeText(record.notes),
    source: normalizeText(record.source),
    sourceUrl: String(record.sourceUrl || '').trim(),
    category: normalizeText(record.category),
    score: Number.isFinite(Number(record.score)) ? Number(record.score) : 0,
    contentHash,
    uniqueKey: publishedIdentity,
  };
}

function hasChineseTitle(record) {
  return /\p{Script=Han}/u.test(record.title);
}

function isCompleteChineseFacing(record) {
  return hasChineseTitle(record)
    && Boolean(record.source)
    && Boolean(record.sourceUrl)
    && Boolean(record.category);
}

function metadataCompleteness(record) {
  return [
    record.source,
    record.sourceUrl,
    record.category,
    record.contributor,
    record.notes,
    record.tags.length > 0,
  ].filter(Boolean).length;
}

function stableRecordValue(record) {
  return JSON.stringify([
    record.title,
    record.content,
    [...record.images].sort(),
    [...record.tags].sort(),
    record.contributor,
    record.notes,
    record.source,
    record.sourceUrl,
    record.category,
    record.score,
    record.id,
    record.uniqueKey,
  ]);
}

function compareCandidateQuality(left, right) {
  const chineseCompleteness = Number(isCompleteChineseFacing(right))
    - Number(isCompleteChineseFacing(left));
  if (chineseCompleteness !== 0) return chineseCompleteness;
  const metadataDifference = metadataCompleteness(right) - metadataCompleteness(left);
  if (metadataDifference !== 0) return metadataDifference;
  const imageDifference = right.images.length - left.images.length;
  if (imageDifference !== 0) return imageDifference;
  if (right.score !== left.score) return right.score - left.score;
  const hashOrder = left.contentHash.localeCompare(right.contentHash);
  if (hashOrder !== 0) return hashOrder;
  const leftValue = stableRecordValue(left);
  const rightValue = stableRecordValue(right);
  return leftValue < rightValue ? -1 : (leftValue > rightValue ? 1 : 0);
}

function prepareCandidates(records, options = {}) {
  const blacklist = options.blacklist || options.keywords || [];
  const isAllowed = compilePromptBlacklist(blacklist);
  const normalized = (Array.isArray(records) ? records : [])
    .map(normalizePromptRecord)
    .filter(record => record && isAllowed(record))
    .sort(compareCandidateQuality);
  const seenHashes = new Set();
  return normalized.filter((record) => {
    if (seenHashes.has(record.contentHash)) return false;
    seenHashes.add(record.contentHash);
    return true;
  });
}

function selectPublishedCandidates(records, options = {}) {
  const targetCount = Math.max(0, Math.floor(options.targetCount ?? 1000));
  const minimumCount = Math.min(
    targetCount,
    Math.max(0, Math.floor(options.minimumCount ?? 950)),
  );
  const sourceCap = Math.max(1, Math.floor(options.sourceCap ?? 400));
  const categoryCap = Math.max(1, Math.floor(options.categoryCap ?? 250));
  const candidates = prepareCandidates(records, options);
  const selected = [];
  const selectedHashes = new Set();
  const sourceCounts = new Map();
  const categoryCounts = new Map();

  const addMatching = (limit, allowRecord) => {
    for (const record of candidates) {
      if (selected.length >= limit) break;
      if (selectedHashes.has(record.contentHash) || !allowRecord(record)) continue;
      selected.push(record);
      selectedHashes.add(record.contentHash);
      sourceCounts.set(record.source, (sourceCounts.get(record.source) || 0) + 1);
      categoryCounts.set(record.category, (categoryCounts.get(record.category) || 0) + 1);
    }
  };

  addMatching(targetCount, record => (
    (sourceCounts.get(record.source) || 0) < sourceCap
    && (categoryCounts.get(record.category) || 0) < categoryCap
  ));
  if (selected.length < minimumCount) {
    addMatching(minimumCount, record => (sourceCounts.get(record.source) || 0) < sourceCap);
  }
  if (selected.length < minimumCount) {
    addMatching(minimumCount, () => true);
  }

  return selected;
}

function normalizeCandidatesInOrder(records, isAllowed) {
  const normalized = [];
  const seenHashes = new Set();
  for (const rawRecord of Array.isArray(records) ? records : []) {
    const record = normalizePromptRecord(rawRecord);
    if (!record || !isAllowed(record) || seenHashes.has(record.contentHash)) {
      continue;
    }
    normalized.push(record);
    seenHashes.add(record.contentHash);
  }
  return normalized;
}

function rotatePublished(previousRecords, desiredRecords, options = {}) {
  const targetCount = Math.max(0, Math.floor(options.targetCount ?? 1000));
  const minimumCount = Math.min(
    targetCount,
    Math.max(0, Math.floor(options.minimumCount ?? 950)),
  );
  const maxChanges = Math.max(0, Math.floor(options.maxChanges ?? 20));
  const blacklist = options.blacklist || options.keywords || [];
  const isAllowed = compilePromptBlacklist(blacklist);
  const previous = normalizeCandidatesInOrder(previousRecords, isAllowed);
  const desired = normalizeCandidatesInOrder(desiredRecords, isAllowed).slice(0, targetCount);

  if (previous.length < minimumCount) {
    return desired.length >= minimumCount ? desired : previous;
  }

  const desiredHashes = new Set(desired.map(record => record.contentHash));
  const previousHashes = new Set(previous.map(record => record.contentHash));
  const additions = desired.filter(record => !previousHashes.has(record.contentHash));
  let next = [...previous];

  if (next.length < targetCount) {
    next.push(...additions.slice(0, Math.min(maxChanges, targetCount - next.length)));
    return next;
  }

  const stale = next.filter(record => !desiredHashes.has(record.contentHash));
  const replacementCount = Math.min(maxChanges, additions.length, stale.length);
  const removedHashes = new Set(stale.slice(0, replacementCount).map(record => record.contentHash));
  next = next.filter(record => !removedHashes.has(record.contentHash));
  next.push(...additions.slice(0, replacementCount));

  if (next.length > targetCount && replacementCount < maxChanges) {
    const excess = Math.min(next.length - targetCount, maxChanges - replacementCount);
    const removable = next
      .filter(record => !desiredHashes.has(record.contentHash))
      .slice(0, excess);
    const excessHashes = new Set(removable.map(record => record.contentHash));
    next = next.filter(record => !excessHashes.has(record.contentHash));
  }

  return next;
}

function summarizeCategories(records) {
  const counts = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    const category = normalizeText(record?.category);
    if (!category) continue;
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN')),
  );
}

module.exports = {
  AMBIGUOUS_STANDALONE_TERMS,
  createContentHash,
  isPromptAllowed,
  normalizePromptRecord,
  prepareCandidates,
  selectPublishedCandidates,
  rotatePublished,
  summarizeCategories,
};
