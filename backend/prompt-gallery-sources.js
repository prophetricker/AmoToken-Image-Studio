const RAW_GITHUB_BASE = 'https://raw.githubusercontent.com';
const RAW_GITHUB_PROXY = 'https://proxy.ccode.vip/https/';

function sourceDocument(owner, repository, name) {
  const directUrl = `${RAW_GITHUB_BASE}/${owner}/${repository}/main/${name}`;
  return {
    name,
    directUrl,
    proxyUrl: `${RAW_GITHUB_PROXY}${directUrl.replace(/^https:\/\//, '')}`,
  };
}

function rawBaseUrl(owner, repository) {
  return `${RAW_GITHUB_BASE}/${owner}/${repository}/main`;
}

const PROMPT_GALLERY_SOURCES = [
  {
    id: 'nanobanana',
    label: 'unknowlei/nanobanana-website',
    sourceUrl: 'https://github.com/unknowlei/nanobanana-website',
    license: 'Unspecified',
    parser: 'nanobanana-json',
    minimumCount: 1000,
    enabled: true,
    documents: [sourceDocument('unknowlei', 'nanobanana-website', 'public/data.json')],
  },
  {
    id: 'awesome-gpt-image',
    label: 'ZeroLu/awesome-gpt-image',
    sourceUrl: 'https://github.com/ZeroLu/awesome-gpt-image',
    license: 'MIT',
    parser: 'markdown-awesome',
    minimumCount: 40,
    enabled: true,
    documents: [sourceDocument('ZeroLu', 'awesome-gpt-image', 'README.zh-CN.md')],
    rawBaseUrl: rawBaseUrl('ZeroLu', 'awesome-gpt-image'),
  },
  {
    id: 'awesome-gpt4o-image-prompts',
    label: 'ImgEdify/Awesome-GPT4o-Image-Prompts',
    sourceUrl: 'https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts',
    license: 'MIT',
    parser: 'markdown-gpt4o',
    minimumCount: 50,
    enabled: true,
    documents: [sourceDocument('ImgEdify', 'Awesome-GPT4o-Image-Prompts', 'README.zh-CN.md')],
    rawBaseUrl: rawBaseUrl('ImgEdify', 'Awesome-GPT4o-Image-Prompts'),
  },
  {
    id: 'youmind-gpt-image-2',
    label: 'YouMind-OpenLab/awesome-gpt-image-2',
    sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-gpt-image-2',
    license: 'CC BY 4.0',
    parser: 'markdown-youmind',
    modelTag: 'gpt-image-2',
    minimumCount: 100,
    enabled: true,
    documents: [sourceDocument('YouMind-OpenLab', 'awesome-gpt-image-2', 'README_zh.md')],
    rawBaseUrl: rawBaseUrl('YouMind-OpenLab', 'awesome-gpt-image-2'),
  },
  {
    id: 'youmind-nano-banana-pro',
    label: 'YouMind-OpenLab/awesome-nano-banana-pro-prompts',
    sourceUrl: 'https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts',
    license: 'CC BY 4.0',
    parser: 'markdown-youmind',
    modelTag: 'nano-banana-pro',
    minimumCount: 100,
    enabled: true,
    documents: [sourceDocument('YouMind-OpenLab', 'awesome-nano-banana-pro-prompts', 'README_zh.md')],
    rawBaseUrl: rawBaseUrl('YouMind-OpenLab', 'awesome-nano-banana-pro-prompts'),
  },
  {
    id: 'davidwu-gpt-image2-prompts',
    label: 'davidwuw0811-boop/awesome-gpt-image2-prompts',
    sourceUrl: 'https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts',
    license: 'MIT',
    parser: 'davidwu-json',
    minimumCount: 400,
    enabled: true,
    documents: [sourceDocument('davidwuw0811-boop', 'awesome-gpt-image2-prompts', 'prompts.json')],
    rawBaseUrl: rawBaseUrl('davidwuw0811-boop', 'awesome-gpt-image2-prompts'),
  },
  {
    id: 'zerolu-nanobanana-pro',
    label: 'ZeroLu/awesome-nanobanana-pro',
    sourceUrl: 'https://github.com/ZeroLu/awesome-nanobanana-pro',
    license: 'MIT',
    parser: 'zerolu-markdown',
    minimumCount: 20,
    enabled: true,
    documents: [sourceDocument('ZeroLu', 'awesome-nanobanana-pro', 'README.md')],
    rawBaseUrl: rawBaseUrl('ZeroLu', 'awesome-nanobanana-pro'),
  },
  {
    id: 'wuyoscar-gpt-image2',
    label: 'wuyoscar/GPT-Image2-Skill',
    sourceUrl: 'https://github.com/wuyoscar/GPT-Image2-Skill',
    license: 'MIT',
    parser: 'wuyoscar-markdown',
    minimumCount: 20,
    enabled: true,
    documents: [sourceDocument('wuyoscar', 'GPT-Image2-Skill', 'README.zh.md')],
    rawBaseUrl: rawBaseUrl('wuyoscar', 'GPT-Image2-Skill'),
  },
];

module.exports = { PROMPT_GALLERY_SOURCES };
