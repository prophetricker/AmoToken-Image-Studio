'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Copy, Download, ImagePlus, Maximize, RefreshCw, RotateCcw, Save, Thermometer, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { Button, buttonVariants } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useImageLazyLoad } from '@/hooks/useImageLazyLoad';
import { getImageSrc, type StoredJob } from '@/lib/job-store';
import { isGptImageModel } from '@/lib/gemini-config';
import { resolveStoredImageRef, revokeBlobUrls } from '@/lib/image-downloader';
import {
  getModelDisplayName,
  getOutputSizeLabel,
  GPT_IMAGE_BACKGROUND_OPTIONS,
  GPT_IMAGE_QUALITY_OPTIONS,
  GPT_IMAGE_STYLE_OPTIONS,
} from '@/lib/model-capabilities';
import { formatAmoTokenImageQuote } from '@/lib/amotoken-image-quote';
import { formatCostEstimate, getBillingStatusLabel } from '@/lib/image-cost-estimator';
import { HistoryImagePreview } from '@/components/workspace/results/HistoryImagePreview';
import { ConfirmDialog } from '@/components/workspace/dialogs/ConfirmDialog';
import { PromptTextDialog } from '@/components/workspace/results/PromptTextDialog';
import {
  copyImagePayload,
  dispatchImageActionToast,
  getImageActionPayloadKey,
  runImageAction,
  type ImageActionPayload,
} from '@/lib/image-actions';
import { addTextAsset } from '@/lib/asset-store';

interface CompletedJobCardProps {
  job: StoredJob;
  onClear: () => void;
  onRetry: (job: StoredJob) => void;
  onRetryDownload?: (job: StoredJob) => void | Promise<void>;
}

interface DownloadProgressSummary {
  active: boolean;
  failed: number;
  message: string;
  percent: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getDownloadProgressSummary(progress: StoredJob['imageDownloadProgress']): DownloadProgressSummary | null {
  if (!progress || progress.total <= 0) return null;

  const active = progress.items.some(item => item.status === 'pending' || item.status === 'downloading');
  const failed = progress.failed;
  if (!active && failed === 0) return null;

  const loadedBytes = progress.items.reduce((sum, item) => sum + (item.loadedBytes || 0), 0);
  const knownTotalBytes = progress.items.reduce((sum, item) => sum + (item.totalBytes || 0), 0);
  const bytePercent = knownTotalBytes > 0
    ? Math.min(100, Math.round((loadedBytes / knownTotalBytes) * 100))
    : undefined;
  const completionPercent = Math.min(
    100,
    Math.round(((progress.completed + progress.failed) / progress.total) * 100)
  );
  const percent = bytePercent ?? completionPercent;
  const message = active
    ? knownTotalBytes > 0
      ? `正在取回 ${formatBytes(loadedBytes)} / ${formatBytes(knownTotalBytes)}，${percent}%`
      : `正在取回 ${formatBytes(loadedBytes)}`
    : `取回失败 ${failed} 张，已缓存 ${progress.completed} 张`;

  return {
    active,
    failed,
    message,
    percent,
  };
}

function formatElapsedTime(elapsedMs?: number): string {
  if (!Number.isFinite(elapsedMs) || !elapsedMs) return '耗时待记录';
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  if (seconds < 60) return `耗时 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest > 0 ? `耗时 ${minutes} 分 ${rest} 秒` : `耗时 ${minutes} 分`;
}

function formatCreatedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getReferenceImageCount(job: StoredJob): number {
  return Math.max(0, job.referenceImageCount || job.refImages?.length || 0);
}

function getModeLabel(job: StoredJob): string {
  if (job.mode === 'image-to-image') return getReferenceImageCount(job) > 1 ? '多图融合' : '单图编辑';
  if (job.mode === 'prompt-gallery') return '提示词广场';
  return '文生图';
}

function getOptionLabel<T extends string>(options: { value: T; label: string }[], value?: T): string {
  return options.find(option => option.value === value)?.label || value || '自动';
}

function isGptImageLikeModel(model: string): boolean {
  return isGptImageModel(model) || model.includes('gpt-image-2');
}

function buildPromptAssetContent(job: StoredJob, labels: {
  mode: string;
  model: string;
  outputSize: string;
  quality: string;
  style: string;
  background: string;
  referenceImageCount: number;
}): string {
  const lines = [
    job.prompt,
    '',
    '参数',
    `模式：${labels.mode}`,
    `模型：${labels.model}`,
    `尺寸：${labels.outputSize}`,
    `比例：${job.aspect_ratio}`,
    `质量：${labels.quality}`,
    `风格：${labels.style}`,
    `背景：${labels.background}`,
    `数量：${job.parallelCount || job.images?.length || 1}`,
  ];
  if (job.mode === 'image-to-image') {
    lines.splice(lines.length - 1, 0, `参考图：${labels.referenceImageCount || 1}`);
  }
  return lines.join('\n');
}

export const CompletedJobCard = memo(function CompletedJobCard({ job, onClear, onRetry, onRetryDownload }: CompletedJobCardProps) {
  const [imgCopied, setImgCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptSaved, setPromptSaved] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [retryingDownload, setRetryingDownload] = useState(false);
  const [savedAssetKeys, setSavedAssetKeys] = useState<Set<string>>(new Set());

  const sourceImages = useMemo(() => job.images || (job.imageData ? [job.imageData] : []), [job.imageData, job.images]);
  const [images, setImages] = useState(sourceImages);
  const resolvedBlobUrlsRef = useRef<string[]>([]);
  const actionPayloads = useMemo<ImageActionPayload[]>(() => sourceImages.map((imageRef, index) => ({
    id: `${job.id}-${index}`,
    name: `nova-image-${job.id.slice(0, 8)}${sourceImages.length > 1 ? `-${index + 1}` : ''}`,
    storedRef: { jobId: job.id, imageRef, imageIndex: index },
    sourceKind: job.mode === 'image-to-image' ? 'image-to-image' : 'text-to-image',
    sourceLabel: job.mode === 'image-to-image' ? '图生图历史结果' : '文生图历史结果',
    sourceRef: `${job.id}:${index}`,
    prompt: job.prompt,
  })), [job.id, job.mode, job.prompt, sourceImages]);

  /** 是否存在仍以远程 URL 形式呈现的图片（即首次本地缓存失败、需要"重新下载"补齐）。 */
  const needsRedownload = useMemo(
    () => sourceImages.some(img => img.startsWith('URL:') || img.startsWith('MULTI_URL:')),
    [sourceImages]
  );
  const downloadProgressSummary = useMemo(
    () => getDownloadProgressSummary(job.imageDownloadProgress),
    [job.imageDownloadProgress]
  );
  const isDownloadingImages = !!downloadProgressSummary?.active;

  const handleRetryDownload = useCallback(async () => {
    if (!onRetryDownload || retryingDownload || isDownloadingImages) return;
    setRetryingDownload(true);
    try {
      await onRetryDownload(job);
    } finally {
      setRetryingDownload(false);
    }
  }, [isDownloadingImages, job, onRetryDownload, retryingDownload]);

  const revokeResolvedBlobUrls = useCallback(() => {
    if (resolvedBlobUrlsRef.current.length > 0) {
      revokeBlobUrls(resolvedBlobUrlsRef.current);
      resolvedBlobUrlsRef.current = [];
    }
  }, []);

  useEffect(() => {
    setImages(sourceImages);
    return revokeResolvedBlobUrls;
  }, [revokeResolvedBlobUrls, sourceImages]);

  useEffect(() => {
    const urls = job.blobUrls;
    return () => {
      if (urls) {
        revokeBlobUrls(urls);
      }
    };
  }, [job.blobUrls]);

  const resolveImageAt = useCallback(async (index: number): Promise<string | undefined> => {
    const image = images[index] || sourceImages[index];
    if (!image) return undefined;
    if (image.startsWith('blob:') && image !== sourceImages[index]) return image;
    if (!image.startsWith('IDB:') && !image.startsWith('blob:')) return image;

    const resolved = await resolveStoredImageRef(job.id, image, index);
    if (resolved.blobUrl) {
      resolvedBlobUrlsRef.current.push(resolved.blobUrl);
      setImages(prev => prev.map((item, itemIndex) => (itemIndex === index ? resolved.image : item)));
    }

    return resolved.image;
  }, [images, job.id, sourceImages]);

  const resolveImagesAt = useCallback(async (indexes: number[]): Promise<string[]> => {
    const resolved = await Promise.all(indexes.map(index => resolveImageAt(index)));
    return resolved.filter((image): image is string => !!image);
  }, [resolveImageAt]);

  const visiblePreviewCount = Math.min(sourceImages.length, 4);
  const visiblePreviewImages = images.slice(0, visiblePreviewCount);
  const isMultiple = sourceImages.length > 1;
  const supportsTemperature = !isGptImageLikeModel(job.model);
  const outputSizeLabel = job.custom_size || getOutputSizeLabel(job.output_size);
  const modelDisplayName = job.imageQuote?.displayName || getModelDisplayName(job.model);
  const qualityLabel = getOptionLabel(GPT_IMAGE_QUALITY_OPTIONS, job.gptImageQuality);
  const styleLabel = getOptionLabel(GPT_IMAGE_STYLE_OPTIONS, job.gptImageStyle);
  const backgroundLabel = getOptionLabel(GPT_IMAGE_BACKGROUND_OPTIONS, job.gptImageBackground);
  const referenceImageCount = getReferenceImageCount(job);
  const showAspectInSummary = job.aspect_ratio !== '1:1' && job.aspect_ratio !== 'auto';
  const lazyLoad = useImageLazyLoad<HTMLDivElement>({
    rootMargin: '300px',
    enabled: true,
  });
  // 单独跟踪每个可见缩略图的加载状态，避免单图失败导致全部不显示
  const [loadedImageIndices, setLoadedImageIndices] = useState<Set<number>>(new Set());
  const handleImageLoad = useCallback((index: number) => {
    setLoadedImageIndices(prev => new Set(prev).add(index));
    // 第一张图加载完成时同步更新lazyLoad状态
    if (index === 0) {
      lazyLoad.handleImageLoad();
    }
  }, [lazyLoad]);

  const downloadImage = (index: number = 0) => {
    const payload = actionPayloads[index];
    if (!payload) return;
    void runImageAction('download', payload);
  };

  const addImageToAssets = async (index: number = 0) => {
    const payload = actionPayloads[index];
    if (!payload) return;
    const result = await runImageAction('add-to-assets', payload);
    if (result?.action === 'add-to-assets') {
      const key = getImageActionPayloadKey(payload);
      setSavedAssetKeys(prev => new Set(prev).add(key));
    }
  };

  const addAllToAssets = () => {
    actionPayloads.forEach((_, index) => {
      setTimeout(() => void addImageToAssets(index), index * 100);
    });
    setAssetMenuOpen(false);
  };

  const isAssetSaved = (index: number) => {
    const payload = actionPayloads[index];
    return payload ? savedAssetKeys.has(getImageActionPayloadKey(payload)) : false;
  };

  const allAssetsSaved = actionPayloads.length > 0 && actionPayloads.every((_, index) => isAssetSaved(index));

  const downloadAll = () => {
    actionPayloads.forEach((_, index) => {
      setTimeout(() => downloadImage(index), index * 100);
    });
    setDownloadMenuOpen(false);
  };

  const copyImage = async (index: number = 0) => {
    const payload = actionPayloads[index];
    if (!payload) return;
    try {
      await copyImagePayload(payload);
      setImgCopied(true);
      setTimeout(() => setImgCopied(false), 2000);
      setCopyMenuOpen(false);
      dispatchImageActionToast('图片已复制', 'success');
    } catch (error) {
      setCopyMenuOpen(false);
      const message = error instanceof Error ? error.message : '图片复制失败';
      dispatchImageActionToast(message.includes('Failed to fetch') ? '该图片源不允许本地保存或复制，请直接右键/长摁复制' : message, 'error');
    }
  };

  const copyPrompt = () => {
    navigator.clipboard.writeText(job.prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const savePromptAsset = async () => {
    try {
      await addTextAsset({
        content: buildPromptAssetContent(job, {
          mode: getModeLabel(job),
          model: modelDisplayName,
          outputSize: outputSizeLabel,
          quality: qualityLabel,
          style: styleLabel,
          background: backgroundLabel,
          referenceImageCount,
        }),
        sourceKind: job.mode === 'image-to-image' ? 'image-to-image' : 'text-to-image',
        sourceLabel: '生图任务提示词',
        sourceRef: job.id,
      });
      setPromptSaved(true);
      setTimeout(() => setPromptSaved(false), 2000);
      dispatchImageActionToast('提示词素材已保存', 'success');
    } catch (error) {
      dispatchImageActionToast(error instanceof Error ? error.message : '保存提示词素材失败', 'error');
    }
  };

  const openPreview = async () => {
    const resolved = await resolveImagesAt(sourceImages.map((_, index) => index));
    setPreviewImages(resolved.map(getImageSrc).filter(Boolean));
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!lazyLoad.isVisible) return;
    const visibleIndexes = Array.from({ length: visiblePreviewCount }, (_, index) => index);
    void Promise.all(visibleIndexes.map(index => resolveImageAt(index)));
  }, [lazyLoad.isVisible, resolveImageAt, visiblePreviewCount]);

  if (sourceImages.length === 0) {
    return null;
  }

  return (
    <>
      <div data-testid="history-job-card" className="relative h-64 overflow-hidden rounded-xl border border-border bg-card p-4">
        <div className="flex h-full items-start gap-3">
          <div
            ref={lazyLoad.elementRef}
            className={`group relative w-14 flex-shrink-0 overflow-hidden ${isMultiple ? 'h-full rounded-md' : 'h-14 rounded-lg bg-muted'}`}
          >
            <button
              type="button"
              onClick={() => void openPreview()}
              className="h-full w-full border-0 p-0"
              title="看大图"
            >
              {isMultiple ? (
                <div data-testid="completed-job-thumbnail-rail" className="relative flex h-full w-full flex-col gap-1">
                  {visiblePreviewImages.map((image, index) => (
                    <div key={`${job.id}-${index}`} className="relative h-12 w-14 overflow-hidden rounded-md bg-muted">
                      <img
                        src={lazyLoad.isVisible ? (getImageSrc(image) || undefined) : undefined}
                        alt={`生成的图像 ${index + 1}`}
                        className={`h-full w-full object-cover transition-opacity duration-300 ${
                          loadedImageIndices.has(index) ? 'opacity-100' : 'opacity-0'
                        }`}
                        onLoad={() => handleImageLoad(index)}
                      />
                      {!loadedImageIndices.has(index) && (
                        <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted via-muted/50 to-muted" />
                      )}
                    </div>
                  ))}
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                    <Maximize className="w-5 h-5 text-white" />
                  </div>
                </div>
              ) : (
                <>
                <img
                  src={lazyLoad.isVisible ? (getImageSrc(images[0]) || undefined) : undefined}
                  alt="生成的图像"
                  className={`h-full w-full object-cover transition-opacity duration-300 ${lazyLoad.isLoaded ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={lazyLoad.handleImageLoad}
                />
                {!lazyLoad.isLoaded && (
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-muted via-muted/50 to-muted" />
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <Maximize className="w-5 h-5 text-white" />
                </div>
                </>
              )}
            </button>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPromptDialogOpen(true)}
                className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left"
                aria-label="查看完整提示词"
              >
                <span
                  data-testid="completed-job-prompt-summary"
                  className="block truncate text-base text-foreground"
                  title={job.prompt}
                >
                  &quot;{job.prompt}&quot;
                </span>
              </button>
              <button
                onClick={copyPrompt}
                className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                title="复制提示词"
                aria-label="复制提示词"
              >
                {promptCopied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => void savePromptAsset()}
                className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                title="保存提示词素材"
                aria-label="保存提示词素材"
              >
                {promptSaved ? <Check className="w-3.5 h-3.5 text-success" /> : <Save className="w-3.5 h-3.5" />}
              </button>
            </div>

            {job.warning && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-warning">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{job.warning}</span>
              </p>
            )}

            {downloadProgressSummary && (
              <div
                className="mt-2 flex max-w-56 items-center gap-2"
                title={downloadProgressSummary.message}
                aria-label={downloadProgressSummary.message}
              >
                <div className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full transition-all duration-300 ease-out ${downloadProgressSummary.failed > 0 && !downloadProgressSummary.active ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${Math.max(4, downloadProgressSummary.percent)}%` }}
                  />
                </div>
                <span className="w-10 flex-shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {downloadProgressSummary.percent}%
                </span>
              </div>
            )}

            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {modelDisplayName}
              <span>·</span>
              {outputSizeLabel}
              {showAspectInSummary && <><span>·</span><span>{job.aspect_ratio}</span></>}
              {supportsTemperature && <><span>·</span><Thermometer className="w-3 h-3" /><span>{job.temperature?.toFixed(2) ?? 1}</span></>}
              {isMultiple && <><span>·</span><span className="font-medium text-primary">x{sourceImages.length}{job.parallelCount && job.parallelCount > sourceImages.length ? `/${job.parallelCount}` : ''}</span></>}
            </p>
            <div className="mt-2 flex max-h-20 flex-wrap items-center gap-1.5 overflow-hidden text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{getModeLabel(job)}</span>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">已完成</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{formatCreatedTime(job.created_at)}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{formatElapsedTime(job.elapsedMs)}</span>
              {job.imageQuote && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                  {formatAmoTokenImageQuote(job.imageQuote)}
                </span>
              )}
              {!job.imageQuote && job.costEstimate && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                  {formatCostEstimate(job.costEstimate)}
                </span>
              )}
              {!job.imageQuote && job.billingStatus && (
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">
                  {getBillingStatusLabel(job.billingStatus)}
                </span>
              )}
            </div>
            <div className="mt-2 grid max-h-20 grid-cols-2 gap-x-3 gap-y-1 overflow-y-auto rounded-md bg-muted/40 p-2 text-xs text-muted-foreground sm:grid-cols-3">
              {!showAspectInSummary && <span>比例：{job.aspect_ratio}</span>}
              <span>质量：{qualityLabel}</span>
              <span>风格：{styleLabel}</span>
              <span>背景：{backgroundLabel}</span>
              {job.mode === 'image-to-image' && <span>参考图：{referenceImageCount || 1}</span>}
              {!isMultiple && <span>数量：{job.parallelCount || sourceImages.length || 1}</span>}
            </div>
          </div>

          <div className="absolute bottom-4 right-4 flex items-center gap-1">
            {needsRedownload && onRetryDownload && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void handleRetryDownload()}
                disabled={retryingDownload || isDownloadingImages}
                title={isDownloadingImages ? '正在取回图片' : '重新下载到本地缓存'}
                aria-label={isDownloadingImages ? '正在取回图片' : '重新下载到本地缓存'}
                className="text-warning hover:text-warning/80"
              >
                <RefreshCw className={`w-4 h-4 ${retryingDownload || isDownloadingImages ? 'animate-spin' : ''}`} />
              </Button>
            )}

            {isMultiple ? (
              <DropdownMenu open={assetMenuOpen} onOpenChange={setAssetMenuOpen}>
                <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} title="添加到素材库" aria-label="添加到素材库">
                  {allAssetsSaved ? <Check className="w-4 h-4 text-success" /> : <ImagePlus className="w-4 h-4" />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {sourceImages.map((_, index) => (
                    <DropdownMenuItem key={index} onClick={() => {
                      void addImageToAssets(index);
                      setAssetMenuOpen(false);
                    }}>
                      {isAssetSaved(index) && <Check className="mr-1.5 w-3.5 h-3.5 text-success" />}
                      保存图片 {index + 1}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={addAllToAssets} className="font-medium text-primary">
                    {allAssetsSaved ? <Check className="mr-1.5 w-3.5 h-3.5 text-success" /> : <ImagePlus className="mr-1.5 w-3.5 h-3.5" />}
                    保存全部
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void addImageToAssets(0)}
                title="添加到素材库"
                aria-label="添加到素材库"
              >
                {isAssetSaved(0) ? <Check className="w-4 h-4 text-success" /> : <ImagePlus className="w-4 h-4" />}
              </Button>
            )}

            {isMultiple ? (
              <DropdownMenu open={downloadMenuOpen} onOpenChange={setDownloadMenuOpen}>
                <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} title="下载" aria-label="下载">
                  <Download className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {sourceImages.map((_, index) => (
                    <DropdownMenuItem key={index} onClick={() => {
                      downloadImage(index);
                      setDownloadMenuOpen(false);
                    }}>
                      下载图片 {index + 1}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onClick={downloadAll} className="font-medium text-primary">
                    <Download className="mr-1.5 w-3.5 h-3.5" />
                    下载全部
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => downloadImage(0)} title="下载" aria-label="下载">
                <Download className="w-4 h-4" />
              </Button>
            )}

            {isMultiple ? (
              <DropdownMenu open={copyMenuOpen} onOpenChange={setCopyMenuOpen}>
                <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })} title="复制图片" aria-label="复制图片">
                  {imgCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {sourceImages.map((_, index) => (
                    <DropdownMenuItem key={index} onClick={() => copyImage(index)}>
                      复制图片 {index + 1}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => copyImage(0)} title="复制图片" aria-label="复制图片">
                {imgCopied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onRetry(job)}
              title="重试"
              aria-label="重试"
              className="text-muted-foreground hover:text-primary"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="icon-sm" onClick={() => setDeleteDialogOpen(true)} title="移除" aria-label="移除">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {previewOpen && createPortal(
        <HistoryImagePreview
          images={previewImages}
          alt={job.prompt}
          onClose={() => setPreviewOpen(false)}
          actionPayloads={actionPayloads}
        />,
        document.body
      )}

      <PromptTextDialog
        open={promptDialogOpen}
        prompt={job.prompt}
        onOpenChange={setPromptDialogOpen}
      />

      {deleteDialogOpen && createPortal(
        <ConfirmDialog
          title="删除记录"
          message={
            <>
              确定要删除这条记录吗？此操作无法撤销。
              {isMultiple && <span className="mt-1 block text-warning">这将删除 {sourceImages.length} 张图片。</span>}
            </>
          }
          confirmText="删除"
          onConfirm={onClear}
          onCancel={() => setDeleteDialogOpen(false)}
        />,
        document.body
      )}
    </>
  );
});
