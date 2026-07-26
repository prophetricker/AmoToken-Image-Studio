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
      assert.match(
        document.proxyUrl,
        /^https:\/\/proxy\.ccode\.vip\/https\/raw\.githubusercontent\.com\//,
        source.id,
      );
    }
  }

  assert.doesNotMatch(JSON.stringify(PROMPT_GALLERY_SOURCES), /EvoLinkAI/i);

  const wuyoscar = PROMPT_GALLERY_SOURCES.find(source => source.id === 'wuyoscar-gpt-image2');
  assert.equal(
    wuyoscar.documents[0].proxyUrl,
    'https://proxy.ccode.vip/https/raw.githubusercontent.com/wuyoscar/GPT-Image2-Skill/main/README.zh.md',
  );
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

test('keeps record keys stable across insertion and reordering while resolving duplicate native ids', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'nanobanana');
  const originalRecords = [
    {
      id: 'stable-id',
      title: '原始海报',
      content: '创建一张稳定标识的海报。',
      images: ['https://images.example.com/original.png'],
      tags: ['海报'],
    },
    {
      id: 'duplicate-id',
      title: '重复编号甲',
      content: '第一条使用重复来源编号。',
      images: ['https://images.example.com/duplicate-a.png'],
      tags: [],
    },
    {
      id: 'duplicate-id',
      title: '重复编号乙',
      content: '第二条使用重复来源编号。',
      images: ['https://images.example.com/duplicate-b.png'],
      tags: [],
    },
  ];
  const makeDocument = records => [{
    name: 'public/data.json',
    content: JSON.stringify({ sections: [{ id: 'fixture', prompts: records }] }),
  }];

  const before = parseSourceDocuments(source, makeDocument(originalRecords));
  const after = parseSourceDocuments(source, makeDocument([
    {
      id: 'inserted-id',
      title: '前插记录',
      content: '插入到原始文档最前面的新记录。',
      images: ['https://images.example.com/inserted.png'],
      tags: [],
    },
    originalRecords[2],
    originalRecords[0],
    originalRecords[1],
  ]));

  const beforeKeys = Object.fromEntries(before.map(prompt => [prompt.title, prompt.uniqueKey]));
  const afterKeys = Object.fromEntries(after.map(prompt => [prompt.title, prompt.uniqueKey]));
  for (const record of originalRecords) {
    assert.equal(afterKeys[record.title], beforeKeys[record.title], record.title);
  }
  assert.equal(new Set(after.map(prompt => prompt.id)).size, after.length);
  assert.equal(new Set(after.map(prompt => prompt.uniqueKey)).size, after.length);

  const markdownSource = PROMPT_GALLERY_SOURCES.find(
    candidate => candidate.id === 'awesome-gpt-image',
  );
  const markdownRecord = (title, content, image) => [
    `### ${title}`,
    '',
    `![${title}](${image})`,
    '',
    '**提示词：**',
    '```text',
    content,
    '```',
  ].join('\n');
  const originalMarkdown = [
    '## 稳定性',
    markdownRecord('无原生编号甲', '生成第一张无原生编号图片。', './assets/no-id-a.png'),
    markdownRecord('无原生编号乙', '生成第二张无原生编号图片。', './assets/no-id-b.png'),
  ].join('\n\n');
  const reorderedMarkdown = [
    '## 稳定性',
    markdownRecord('新插入记录', '生成前插图片。', './assets/inserted.png'),
    markdownRecord('无原生编号乙', '生成第二张无原生编号图片。', './assets/no-id-b.png'),
    markdownRecord('无原生编号甲', '生成第一张无原生编号图片。', './assets/no-id-a.png'),
  ].join('\n\n');
  const markdownBefore = parseSourceDocuments(markdownSource, [
    { name: 'README.zh-CN.md', content: originalMarkdown },
  ]);
  const markdownAfter = parseSourceDocuments(markdownSource, [
    { name: 'README.zh-CN.md', content: reorderedMarkdown },
  ]);
  const markdownBeforeKeys = Object.fromEntries(
    markdownBefore.map(prompt => [prompt.title, prompt.uniqueKey]),
  );
  const markdownAfterKeys = Object.fromEntries(
    markdownAfter.map(prompt => [prompt.title, prompt.uniqueKey]),
  );

  assert.equal(markdownAfterKeys['无原生编号甲'], markdownBeforeKeys['无原生编号甲']);
  assert.equal(markdownAfterKeys['无原生编号乙'], markdownBeforeKeys['无原生编号乙']);
  assert.equal(new Set(markdownAfter.map(prompt => prompt.uniqueKey)).size, markdownAfter.length);
});

test('keeps a native-id record key stable as duplicate counts change from one to two to one', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'nanobanana');
  const original = {
    id: 'changing-duplicate-count',
    title: '保持稳定的记录',
    content: '重复数量变化时键不能漂移。',
    images: ['https://images.example.com/stable.png'],
    tags: [],
  };
  const duplicate = {
    id: original.id,
    title: '后来出现的重复编号',
    content: '内容不同但使用相同来源编号。',
    images: ['https://images.example.com/later-duplicate.png'],
    tags: [],
  };
  const parseRecords = records => parseSourceDocuments(source, [{
    name: 'public/data.json',
    content: JSON.stringify({ sections: [{ id: 'fixture', prompts: records }] }),
  }]);

  const oneBefore = parseRecords([original]);
  const two = parseRecords([duplicate, original]);
  const oneAfter = parseRecords([original]);
  const originalWithDuplicate = two.find(prompt => prompt.title === original.title);

  assert.equal(originalWithDuplicate.uniqueKey, oneBefore[0].uniqueKey);
  assert.equal(oneAfter[0].uniqueKey, oneBefore[0].uniqueKey);
  assert.notEqual(two[0].uniqueKey, two[1].uniqueKey);
});

test('resolves Nanobanana relative images against the public data directory', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'nanobanana');
  const records = ['./images/a.png', '/images/a.png'].map((image, index) => ({
    id: `relative-image-${index}`,
    title: `相对图片 ${index}`,
    content: '验证相对图片资源基址。',
    images: [image],
    tags: [],
  }));

  assert.equal(
    source.rawBaseUrl,
    'https://raw.githubusercontent.com/unknowlei/nanobanana-website/main/public',
  );
  const prompts = parseSourceDocuments(source, [{
    name: 'public/data.json',
    content: JSON.stringify({ sections: [{ id: 'fixture', prompts: records }] }),
  }]);

  assert.equal(prompts.length, 2);
  assert.ok(prompts.every(prompt => (
    prompt.images[0]
    === 'https://raw.githubusercontent.com/unknowlei/nanobanana-website/main/public/images/a.png'
  )));
});

test('preserves URL path case when hashing records without native ids', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'awesome-gpt-image');
  const record = image => [
    '### 同名记录',
    '',
    `![同名记录](${image})`,
    '',
    '**提示词：**',
    '```text',
    '相同标题和内容，仅图片路径大小写不同。',
    '```',
  ].join('\n');
  const markdown = [
    '## 哈希稳定性',
    record('https://cdn.example.com/images/A.png?Variant=One'),
    record('https://CDN.EXAMPLE.COM/images/a.png?Variant=One'),
  ].join('\n\n');

  const prompts = parseSourceDocuments(source, [{ name: 'README.zh-CN.md', content: markdown }]);

  assert.equal(prompts.length, 2);
  assert.notEqual(prompts[0].uniqueKey, prompts[1].uniqueKey);
});

test('filters incomplete records and invalid image URLs from partially damaged CRLF input', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'awesome-gpt-image');
  const markdown = [
    '## 海报与广告',
    '',
    '### 完整记录',
    '',
    '![完整图片](./assets/valid.png)',
    '',
    '**提示词：**',
    '```text',
    '创建一张有效海报。',
    '```',
    '',
    '### 缺少图片',
    '',
    '**提示词：**',
    '```text',
    '这条记录不能发布。',
    '```',
    '',
    '### 无效图片',
    '',
    '![无效图片](javascript:alert(1))',
    '',
    '**提示词：**',
    '```text',
    '这条记录也不能发布。',
    '```',
    '',
    '### 空提示词',
    '',
    '![空提示词](./assets/empty.png)',
    '',
    '**提示词：**',
    '```text',
    '   ',
    '```',
  ].join('\r\n');

  const prompts = parseSourceDocuments(source, [{ name: 'README.zh-CN.md', content: markdown }]);

  assert.deepEqual(prompts.map(prompt => prompt.title), ['完整记录']);
  assert.deepEqual(prompts[0].images, [
    'https://raw.githubusercontent.com/ZeroLu/awesome-gpt-image/main/assets/valid.png',
  ]);
});

test('ignores decorative images before Wuyoscar gallery tables', () => {
  const source = PROMPT_GALLERY_SOURCES.find(candidate => candidate.id === 'wuyoscar-gpt-image2');
  const markdown = [
    '#### 像素艺术 1x2 组图',
    '',
    '![章节装饰](docs/decorative.png)',
    '',
    '<table>',
    '  <tr>',
    '    <td><img src="docs/pixel-art/cars.png" alt="像素汽车" /></td>',
    '    <td><img src="docs/pixel-art/breakfast.png" alt="像素早餐" /></td>',
    '  </tr>',
    '</table>',
    '',
    '**提示词 A - 像素汽车**',
    '```text',
    '生成像素汽车。',
    '```',
    '',
    '**提示词 B - 像素早餐**',
    '```text',
    '生成像素早餐。',
    '```',
  ].join('\r\n');

  const prompts = parseSourceDocuments(source, [{ name: 'README.zh.md', content: markdown }]);

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
