"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, LockOpen, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GenerationParamsBar, type GenerationParamsValue } from "@/components/GenerationParamsBar";
import { cn } from "@/lib/utils";
import { normalizeModel, type GptImageQuality } from "@/lib/model-capabilities";
import { resolveImageTaskProvider } from "@/lib/ccode-task-client";
import {
  fetchAmoTokenImageCatalog,
  type AmoTokenImageCatalog,
  type AmoTokenImageOperationMode,
} from "@/lib/amotoken-image-catalog";
import {
  fetchAmoTokenImageQuote,
  formatAmoTokenImageQuote,
  type AmoTokenImageQuote,
} from "@/lib/amotoken-image-quote";
import { getAmoTokenToken } from "@/lib/nova-models";
import type { OutputSize } from "@/lib/job-store";
import { CanvasMentionEditor } from "./canvas-mention-editor";
import { Spinner } from "./canvas-ui";
import type { CanvasGenerationConfig } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import {
  getCanvasAspectRatioForSize,
  normalizeCanvasGenerationConfig,
  resolveCanvasImageProduct,
} from "../canvas-product-policy";

type LoadStatus = "idle" | "loading" | "ready" | "error";

function isOutputSize(value: string): value is OutputSize {
  return value === "1K" || value === "2K" || value === "4K";
}

function isQuality(value: string): value is GptImageQuality {
  return value === "auto" || value === "high" || value === "medium" || value === "low";
}

/** 渲染在「编排节点」内部：提示词（@ 引用）+ 模型参数（复用宿主 GenerationParamsBar，含自定义分辨率）+ 生成按钮。 */
export function CanvasConfigNodePanel({
  prompt,
  references,
  config,
  lockResultNodes,
  referenceLimit,
  busy,
  optimizing,
  onPromptChange,
  onConfigChange,
  onToggleLock,
  onSelect,
  onOptimizePrompt,
  onGenerate,
}: {
  prompt: string;
  references: CanvasResourceReference[];
  config: CanvasGenerationConfig;
  lockResultNodes: boolean;
  referenceLimit: { imageCount: number; max: number; exceeded: boolean };
  busy: boolean;
  optimizing: boolean;
  onPromptChange: (value: string) => void;
  onConfigChange: (patch: Partial<CanvasGenerationConfig>) => void;
  onToggleLock: () => void;
  onSelect: () => void;
  onOptimizePrompt: () => void;
  onGenerate: () => void;
}) {
  const token = getAmoTokenToken();
  const normalizedModel = normalizeModel(config.model);
  const operationMode: AmoTokenImageOperationMode = referenceLimit.imageCount > 0 ? "edit" : "generation";
  const [catalog, setCatalog] = useState<AmoTokenImageCatalog | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>("idle");
  const [catalogMessage, setCatalogMessage] = useState("");
  const [quote, setQuote] = useState<AmoTokenImageQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<LoadStatus>("idle");

  const provider = useMemo(() => {
    try {
      return resolveImageTaskProvider(normalizedModel);
    } catch {
      return null;
    }
  }, [normalizedModel]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      queueMicrotask(() => {
        if (cancelled) return;
        setCatalog(null);
        setQuote(null);
        setCatalogStatus("error");
        setCatalogMessage("请先粘贴 AmoToken 令牌");
      });
      return () => { cancelled = true; };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setCatalog(null);
      setQuote(null);
      setCatalogStatus("loading");
      setCatalogMessage("正在读取生图能力…");
    });
    void fetchAmoTokenImageCatalog(token).then(nextCatalog => {
      if (cancelled) return;
      setCatalog(nextCatalog);
      setCatalogStatus("ready");
      setCatalogMessage("");
    }).catch(error => {
      if (cancelled) return;
      setCatalogStatus("error");
      setCatalogMessage(error instanceof Error ? error.message : "暂时无法读取生图能力");
    });
    return () => { cancelled = true; };
  }, [token]);

  const productResolution = useMemo(() => {
    if (!catalog || !provider) return null;
    return resolveCanvasImageProduct({
      catalog,
      providerModel: provider.modelId,
      mode: operationMode,
      config,
      referenceImageCount: referenceLimit.imageCount,
    });
  }, [catalog, config, operationMode, provider, referenceLimit.imageCount]);

  const catalogOptions = useMemo(() => {
    if (!catalog || !provider) return undefined;
    const catalogModel = catalog.models.find(model => model.id === provider.modelId);
    if (!catalogModel) return undefined;
    const products = catalogModel.products.filter(product => product.mode === operationMode);
    if (products.length === 0) return undefined;
    const tierValues = Array.from(new Set(products.map(product => product.resolutionTier))).filter(isOutputSize);
    const selectedTier = tierValues.includes(config.outputSize) ? config.outputSize : tierValues[0];
    const tierProducts = products.filter(product => product.resolutionTier === selectedTier);
    const qualityValues = Array.from(new Set(tierProducts.map(product => product.quality))).filter(isQuality);
    const selectedQuality = qualityValues.includes(config.gptImageQuality) ? config.gptImageQuality : qualityValues[0];
    const sizes = Array.from(new Set(tierProducts
      .filter(product => product.quality === selectedQuality)
      .flatMap(product => product.sizes)));
    const aspectRatios = sizes.map(size => ({
      value: getCanvasAspectRatioForSize(size),
      label: getCanvasAspectRatioForSize(size),
      resolution: size,
    })).filter((option, index, options) => options.findIndex(item => item.value === option.value) === index);
    return {
      models: [{ value: normalizedModel, label: catalogModel.displayName, recommended: true }],
      sizes: tierValues.map(value => ({ value, label: value })),
      aspectRatios,
      qualities: qualityValues.map(value => ({ value, label: value === "auto" ? "自动" : value })),
      maxParallelCount: catalogModel.maxCount,
    };
  }, [catalog, config.gptImageQuality, config.outputSize, normalizedModel, operationMode, provider]);

  useEffect(() => {
    const normalized = normalizeCanvasGenerationConfig(config);
    const patch: Partial<CanvasGenerationConfig> = {};
    if (config.model !== normalized.model) patch.model = normalized.model;
    const catalogSizes = catalogOptions?.sizes.map(option => option.value) || [];
    const nextOutputSize = catalogSizes.length > 0 && !catalogSizes.includes(normalized.outputSize)
      ? catalogSizes[0]
      : normalized.outputSize;
    if (config.outputSize !== nextOutputSize) patch.outputSize = nextOutputSize;
    const catalogRatios = catalogOptions?.aspectRatios.map(option => option.value) || [];
    const nextAspectRatio = catalogRatios.length > 0 && !catalogRatios.includes(normalized.aspectRatio)
      ? catalogRatios[0]
      : normalized.aspectRatio;
    if (config.aspectRatio !== nextAspectRatio) patch.aspectRatio = nextAspectRatio;
    if (config.customSize !== undefined) patch.customSize = undefined;
    const nextCount = catalogOptions
      ? Math.min(normalized.count, catalogOptions.maxParallelCount) as CanvasGenerationConfig['count']
      : normalized.count;
    if (config.count !== nextCount) patch.count = nextCount;
    if (config.gptImageQuality !== "auto") patch.gptImageQuality = "auto";
    if (config.gptImageStyle !== "auto") patch.gptImageStyle = "auto";
    if (config.gptImageBackground !== "auto") patch.gptImageBackground = "auto";
    if (Object.keys(patch).length > 0) onConfigChange(patch);
  }, [catalogOptions, config, onConfigChange]);

  useEffect(() => {
    let cancelled = false;
    if (!token || !productResolution?.available) {
      queueMicrotask(() => {
        if (cancelled) return;
        setQuote(null);
        setQuoteStatus("idle");
      });
      return () => { cancelled = true; };
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setQuote(null);
      setQuoteStatus("loading");
    });
    const timer = window.setTimeout(() => {
      void fetchAmoTokenImageQuote(token, {
        model: productResolution.model,
        mode: productResolution.mode,
        size: productResolution.size,
        quality: productResolution.quality,
        count: productResolution.count,
        referenceImageCount: productResolution.referenceImageCount,
      }).then(nextQuote => {
        if (cancelled) return;
        setQuote(nextQuote);
        setQuoteStatus("ready");
      }).catch(() => {
        if (cancelled) return;
        setQuoteStatus("error");
      });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productResolution, token]);

  const value: GenerationParamsValue = {
    model: normalizedModel,
    outputSize: config.outputSize,
    customSize: config.customSize,
    aspectRatio: config.aspectRatio,
    temperature: config.temperature,
    parallelCount: config.count,
    gptImageAdvancedParams: { quality: config.gptImageQuality, style: config.gptImageStyle, background: config.gptImageBackground },
  };

  const handleParamsChange = (patch: Partial<GenerationParamsValue>) => {
    const next: Partial<CanvasGenerationConfig> = {};
    if (patch.model !== undefined) next.model = patch.model;
    if (patch.outputSize !== undefined) next.outputSize = patch.outputSize;
    if ("customSize" in patch) next.customSize = patch.customSize;
    if (patch.aspectRatio !== undefined) next.aspectRatio = patch.aspectRatio;
    if (patch.temperature !== undefined) next.temperature = patch.temperature;
    if (patch.parallelCount !== undefined) next.count = patch.parallelCount;
    if (patch.gptImageAdvancedParams) {
      next.gptImageQuality = patch.gptImageAdvancedParams.quality;
      next.gptImageStyle = patch.gptImageAdvancedParams.style;
      next.gptImageBackground = patch.gptImageAdvancedParams.background;
    }
    onConfigChange(next);
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2 text-xs" onPointerDown={() => onSelect()}>
      <div className="min-h-0 flex-1 cursor-text overflow-auto rounded-lg border border-input bg-background p-1.5" data-no-drag>
        <CanvasMentionEditor value={prompt} references={references} onChange={onPromptChange} placeholder="提示词，输入 @ 引用前置节点…" className="min-h-[56px] text-xs" />
      </div>

      <div className="shrink-0 space-y-2">
        <GenerationParamsBar
          value={value}
          onChange={handleParamsChange}
          size="xs"
          catalogOptions={catalogOptions}
        />
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={onOptimizePrompt}
            disabled={busy || optimizing || !prompt.trim()}
            className="shrink-0 gap-1"
            title="优化提示词（结合连接的前置图片/文字）"
          >
            {optimizing ? <Spinner className="size-3.5" /> : <Wand2 className="size-3.5" />}
          </Button>
          <Button
            variant={lockResultNodes ? "secondary" : "outline"}
            size="xs"
            onClick={onToggleLock}
            className={cn("flex-1 gap-1", lockResultNodes && "border-primary text-primary")}
            title={lockResultNodes ? "已锁定：结果直接覆盖连接的图片节点" : "未锁定：每次生成新建结果图片节点"}
          >
            {lockResultNodes ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
            <span className="text-[11px]">{lockResultNodes ? "将覆盖已有结果节点" : "将新建结果节点"}</span>
          </Button>
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={busy || referenceLimit.exceeded || !productResolution?.available || quoteStatus !== "ready" || !quote}
            className="flex-1"
          >
            {busy ? <Spinner className="size-4" /> : <Sparkles className="size-4" />}
            生成
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] leading-tight">
          <span className={cn("min-w-0 truncate", referenceLimit.exceeded ? "text-destructive" : "text-muted-foreground")}>
            当前模型允许参考图数量：{referenceLimit.max}
          </span>
          <span className={cn("shrink-0", referenceLimit.exceeded ? "text-destructive" : "text-muted-foreground")}>
            {referenceLimit.exceeded ? "参考图超过模型限制" : `已连接 ${referenceLimit.imageCount} 张`}
          </span>
        </div>
        <p className={cn(
          "line-clamp-2 text-[11px] leading-tight",
          productResolution && !productResolution.available ? "text-destructive" : "text-muted-foreground",
        )}>
          {catalogStatus === "loading"
            ? catalogMessage
            : catalogStatus === "error"
              ? catalogMessage
              : productResolution && !productResolution.available
                ? productResolution.reason
                : quote
                  ? formatAmoTokenImageQuote(quote)
                  : quoteStatus === "loading"
                    ? "正在读取实时价格…"
                    : "实时价格暂不可用"}
        </p>
      </div>
    </div>
  );
}
