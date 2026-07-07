import type { NovaTaskResponse, NovaTaskStatus } from '@/lib/ccode-task-client';

export type FailureReason =
  | 'restart'
  | 'expired'
  | 'api'
  | 'upstream'
  | 'complexity'
  | 'content_policy'
  | 'network'
  | 'rate_limit'
  | 'queue_full'
  | 'unknown';

export interface FailureClassification {
  /** true 表示后端已经明确判定不可恢复，前端不应再展示"查看进度"按钮 */
  terminal: boolean;
  reason: FailureReason;
}

export interface TaskFailureDisplayInfo {
  title: string;
  stage: string;
  suggestion: string;
  billingNote: string;
}

export function sanitizeUserFacingFailureText(value: string | undefined): string {
  return String(value || '')
    .replace(/API 请求失败:\s*502\s*Upstream request failed/gi, '生图失败：服务暂时无法完成这次生成')
    .replace(/502\s*Upstream request failed/gi, '生图失败：服务暂时无法完成这次生成')
    .replace(/Upstream request failed/gi, '生图失败：服务暂时无法完成这次生成')
    .replace(/NewAPI\/上游日志/g, '爱词元记录')
    .replace(/NewAPI 后台/g, '爱词元记录')
    .replace(/NewAPI 摘要/g, '爱词元记录')
    .replace(/NewAPI/g, '爱词元')
    .replace(/上游 API/g, '生图服务')
    .replace(/上游生成/g, '生图服务')
    .replace(/上游连接/g, '生图连接')
    .replace(/上游/g, '生图服务')
    .replace(/以\s+爱词元记录/g, '以爱词元记录');
}

const SERVER_RESTART_MARKERS = [
  '服务器重启，任务已中断',
  '服务器重启，任务已中断，请重新生成',
];

const API_FAILURE_PATTERNS = [
  /^API 请求失败:\s*\d{3}/,
  /^所有图片生成失败/,
  /响应中无图片数据/,
];

const UPSTREAM_FAILURE_FRAGMENTS = [
  '502 upstream request failed',
  'upstream request failed',
  'bad gateway',
  '上游',
];

const COMPLEXITY_FAILURE_FRAGMENTS = [
  'too complex',
  'complex request',
  '请求过于复杂',
  '生成复杂',
];

const CONTENT_POLICY_FRAGMENTS = [
  'content_policy',
  'safety',
  'policy',
  '违规',
  '安全',
  '内容限制',
];

const RATE_LIMIT_MARKERS = [
  '请求太频繁',
];

const QUEUE_FULL_MARKERS = [
  '当前排队任务较多',
  '你已有较多任务正在排队或生成',
  '暂不接受新任务',
];

// 网络/超时关键字（覆盖前端 fetch 抛出的英文消息和 normalizeError 改写后的中文消息）
const NETWORK_ERROR_FRAGMENTS = [
  'failed to fetch',
  'fetch failed',
  'networkerror',
  'network request failed',
  'load failed',
  'network connection was lost',
  'econnreset',
  'socket hang up',
  'terminated',
  '网络连接失败',
  '网络连接',
];

const TIMEOUT_ERROR_FRAGMENTS = [
  'timeout',
  'timed out',
  'abort',
  '超时',
  '请求超时',
  '高分辨率图片生成需要更长时间',
];

function isServerRestartError(message: string): boolean {
  return SERVER_RESTART_MARKERS.some(marker => message.includes(marker));
}

function isApiFailureMessage(message: string): boolean {
  return API_FAILURE_PATTERNS.some(re => re.test(message));
}

function isUpstreamFailureMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return UPSTREAM_FAILURE_FRAGMENTS.some(fragment => lower.includes(fragment.toLowerCase()));
}

function isComplexityFailureMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return COMPLEXITY_FAILURE_FRAGMENTS.some(fragment => lower.includes(fragment.toLowerCase()));
}

function isContentPolicyMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return CONTENT_POLICY_FRAGMENTS.some(fragment => lower.includes(fragment.toLowerCase()));
}

function isRateLimitMessage(message: string): boolean {
  return RATE_LIMIT_MARKERS.some(marker => message.includes(marker));
}

function isQueueFullMessage(message: string): boolean {
  return QUEUE_FULL_MARKERS.some(marker => message.includes(marker));
}

function isNetworkErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return NETWORK_ERROR_FRAGMENTS.some(fragment => lower.includes(fragment.toLowerCase()));
}

function isTimeoutErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return TIMEOUT_ERROR_FRAGMENTS.some(fragment => lower.includes(fragment.toLowerCase()));
}

function classifyFailureMessage(message: string | undefined): FailureClassification {
  const msg = (message || '').trim();
  if (!msg) return { terminal: false, reason: 'unknown' };
  if (isServerRestartError(msg)) return { terminal: true, reason: 'restart' };
  if (isRateLimitMessage(msg)) return { terminal: true, reason: 'rate_limit' };
  if (isQueueFullMessage(msg)) return { terminal: true, reason: 'queue_full' };
  if (isNetworkErrorMessage(msg) || isTimeoutErrorMessage(msg)) return { terminal: false, reason: 'network' };
  if (isUpstreamFailureMessage(msg)) return { terminal: true, reason: 'upstream' };
  if (isComplexityFailureMessage(msg)) return { terminal: true, reason: 'complexity' };
  if (isContentPolicyMessage(msg)) return { terminal: true, reason: 'content_policy' };
  if (isApiFailureMessage(msg)) return { terminal: true, reason: 'api' };
  return { terminal: false, reason: 'unknown' };
}

/**
 * 根据后端推送的任务状态判断失败是否"终态"。
 * - terminal=true 表示后端已经明确告诉我们任务无法恢复，前端不应再展示"查看进度"按钮
 * - terminal=false 表示可能是网络瞬态/前端解析问题，应该允许用户手动再查询一次后端状态
 */
export function classifyTaskFailure(task: Pick<NovaTaskResponse, 'status' | 'error'>): FailureClassification {
  const status = task.status as NovaTaskStatus;
  if (status === 'expired') return { terminal: true, reason: 'expired' };
  if (status !== 'failed') return { terminal: false, reason: 'unknown' };
  return classifyFailureMessage(task.error);
}

/**
 * 从前端已经构造好的错误消息（多数来自 socket fallback / HTTP 抛错）反推 terminal 标记。
 * 用于 useWorkspaceJobs.failJob 在没有完整 task 对象时也能合理设置 terminal。
 */
export function classifyFailureFromMessage(message: string | undefined): FailureClassification {
  return classifyFailureMessage(message);
}

export function getTaskFailureDisplayInfo(message: string | undefined): TaskFailureDisplayInfo {
  const classification = classifyFailureMessage(message);
  const billingNote = '失败通常不扣费，最终以爱词元记录为准。';

  switch (classification.reason) {
    case 'upstream':
      return {
        title: '生图失败',
        stage: '生图服务',
        suggestion: '可尝试降低复杂度、减少角色/细节数量、换一种提示词，或稍后重试。',
        billingNote,
      };
    case 'complexity':
      return {
        title: '请求可能过于复杂',
        stage: '生图服务',
        suggestion: '可拆分画面、减少同时出现的主体，或先生成主体再做局部编辑。',
        billingNote,
      };
    case 'content_policy':
      return {
        title: '可能触发内容限制',
        stage: '安全检查',
        suggestion: '提示词可能被拒绝或安全改写。请调整敏感描述后重试。',
        billingNote,
      };
    case 'network':
      return {
        title: '网络或超时错误',
        stage: '前端连接',
        suggestion: '可稍后重试，或点击查看进度确认服务端任务是否仍在继续。',
        billingNote,
      };
    case 'rate_limit':
      return {
        title: '请求过于频繁',
        stage: '提交任务',
        suggestion: '请稍等一会儿再提交新任务。',
        billingNote,
      };
    case 'queue_full':
      return {
        title: '当前队列较满',
        stage: '提交任务',
        suggestion: '请等待已有任务完成后再试。',
        billingNote,
      };
    case 'restart':
      return {
        title: '服务重启导致中断',
        stage: '服务端任务',
        suggestion: '请重新提交任务。',
        billingNote,
      };
    case 'expired':
      return {
        title: '任务已过期',
        stage: '结果取回',
        suggestion: '结果保留时间已过，请重新生成。',
        billingNote,
      };
    case 'api':
      return {
        title: '生图请求失败',
        stage: '生图服务',
        suggestion: '请检查提示词、参数或稍后重试。',
        billingNote,
      };
    case 'unknown':
    default:
      return {
        title: '任务失败',
        stage: '未知阶段',
        suggestion: '可稍后重试；如果反复失败，请把错误信息发给管理员核对。',
        billingNote,
      };
  }
}

const SENSITIVE_PROMPT_FRAGMENTS = [
  '色情',
  '裸露',
  '未成年',
  'nsfw',
  'nude',
  'porn',
  'sexual',
];

export function getSensitivePromptWarning(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  const hit = SENSITIVE_PROMPT_FRAGMENTS.some(fragment => lower.includes(fragment.toLowerCase()));
  return hit
    ? '提示词可能触发内容限制，生图服务可能拒绝或改写生成结果。'
    : null;
}

/** 404 等价于任务已被删除/过期，不可恢复 */
export const TASK_NOT_FOUND_FAILURE: FailureClassification = { terminal: true, reason: 'expired' };
