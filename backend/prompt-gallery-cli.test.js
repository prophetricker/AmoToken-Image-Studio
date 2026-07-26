const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { parseCliArgs, selectBundlePublication } = require('./prompt-gallery-cli');

test('parses bundle mode with the backend snapshot as its default output', () => {
  assert.deepEqual(parseCliArgs(['--bundle']), {
    bundle: true,
    output: path.join(__dirname, 'prompts.json'),
  });
});

test('rejects bundle output paths outside the backend directory', () => {
  assert.throws(
    () => parseCliArgs(['--output', '..\\outside.json']),
    /backend directory/,
  );
});

test('rejects credential arguments', () => {
  assert.throws(
    () => parseCliArgs(['--bundle', '--token', 'secret']),
    /Unknown argument/,
  );
});

test('fills a maintainer bundle to exactly 1000 policy-selected records', () => {
  const candidates = Array.from({ length: 1100 }, (_, index) => ({
    id: `candidate-${index}`,
    title: `Candidate ${index}`,
    content: `Create policy-safe gallery image ${index}`,
    images: [`https://raw.githubusercontent.com/example/gallery/main/${index}.png`],
    source: 'single-source',
    sourceUrl: 'https://github.com/example/gallery',
    category: 'single-category',
  }));

  assert.equal(selectBundlePublication(candidates, []).length, 1000);
});
