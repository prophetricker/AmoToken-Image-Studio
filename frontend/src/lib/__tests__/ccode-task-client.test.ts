import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNovaTask } from '@/lib/ccode-task-client';

describe('createNovaTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses user-facing wording when task creation response has no task id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));

    await expect(createNovaTask({
      apiKey: 'sk-test',
      baseUrl: 'https://amotoken.cc/v1',
      protocol: 'openai',
      mode: 'text-to-image',
      prompt: '一只小鲨鱼',
      outputSize: '1K',
      aspectRatio: '1:1',
      temperature: 1,
      model: 'gpt-image-2',
      parallelCount: 1,
      images: [],
    })).rejects.toThrow('创建任务失败：生图服务未返回任务编号');
  });
});
