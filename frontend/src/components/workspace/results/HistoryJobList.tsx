'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, Copy, Loader2, RotateCcw, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Mode, StoredJob } from '@/lib/job-store';
import { cn } from '@/lib/utils';
import {
  getModelDisplayName,
  getOutputSizeLabel,
  GPT_IMAGE_BACKGROUND_OPTIONS,
  GPT_IMAGE_QUALITY_OPTIONS,
  GPT_IMAGE_STYLE_OPTIONS,
} from '@/lib/model-capabilities';
import { CompletedJobCard } from '@/components/workspace/results/CompletedJobCard';
import { PromptTextDialog } from '@/components/workspace/results/PromptTextDialog';

export type GenerationHistoryFilter = 'all' | 'text-to-image' | 'image-to-image';
export type HistoryClearScope = GenerationHistoryFilter;

const historyFilterOptions: { value: GenerationHistoryFilter; label: string }[] = [
  { value: 'all', label: '同时显示' },
  { value: 'text-to-image', label: '文生图' },
  { value: 'image-to-image', label: '图生图' },
];

function isWaitingJob(job: StoredJob): boolean {
  return job.status === 'processing' || job.status === 'queued' || job.status === '排队中';
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled]);

  return now;
}

function formatElapsedTime(elapsedMs?: number): string {
  if (!Number.isFinite(elapsedMs) || !elapsedMs) return '耗时待记录';
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  if (seconds < 60) return `耗时 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `耗时 ${minutes} 分 ${rest} 秒` : `耗时 ${minutes} 分`;
}

function getReferenceImageCount(job: StoredJob): number {
  return Math.max(0, job.referenceImageCount || job.refImages?.length || 0);
}

function getModeLabel(job: StoredJob): string {
  if (job.mode === 'image-to-image') return getReferenceImageCount(job) > 1 ? '多图融合' : '单图编辑';
  if (job.mode === 'prompt-gallery') return '提示词广场';
  return '文生图';
}

function summarizeText(value: string | undefined, maxLength: number): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function getOptionLabel<T extends string>(options: { value: T; label: string }[], value?: T): string {
  return options.find(option => option.value === value)?.label || value || '自动';
}

const WaitingJobCard = memo(function WaitingJobCard({
  job,
  now,
  isChecking,
  cooldownEnd,
  onCancel,
  onCheckStatus,
}: {
  job: StoredJob;
  now: number;
  isChecking: boolean;
  cooldownEnd: number | undefined;
  onCancel: (jobId: string) => void;
  onCheckStatus: (job: StoredJob) => void;
}) {
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const parallelCount = job.parallelCount || 1;
  const statusText = job.status === 'queued' || job.status === '排队中'
    ? '排队中...'
    : job.mode === 'text-to-image'
      ? (parallelCount > 1 ? `生成中 (x${parallelCount})...` : '生成中...')
      : (parallelCount > 1 ? `转换中 (x${parallelCount})...` : '转换中...');
  const elapsedSeconds = Math.max(0, Math.floor((now - Date.parse(job.created_at)) / 1000));

  return (
    <>
    <div data-testid="history-job-card" className="h-64 overflow-hidden rounded-xl border border-border bg-card p-4">
      <div className="flex h-full items-start gap-3">
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <button
            type="button"
            onClick={() => setPromptDialogOpen(true)}
            className="min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left"
            aria-label="查看完整提示词"
          >
            <span className="block truncate text-base text-foreground" title={job.prompt}>
              &quot;{job.prompt}&quot;
            </span>
          </button>
          <p className="mt-0.5 text-xs text-muted-foreground">{statusText}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            已用 <span className="font-mono text-foreground">{elapsedSeconds}</span> 秒 · {getModelDisplayName(job.model)}
          </p>
        </div>
        {job.serverTaskId && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onCheckStatus(job)}
            disabled={isChecking || (cooldownEnd !== undefined && now < cooldownEnd)}
            title="查看进度"
          >
            {isChecking
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <RefreshCw className="w-4 h-4" />}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onCancel(job.id)}
          title="取消"
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
    <PromptTextDialog
      open={promptDialogOpen}
      prompt={job.prompt}
      onOpenChange={setPromptDialogOpen}
    />
    </>
  );
});

function JobsHeader({
  title,
  jobsList,
  hasAnyJobs,
  filter,
  onFilterChange,
  onClearAll,
}: {
  title: string;
  jobsList: StoredJob[];
  hasAnyJobs: boolean;
  filter?: GenerationHistoryFilter;
  onFilterChange?: (filter: GenerationHistoryFilter) => void;
  onClearAll: () => void;
}) {
  if (!hasAnyJobs) return null;

  const completed = jobsList.filter(job => job.status === 'completed').length;
  const queued = jobsList.filter(job => job.status === 'queued' || job.status === '排队中').length;
  const processing = jobsList.filter(job => job.status === 'processing').length;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-1">
        <h3 className="text-base font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">
          共 {jobsList.length} 条 · 完成 {completed} · 处理中 {processing} · 排队 {queued}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {filter && onFilterChange && (
          <div className="flex rounded-lg border border-border bg-background p-0.5">
            {historyFilterOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFilterChange(option.value)}
                className={cn(
                  'h-6 rounded-md px-2 text-xs transition-colors',
                  filter === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
        <Button variant="outline" size="sm" onClick={onClearAll} disabled={jobsList.length === 0}>
          清空记录
        </Button>
      </div>
    </div>
  );
}

function useColumnCount(
  ref: React.RefObject<HTMLDivElement | null>,
  wideMode: boolean,
  ready: boolean,
) {
  const [columns, setColumns] = useState(() => (wideMode && ready ? 2 : 1));

  useEffect(() => {
    if (!wideMode || !ready) {
      queueMicrotask(() => setColumns(1));
      return;
    }
    const el = ref.current;
    if (!el) return;

    const compute = () => {
      const width = el.clientWidth;
      setColumns(width >= 1080 ? 3 : width >= 680 ? 2 : 1);
    };

    compute();
    const observer = new ResizeObserver(compute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, wideMode, ready]);

  return wideMode ? columns : 1;
}

function VirtualJobList({
  jobs,
  active,
  wideMode,
  renderJobCard,
}: {
  jobs: StoredJob[];
  active: boolean;
  wideMode: boolean;
  renderJobCard: (job: StoredJob) => React.ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldRender = active && jobs.length > 0;
  const columns = useColumnCount(parentRef, wideMode, shouldRender);
  const gutter = 16;

  const virtualizer = useVirtualizer({
    count: active ? jobs.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 5,
    lanes: columns,
  });

  if (!shouldRender) return null;

  if (!wideMode && jobs.length <= 3) {
    return (
      <div className="space-y-4">
        {jobs.map(job => (
          <div key={job.id}>{renderJobCard(job)}</div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn('relative virtual-scroll-container', wideMode && 'min-h-0 flex-1')}
      style={{
        height: wideMode ? undefined : (jobs.length > 3 ? '70vh' : 'auto'),
        maxHeight: wideMode ? undefined : '70vh',
        minHeight: jobs.length > 0 ? '200px' : '0',
        overflow: 'auto',
        overflowX: 'hidden',
      }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map(virtualRow => {
          const lane = columns > 1 ? virtualRow.lane : 0;
          return (
            <div
              key={jobs[virtualRow.index].id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0"
              style={{
                left: `${(100 / columns) * lane}%`,
                width: `${100 / columns}%`,
                paddingLeft: columns > 1 ? gutter / 2 : 0,
                paddingRight: columns > 1 ? gutter / 2 : 0,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="mb-4">
                {renderJobCard(jobs[virtualRow.index])}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const FailedJobCard = memo(function FailedJobCard({
  job,
  now,
  isChecking,
  cooldownEnd,
  onRetry,
  onClear,
  onCheckStatus,
}: {
  job: StoredJob;
  now: number;
  isChecking: boolean;
  cooldownEnd: number | undefined;
  onRetry: (job: StoredJob) => void;
  onClear: (jobId: string) => void;
  onCheckStatus: (job: StoredJob) => void;
}) {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const allowCheckStatus = !job.terminal && !!job.serverTaskId;
  const outputSizeLabel = job.custom_size || getOutputSizeLabel(job.output_size);
  const promptSummary = summarizeText(job.prompt, 72);
  const qualityLabel = getOptionLabel(GPT_IMAGE_QUALITY_OPTIONS, job.gptImageQuality);
  const styleLabel = getOptionLabel(GPT_IMAGE_STYLE_OPTIONS, job.gptImageStyle);
  const backgroundLabel = getOptionLabel(GPT_IMAGE_BACKGROUND_OPTIONS, job.gptImageBackground);
  const referenceImageCount = getReferenceImageCount(job);

  const copyPrompt = async () => {
    const text = job.prompt;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 1500);
    } catch {
      setCopiedPrompt(false);
    }
  };

  return (
    <>
    <div data-testid="history-job-card" className="h-64 overflow-hidden rounded-xl border border-destructive/20 bg-card p-4">
      <div className="grid h-full grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 overflow-hidden">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setPromptDialogOpen(true)}
              className="block min-w-0 max-w-full cursor-pointer border-0 bg-transparent p-0 text-left"
              aria-label="查看完整提示词"
            >
              <span
                data-testid="failed-job-prompt-summary"
                className="block truncate text-base text-foreground"
                title={job.prompt}
              >
                &quot;{promptSummary}&quot;
              </span>
            </button>
            <p className="text-sm font-medium text-destructive">生图失败</p>
          </div>
          <div className="flex max-h-14 flex-wrap items-center gap-1.5 overflow-hidden text-xs">
            <span className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{getModeLabel(job)}</span>
            <span className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-muted-foreground" title={getModelDisplayName(job.model)}>{getModelDisplayName(job.model)}</span>
            <span className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{outputSizeLabel}</span>
            <span className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{job.aspect_ratio}</span>
            <span className="max-w-full break-words rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{formatElapsedTime(job.elapsedMs)}</span>
          </div>
          <div className="grid max-h-20 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-md bg-muted/40 p-2 text-xs text-muted-foreground sm:grid-cols-3">
            <span>质量：{qualityLabel}</span>
            <span>风格：{styleLabel}</span>
            <span>背景：{backgroundLabel}</span>
            {job.mode === 'image-to-image' && <span>参考图：{referenceImageCount || 1}</span>}
            <span>数量：{job.parallelCount || 1}</span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={() => void copyPrompt()}
              aria-label="复制完整提示词"
              title="复制完整提示词"
            >
              <Copy className="w-4 h-4" />
              <span>{copiedPrompt ? '已复制提示词' : '复制提示词'}</span>
            </Button>
            {allowCheckStatus && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => onCheckStatus(job)} disabled={isChecking || (cooldownEnd !== undefined && now < cooldownEnd)} aria-label="查看进度">
                {isChecking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <RefreshCw className="w-4 h-4" />}
                <span>进度</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" className="gap-1" onClick={() => onRetry(job)} aria-label="重试">
              <RotateCcw className="w-4 h-4" />
              <span>重试</span>
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => onClear(job.id)} title="删除" aria-label="删除">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
    <PromptTextDialog
      open={promptDialogOpen}
      prompt={job.prompt}
      onOpenChange={setPromptDialogOpen}
    />
    </>
  );
});

interface HistoryJobListProps {
  active: boolean;
  wideMode?: boolean;
  title: string;
  mode: Mode;
  historyFilter?: GenerationHistoryFilter;
  hasAnyJobs?: boolean;
  emptyDescription?: string;
  jobs: StoredJob[];
  loadedImages: Set<string>;
  checkingJobIds: Set<string>;
  cooldowns: Map<string, number>;
  onRetry: (job: StoredJob) => void;
  onRetryDownload?: (job: StoredJob) => void | Promise<void>;
  onClear: (jobId: string) => void;
  onClearAll: (scope: HistoryClearScope) => void;
  onHistoryFilterChange?: (filter: GenerationHistoryFilter) => void;
  onCancel: (jobId: string) => void;
  onCheckStatus: (job: StoredJob) => void;
}

export function HistoryJobList({
  active,
  wideMode = false,
  title,
  mode,
  historyFilter,
  hasAnyJobs,
  emptyDescription,
  jobs,
  loadedImages,
  checkingJobIds,
  cooldowns,
  onRetry,
  onRetryDownload,
  onClear,
  onClearAll,
  onHistoryFilterChange,
  onCancel,
  onCheckStatus,
}: HistoryJobListProps) {
  const hasActiveTimers = useMemo(() => active && jobs.some(job => isWaitingJob(job)), [active, jobs]);
  const now = useNow(hasActiveTimers);
  const clearScope: HistoryClearScope = historyFilter || (mode === 'image-to-image' ? 'image-to-image' : 'text-to-image');

  const renderJobCard = (job: StoredJob) => {
    const hasImage = job.status === 'completed' && (job.images || job.imageData) && loadedImages.has(job.id);
    if (isWaitingJob(job)) {
      return <WaitingJobCard job={job} now={now} isChecking={checkingJobIds.has(job.id)} cooldownEnd={cooldowns.get(job.id)} onCancel={onCancel} onCheckStatus={onCheckStatus} />;
    }
    if (hasImage) {
      return <CompletedJobCard job={job} onClear={() => onClear(job.id)} onRetry={onRetry} onRetryDownload={onRetryDownload} />;
    }
    if (job.status === 'failed') {
      return (
        <FailedJobCard
          job={job}
          now={now}
          isChecking={checkingJobIds.has(job.id)}
          cooldownEnd={cooldowns.get(job.id)}
          onRetry={onRetry}
          onClear={onClear}
          onCheckStatus={onCheckStatus}
        />
      );
    }
    return null;
  };

  return (
    <section className={cn(wideMode ? 'flex h-full min-h-0 flex-col space-y-4' : 'space-y-3')}>
      <JobsHeader
        title={title}
        jobsList={jobs}
        hasAnyJobs={hasAnyJobs ?? jobs.length > 0}
        filter={historyFilter}
        onFilterChange={onHistoryFilterChange}
        onClearAll={() => onClearAll(clearScope)}
      />
      {active && jobs.length === 0 ? (
        <div className={cn(
          'flex flex-col items-center justify-center text-center text-muted-foreground',
          wideMode ? 'flex-1 py-16' : 'py-6'
        )}>
          <p className="text-sm">暂无记录</p>
          <p className="mt-1 text-xs opacity-70">
            {emptyDescription || (mode === 'text-to-image' ? '提交一段文字描述来生成图片' : '上传图片并输入描述来转换')}
          </p>
        </div>
      ) : (
        <VirtualJobList jobs={jobs} active={active} wideMode={wideMode} renderJobCard={renderJobCard} />
      )}
    </section>
  );
}
