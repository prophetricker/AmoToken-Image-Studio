const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('./prompt-gallery-policy');

test('exports the prompt gallery publication policy API', () => {
  assert.ok(policy, 'prompt gallery policy module must exist');
  for (const name of [
    'AMBIGUOUS_STANDALONE_TERMS',
    'createContentHash',
    'isPromptAllowed',
    'normalizePromptRecord',
    'prepareCandidates',
    'selectPublishedCandidates',
    'rotatePublished',
    'summarizeCategories',
  ]) {
    assert.ok(Object.hasOwn(policy, name), `missing export: ${name}`);
  }
});

const {
  AMBIGUOUS_STANDALONE_TERMS,
  createContentHash,
  isPromptAllowed,
  normalizePromptRecord,
  prepareCandidates,
  selectPublishedCandidates,
  rotatePublished,
  summarizeCategories,
} = policy;

const AMBIGUOUS_TERMS = [
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
];

function prompt(content, overrides = {}) {
  return {
    id: overrides.uniqueKey || `prompt-${content}`,
    uniqueKey: overrides.uniqueKey || `prompt-${content}`,
    title: '产品摄影示例',
    content,
    images: ['https://raw.githubusercontent.com/example/gallery/main/image.png'],
    tags: [],
    source: 'source-a',
    sourceUrl: 'https://github.com/example/gallery',
    category: '产品/电商',
    ...overrides,
  };
}

test('defines exactly the ambiguous standalone terms that must not hard-block prompts', () => {
  assert.deepEqual(AMBIGUOUS_STANDALONE_TERMS, AMBIGUOUS_TERMS);
});

test('normalizes whitespace and case before hashing prompt content with SHA-256', () => {
  const first = createContentHash('  WET\n leather   Collar Product Photo  ');
  const second = createContentHash('wet leather collar product photo');

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('keeps neutral visual vocabulary but blocks only complete prohibited phrases', () => {
  const keywords = [...AMBIGUOUS_TERMS, 'adult content', '色情'];

  assert.equal(isPromptAllowed(prompt('wet leather collar product photo'), keywords), true);
  assert.equal(isPromptAllowed(prompt('editorial adult content poster'), keywords), false);
  assert.equal(isPromptAllowed(prompt('这是一条色情化描述'), keywords), false);
  assert.equal(isPromptAllowed(prompt('an adulthood portrait'), ['adult']), true);
  assert.equal(isPromptAllowed(prompt('an adult portrait'), ['adult']), false);
});

test('blocks prohibited Latin phrases across punctuation, full-width text, and zero-width marks', () => {
  const keywords = ['adult content'];

  for (const content of [
    'adult-content',
    'adult/content',
    'adult\u200bcontent',
    'adult\u200b content',
    'ａｄｕｌｔ／ｃｏｎｔｅｎｔ',
  ]) {
    assert.equal(isPromptAllowed(prompt(content), keywords), false, content);
  }
});

test('blocks compact CJK phrases across punctuation and zero-width marks', () => {
  const keywords = ['色情内容'];

  for (const content of ['色情-内容', '色情\u200b内容', '色情／内容']) {
    assert.equal(isPromptAllowed(prompt(content), keywords), false, content);
  }
});

test('keeps normal ambiguous visual terms neutral after Unicode normalization', () => {
  const keywords = [...AMBIGUOUS_TERMS, 'adult content', '色情内容'];

  assert.equal(
    isPromptAllowed(prompt('ｗｅｔ／leather collar product photo'), keywords),
    true,
  );
});

test('normalizes complete records and rejects missing text or allowed images', () => {
  const normalized = normalizePromptRecord(prompt('  Detailed\n\n product   photo  ', {
    title: '  中文产品标题  ',
    images: [
      'https://raw.githubusercontent.com/example/gallery/main/image.png',
      'https://raw.githubusercontent.com/example/gallery/main/image.png',
      'https://evil.example/image.png',
    ],
  }));

  assert.equal(normalized.title, '中文产品标题');
  assert.equal(normalized.content, 'Detailed\n\n product   photo');
  assert.deepEqual(normalized.images, [
    'https://raw.githubusercontent.com/example/gallery/main/image.png',
  ]);
  assert.equal(normalized.contentHash, createContentHash('Detailed product photo'));
  assert.equal(normalizePromptRecord(prompt('valid', { title: '   ' })), null);
  assert.equal(normalizePromptRecord(prompt('   ')), null);
  assert.equal(normalizePromptRecord(prompt('valid', {
    images: ['https://evil.example/image.png'],
  })), null);
});

test('preserves intentional prompt paragraphs while hashing normalized identity', () => {
  const formatted = 'First scene\r\n\r\n- Keep this detail\r\n- Keep that detail';
  const normalized = normalizePromptRecord(prompt(formatted));

  assert.equal(
    normalized.content,
    'First scene\n\n- Keep this detail\n- Keep that detail',
  );
  assert.equal(
    normalized.contentHash,
    createContentHash('first scene - keep this detail - keep that detail'),
  );
});

test('deduplicates normalized content and keeps the higher-quality Chinese-facing record', () => {
  const lowQualityDuplicate = prompt(' Dramatic  PRODUCT photo ', {
    title: 'Product photo',
    source: '',
    sourceUrl: '',
    category: '',
    score: 100,
    uniqueKey: 'low-quality',
  });
  const highQualityDuplicate = prompt('dramatic product PHOTO', {
    title: '高质感产品摄影',
    source: 'curated-source',
    sourceUrl: 'https://github.com/example/curated',
    category: '产品/电商',
    score: 1,
    uniqueKey: 'high-quality',
  });
  const result = prepareCandidates([lowQualityDuplicate, highQualityDuplicate]);

  assert.equal(result.length, 1);
  assert.equal(result[0].source, 'curated-source');
  assert.match(result[0].uniqueKey, /^high-quality-[a-f0-9]{64}$/);
});

test('uses score after Chinese-facing completeness and filters prohibited candidates', () => {
  const lowerScore = prompt('same safe layout', {
    title: '中文构图',
    score: 2,
    uniqueKey: 'lower-score',
  });
  const higherScore = prompt(' SAME\nSAFE layout ', {
    title: '中文构图改进版',
    score: 8,
    uniqueKey: 'higher-score',
  });
  const prohibited = prompt('an explicit prohibited phrase', {
    uniqueKey: 'prohibited',
  });
  const result = prepareCandidates(
    [prohibited, lowerScore, higherScore],
    { blacklist: ['explicit prohibited phrase'] },
  );

  assert.match(result[0].uniqueKey, /^higher-score-[a-f0-9]{64}$/);
});

test('deduplication uses a deterministic total order and prefers complete metadata and images', () => {
  const sparse = prompt('identical total-order content', {
    title: '相同中文标题',
    score: 7,
    uniqueKey: 'same-key',
    contributor: '',
    notes: '',
    images: ['https://raw.githubusercontent.com/example/gallery/main/sparse.png'],
  });
  const complete = prompt('identical total-order content', {
    title: '相同中文标题',
    score: 7,
    uniqueKey: 'same-key',
    contributor: 'curator',
    notes: '完整使用说明',
    images: [
      'https://raw.githubusercontent.com/example/gallery/main/complete-a.png',
      'https://raw.githubusercontent.com/example/gallery/main/complete-b.png',
    ],
  });

  const forward = prepareCandidates([sparse, complete]);
  const reversed = prepareCandidates([complete, sparse]);

  assert.deepEqual(forward, reversed);
  assert.deepEqual(forward[0].images, complete.images);
  assert.equal(forward[0].notes, complete.notes);
});

test('publishes only explicit fields and binds normalized identities to content hashes', () => {
  const first = normalizePromptRecord(prompt('first identity content', {
    id: '  shared-id  ',
    uniqueKey: '   ',
    internalSecret: 'must-not-leak',
    parserState: { raw: true },
  }));
  const second = normalizePromptRecord(prompt('second identity content', {
    id: 'shared-id',
    uniqueKey: '',
    internalSecret: 'must-not-leak',
  }));

  assert.match(first.id, /^shared-id-[a-f0-9]{64}$/);
  assert.equal(first.uniqueKey, first.id);
  assert.match(second.id, /^shared-id-[a-f0-9]{64}$/);
  assert.equal(second.uniqueKey, second.id);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(Object.keys(first).sort(), [
    'category',
    'content',
    'contentHash',
    'contributor',
    'id',
    'images',
    'notes',
    'score',
    'source',
    'sourceUrl',
    'tags',
    'title',
    'uniqueKey',
  ]);
  assert.equal(Object.hasOwn(first, 'internalSecret'), false);
  assert.equal(Object.hasOwn(first, 'parserState'), false);
});

function buildCandidatePool(count, options = {}) {
  const sourceCount = options.sourceCount || 5;
  const categoryCount = options.categoryCount || 4;
  return Array.from({ length: count }, (_, index) => prompt(`unique prompt content ${index}`, {
    title: `中文提示词 ${index}`,
    source: `source-${index % sourceCount}`,
    sourceUrl: `https://github.com/example/source-${index % sourceCount}`,
    category: `分类-${index % categoryCount}`,
    score: index % 17,
    uniqueKey: `candidate-${index}`,
    images: [`https://raw.githubusercontent.com/example/gallery/main/image-${index}.png`],
  }));
}

function countBy(records, field) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record[field], (counts.get(record[field]) || 0) + 1);
  }
  return counts;
}

test('selects 1000 deterministically with source and category soft caps', () => {
  const candidatePool = buildCandidatePool(1200);
  const options = {
    targetCount: 1000,
    minimumCount: 950,
    sourceCap: 400,
    categoryCap: 250,
  };
  const first = selectPublishedCandidates(candidatePool, options);
  const second = selectPublishedCandidates([...candidatePool].reverse(), options);

  assert.equal(first.length, 1000);
  assert.deepEqual(
    first.map(item => item.uniqueKey),
    second.map(item => item.uniqueKey),
  );
  assert.ok([...countBy(first, 'source').values()].every(count => count <= 400));
  assert.ok([...countBy(first, 'category').values()].every(count => count <= 250));
});

test('precompiles blacklist matchers once per prepare and select batch', () => {
  const candidates = buildCandidatePool(50);
  let prepareConversions = 0;
  let selectConversions = 0;
  const prepareKeyword = {
    toString() {
      prepareConversions += 1;
      return 'never blocked phrase';
    },
  };
  const selectKeyword = {
    toString() {
      selectConversions += 1;
      return 'another absent phrase';
    },
  };

  assert.equal(prepareCandidates(candidates, { blacklist: [prepareKeyword] }).length, 50);
  assert.equal(prepareConversions, 1);
  assert.equal(selectPublishedCandidates(candidates, {
    blacklist: [selectKeyword],
    targetCount: 50,
    minimumCount: 40,
    sourceCap: 50,
    categoryCap: 50,
  }).length, 50);
  assert.equal(selectConversions, 1);
});

test('relaxes soft caps only enough to restore the healthy minimum', () => {
  const imbalanced = buildCandidatePool(1000, { sourceCount: 1, categoryCount: 1 });
  const selected = selectPublishedCandidates(imbalanced, {
    targetCount: 1000,
    minimumCount: 950,
    sourceCap: 400,
    categoryCap: 250,
  });

  assert.equal(selected.length, 950);
});

function changedKeys(before, after) {
  const beforeKeys = new Set(before.map(item => item.uniqueKey));
  const afterKeys = new Set(after.map(item => item.uniqueKey));
  return {
    additions: [...afterKeys].filter(key => !beforeKeys.has(key)),
    removals: [...beforeKeys].filter(key => !afterKeys.has(key)),
  };
}

test('rotates no more than 20 records after a healthy publication', () => {
  const previous = prepareCandidates(buildCandidatePool(1000));
  const replacements = Array.from({ length: 100 }, (_, index) => prompt(
    `new replacement content ${index}`,
    {
      title: `新提示词 ${index}`,
      source: `new-source-${index % 3}`,
      sourceUrl: 'https://github.com/example/new-source',
      category: `新分类-${index % 4}`,
      score: 100,
      uniqueKey: `replacement-${index}`,
      images: [`https://raw.githubusercontent.com/example/new/main/${index}.png`],
    },
  ));
  const desired = prepareCandidates([...previous.slice(0, 900), ...replacements]);
  const next = rotatePublished(previous, desired, {
    targetCount: 1000,
    minimumCount: 950,
    maxChanges: 20,
  });
  const changes = changedKeys(previous, next);

  assert.equal(next.length, 1000);
  assert.equal(changes.additions.length, 20);
  assert.equal(changes.removals.length, 20);
  assert.ok(previous.slice(0, 900).every(record => (
    next.some(candidate => candidate.contentHash === record.contentHash)
  )));
});

test('recovers a snapshot below 950 directly to the target count', () => {
  const previous = prepareCandidates(buildCandidatePool(900));
  const desired = selectPublishedCandidates(buildCandidatePool(1200), {
    targetCount: 1000,
    minimumCount: 950,
    sourceCap: 400,
    categoryCap: 250,
  });
  const next = rotatePublished(previous, desired, {
    targetCount: 1000,
    minimumCount: 950,
    maxChanges: 20,
  });

  assert.equal(next.length, 1000);
  assert.deepEqual(
    next.map(item => item.uniqueKey),
    desired.map(item => item.uniqueKey),
  );
});

test('keeps sub-950 previous snapshots when the desired pool is also unhealthy', () => {
  const desired = prepareCandidates(Array.from({ length: 100 }, (_, index) => prompt(
    `small desired pool ${index}`,
    {
      title: `小候选池 ${index}`,
      uniqueKey: `small-desired-${index}`,
      images: [`https://raw.githubusercontent.com/example/small/main/${index}.png`],
    },
  )));

  for (const previousCount of [900, 949]) {
    const previous = prepareCandidates(buildCandidatePool(previousCount));
    const next = rotatePublished(previous, desired, {
      targetCount: 1000,
      minimumCount: 950,
      maxChanges: 20,
    });

    assert.equal(next.length, previousCount);
    assert.deepEqual(
      next.map(item => item.uniqueKey),
      previous.map(item => item.uniqueKey),
    );
  }
});

test('summarizes only non-empty categories in deterministic order', () => {
  const records = [
    prompt('first', { category: '海报/广告', uniqueKey: 'first' }),
    prompt('second', { category: '', uniqueKey: 'second' }),
    prompt('third', { category: '产品/电商', uniqueKey: 'third' }),
    prompt('fourth', { category: '海报/广告', uniqueKey: 'fourth' }),
  ];

  assert.deepEqual(summarizeCategories(records), {
    '产品/电商': 1,
    '海报/广告': 2,
  });
});
