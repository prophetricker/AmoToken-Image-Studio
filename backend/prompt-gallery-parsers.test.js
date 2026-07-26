const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseSourceDocuments,
  inferPromptCategory,
  extractMarkdownImages,
  absolutizeSourceImage,
} = require('./prompt-gallery-parsers');
const { PROMPT_GALLERY_SOURCES } = require('./prompt-gallery-sources');

const FIXTURE_BY_PARSER = {
  'nanobanana-json': 'nanobanana.json',
  'markdown-awesome': 'markdown-awesome.md',
  'markdown-gpt4o': 'markdown-gpt4o.md',
  'markdown-youmind': 'markdown-youmind.md',
  'davidwu-json': 'davidwu.json',
  'zerolu-markdown': 'zerolu-nanobanana.md',
  'wuyoscar-markdown': 'wuyoscar-gpt-image2.md',
};

const EXPECTED_MINIMUMS = {
  nanobanana: 1000,
  'awesome-gpt-image': 40,
  'awesome-gpt4o-image-prompts': 50,
  'youmind-gpt-image-2': 100,
  'youmind-nano-banana-pro': 100,
  'davidwu-gpt-image2-prompts': 400,
  'zerolu-nanobanana-pro': 20,
  'wuyoscar-gpt-image2': 20,
};

const RECORD_FIELDS = [
  'id',
  'title',
  'content',
  'images',
  'tags',
  'contributor',
  'notes',
  'source',
  'sourceUrl',
  'category',
  'uniqueKey',
];

function loadFixtureDocuments(source) {
  const fixtureName = FIXTURE_BY_PARSER[source.parser];
  assert.ok(fixtureName, `fixture mapping for ${source.parser}`);
  const content = fs.readFileSync(
    path.join(__dirname, 'fixtures', 'prompt-gallery', fixtureName),
    'utf8',
  );
  return source.documents.map(document => ({ name: document.name, content }));
}

test('defines exactly eight enabled prompt gallery sources with stable fetch metadata', () => {
  assert.equal(PROMPT_GALLERY_SOURCES.length, 8);
  assert.deepEqual(
    Object.fromEntries(PROMPT_GALLERY_SOURCES.map(source => [source.id, source.minimumCount])),
    EXPECTED_MINIMUMS,
  );

  const ids = new Set();
  for (const source of PROMPT_GALLERY_SOURCES) {
    assert.equal(source.enabled, true, source.id);
    assert.ok(source.id && source.label && source.sourceUrl, source.id);
    assert.ok(source.license && source.parser, source.id);
    assert.ok(!ids.has(source.id), source.id);
    ids.add(source.id);
    assert.ok(Array.isArray(source.documents) && source.documents.length > 0, source.id);
    for (const document of source.documents) {
      assert.ok(document.name, source.id);
      assert.match(document.directUrl, /^https:\/\/raw\.githubusercontent\.com\//, source.id);
      assert.equal(document.proxyUrl, `https://proxy.ccode.vip/${document.directUrl}`, source.id);
    }
  }

  assert.doesNotMatch(JSON.stringify(PROMPT_GALLERY_SOURCES), /EvoLinkAI/i);
});

test('marks both new prompt sources as MIT licensed', () => {
  for (const id of ['zerolu-nanobanana-pro', 'wuyoscar-gpt-image2']) {
    const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === id);
    assert.equal(source?.license, 'MIT', id);
  }
});

test('parses every enabled source fixture into complete image-backed records', () => {
  for (const source of PROMPT_GALLERY_SOURCES) {
    const prompts = parseSourceDocuments(source, loadFixtureDocuments(source));
    assert.ok(prompts.length > 0, source.id);
    assert.equal(new Set(prompts.map(prompt => prompt.uniqueKey)).size, prompts.length, source.id);

    for (const prompt of prompts) {
      for (const field of RECORD_FIELDS) {
        assert.ok(Object.hasOwn(prompt, field), `${source.id}.${field}`);
      }
      assert.ok(prompt.id && prompt.title && prompt.content, source.id);
      assert.ok(Array.isArray(prompt.images) && prompt.images.length > 0, source.id);
      assert.ok(prompt.images.every(image => /^https?:\/\//.test(image)), source.id);
      assert.ok(Array.isArray(prompt.tags), source.id);
      assert.equal(prompt.source, source.id);
      assert.equal(prompt.sourceUrl, source.sourceUrl);
      assert.ok(prompt.category && prompt.uniqueKey, source.id);
    }
  }
});

test('pairs ZeroLu prompts with their nearest image and heading title', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'zerolu-nanobanana-pro');
  const [prompt] = parseSourceDocuments(source, loadFixtureDocuments(source));

  assert.equal(prompt.title, '复古街头肖像');
  assert.deepEqual(prompt.images, [
    'https://raw.githubusercontent.com/ZeroLu/awesome-nanobanana-pro/main/assets/street-portrait.png',
  ]);
});

test('pairs labeled Wuyoscar prompts with corresponding repository images', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'wuyoscar-gpt-image2');
  const prompts = parseSourceDocuments(source, loadFixtureDocuments(source));

  assert.deepEqual(prompts.map(prompt => prompt.title), [
    '像素艺术汽车精灵图集',
    '像素艺术早餐静物',
  ]);
  assert.deepEqual(prompts.map(prompt => prompt.images[0]), [
    'https://raw.githubusercontent.com/wuyoscar/GPT-Image2-Skill/main/docs/pixel-art/cars.png',
    'https://raw.githubusercontent.com/wuyoscar/GPT-Image2-Skill/main/docs/pixel-art/breakfast.png',
  ]);
});

test('normalizes image URLs and extracts unique Markdown images', () => {
  const rawBaseUrl = 'https://raw.githubusercontent.com/example/gallery/main/';
  assert.equal(
    absolutizeSourceImage(rawBaseUrl, './images/example.png'),
    'https://raw.githubusercontent.com/example/gallery/main/images/example.png',
  );
  assert.equal(
    absolutizeSourceImage(rawBaseUrl, 'https://cdn.example.com/example.png'),
    'https://cdn.example.com/example.png',
  );
  assert.deepEqual(
    extractMarkdownImages(rawBaseUrl, [
      '<img alt="first" src="./images/example.png" />',
      '![duplicate](./images/example.png)',
      '![second](/images/second.png)',
    ].join('\n')),
    [
      'https://raw.githubusercontent.com/example/gallery/main/images/example.png',
      'https://raw.githubusercontent.com/example/gallery/main/images/second.png',
    ],
  );
});

test('infers prompt categories from titles, content, and tags', () => {
  assert.equal(inferPromptCategory('夏日海报', '干净版式', []), '海报/广告');
  assert.equal(inferPromptCategory('工作流', '适用于 gpt-image-2', []), 'gpt-image-2');
  assert.equal(inferPromptCategory('通用案例', '抽象构图', ['style']), '创意转换');
});

test('pure parser methods never call fetch', () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = () => {
    fetchCalls += 1;
    throw new Error('parser attempted a network request');
  };

  try {
    for (const source of PROMPT_GALLERY_SOURCES) {
      parseSourceDocuments(source, loadFixtureDocuments(source));
    }
    inferPromptCategory('海报', '内容', []);
    extractMarkdownImages('https://raw.example/main', '![image](image.png)');
    absolutizeSourceImage('https://raw.example/main', 'image.png');
  } finally {
    global.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 0);
});
