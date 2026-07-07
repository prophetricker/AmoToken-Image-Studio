import { describe, expect, it } from 'vitest';
import {
  classifyTaskFailure,
  classifyFailureFromMessage,
  getSensitivePromptWarning,
  getTaskFailureDisplayInfo,
} from '@/lib/task-failure';
import type { NovaTaskResponse } from '@/lib/ccode-task-client';

function makeTask(overrides: Partial<NovaTaskResponse>): NovaTaskResponse {
  return {
    id: 't1',
    status: 'failed',
    ...overrides,
  } as NovaTaskResponse;
}

describe('classifyTaskFailure', () => {
  it('网络错误 → terminal=false（应允许"查看进度"）', () => {
    const task = makeTask({ error: '网络连接失败。请检查网络连接或稍后重试。' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(false);
    expect(result.reason).toBe('network');
  });

  it('超时错误 → terminal=false', () => {
    const task = makeTask({ error: '请求超时，请稍后重试。' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(false);
    expect(result.reason).toBe('network');
  });

  it('服务器重启 → terminal=true', () => {
    const task = makeTask({ error: '服务器重启，任务已中断，请重新生成' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('restart');
  });

  it('绘图 API 4xx 失败 → terminal=true', () => {
    const task = makeTask({ error: 'API 请求失败: 401 Unauthorized {...}' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('api');
  });

  it('绘图 API 5xx 失败 → terminal=true', () => {
    const task = makeTask({ error: 'API 请求失败: 503 Service Unavailable' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('api');
  });

  it('502 Upstream request failed explains upstream ambiguity without blaming copyright', () => {
    const task = makeTask({ error: 'API 请求失败: 502 Upstream request failed' });
    const result = classifyTaskFailure(task);
    const display = getTaskFailureDisplayInfo(task.error);

    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('upstream');
    expect(display.title).toBe('上游生成失败');
    expect(display.stage).toBe('上游生成');
    expect(display.suggestion).toContain('降低复杂度');
    expect(display.suggestion).toContain('换一种提示词');
    expect(display.billingNote).toContain('失败通常不扣费');
    expect(display.billingNote).toContain('最终以 NewAPI/上游日志为准');
    expect(display.suggestion).not.toContain('侵权');
  });

  it('two-minute upstream disconnects are shown as network or upstream timeout, not a 30-minute elapsed timeout', () => {
    const task = makeTask({ error: '所有图片生成失败: 上游连接提前中断或超时，请稍后重试。' });
    const result = classifyTaskFailure(task);
    const display = getTaskFailureDisplayInfo(task.error);

    expect(result.terminal).toBe(false);
    expect(result.reason).toBe('network');
    expect(display.title).toBe('网络或超时错误');
    expect(display.suggestion).toContain('查看进度');
    expect(display.billingNote).toContain('失败通常不扣费');
  });

  it('所有图片生成失败汇总 → terminal=true', () => {
    const task = makeTask({ error: '所有图片生成失败: API 请求失败: 401 ...' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('api');
  });

  it('expired 状态 → terminal=true（任务已删除/过期不可恢复）', () => {
    const task = makeTask({ status: 'expired', error: '该任务已超出取回时间' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(true);
    expect(result.reason).toBe('expired');
  });

  it('未知失败消息 → terminal=false（保守起见允许查看进度）', () => {
    const task = makeTask({ error: '某种没见过的错误' });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(false);
    expect(result.reason).toBe('unknown');
  });

  it('processing 等非失败状态不被判定为 terminal', () => {
    const task = makeTask({ status: 'processing', error: undefined });
    const result = classifyTaskFailure(task);
    expect(result.terminal).toBe(false);
  });
});

describe('classifyFailureFromMessage', () => {
  it('从纯字符串消息推断网络错误', () => {
    expect(classifyFailureFromMessage('网络连接失败').reason).toBe('network');
    expect(classifyFailureFromMessage('Failed to fetch').reason).toBe('network');
  });

  it('从纯字符串消息识别服务器重启', () => {
    const r = classifyFailureFromMessage('服务器重启，任务已中断，请重新生成');
    expect(r.terminal).toBe(true);
    expect(r.reason).toBe('restart');
  });

  it('从纯字符串消息识别限流', () => {
    const r = classifyFailureFromMessage('请求太频繁，请稍后再试。');
    expect(r.terminal).toBe(true);
    expect(r.reason).toBe('rate_limit');
  });

  it('从纯字符串消息识别队列满或待处理过多', () => {
    const r = classifyFailureFromMessage('当前排队任务较多，请稍后再试。');
    expect(r.terminal).toBe(true);
    expect(r.reason).toBe('queue_full');
  });

  it('空消息 → unknown 非终态', () => {
    const r = classifyFailureFromMessage('');
    expect(r.terminal).toBe(false);
    expect(r.reason).toBe('unknown');
  });
});

describe('prompt compliance hints', () => {
  it('warns locally when a prompt may trigger content limits', () => {
    const warning = getSensitivePromptWarning('生成色情裸露写真');
    expect(warning).toContain('可能触发内容限制');
    expect(warning).toContain('上游可能拒绝或改写');
  });

  it('does not warn for an ordinary image prompt', () => {
    expect(getSensitivePromptWarning('给这个小鲨鱼戴一个海盗帽子')).toBeNull();
  });
});
