'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, LayoutTemplate, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/workspace/dialogs/ConfirmDialog';
import {
  fetchQuickPrompts,
  getFeaturedPrompts,
  getPromptModeLabel,
  getPromptSummary,
  type PromptMode,
  type QuickPromptItem,
} from '@/lib/quick-prompts';

interface SceneTemplateStripProps {
  currentMode: PromptMode;
  currentPrompt: string;
  onSelect: (content: string) => void;
  onOpenAll: () => void;
}

export function SceneTemplateStrip({
  currentMode,
  currentPrompt,
  onSelect,
  onOpenAll,
}: SceneTemplateStripProps) {
  const [prompts, setPrompts] = useState<QuickPromptItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [overwriteTarget, setOverwriteTarget] = useState<QuickPromptItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchQuickPrompts().then(items => {
      if (!cancelled) setPrompts(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const featuredPrompts = useMemo(
    () => getFeaturedPrompts(prompts, currentMode, 6),
    [currentMode, prompts],
  );

  const handleUseTemplate = useCallback((item: QuickPromptItem) => {
    if (currentPrompt.trim().length > 0 && currentPrompt.trim() !== item.content.trim()) {
      setOverwriteTarget(item);
      return;
    }
    onSelect(item.content);
  }, [currentPrompt, onSelect]);

  const handleConfirmOverwrite = useCallback(() => {
    if (!overwriteTarget) return;
    onSelect(overwriteTarget.content);
    setOverwriteTarget(null);
  }, [onSelect, overwriteTarget]);

  if (featuredPrompts.length === 0) return null;

  return (
    <>
      <section className="mx-3 mb-2 rounded-xl border border-border/70 bg-background/60 p-3 sm:mx-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <LayoutTemplate className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium text-foreground">场景模板</h3>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {getPromptModeLabel(currentMode)}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">先选场景，再按你的图片或需求改一句话</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="xs" className="gap-1" onClick={onOpenAll}>
              <Zap className="h-3.5 w-3.5" />
              更多
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setCollapsed(value => !value)}
              title={collapsed ? '展开场景模板' : '收起场景模板'}
              aria-label={collapsed ? '展开场景模板' : '收起场景模板'}
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {featuredPrompts.map(item => (
              <button
                key={`${item.type}-${item.title}`}
                type="button"
                onClick={() => handleUseTemplate(item)}
                className="group min-h-16 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`使用${item.title}场景模板`}
              >
                <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                  {item.title}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs leading-4 text-muted-foreground">
                  {getPromptSummary(item.content, 52)}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {overwriteTarget && (
        <ConfirmDialog
          title="覆盖提示词"
          message={<p>当前输入框已有内容，是否要用「{overwriteTarget.title}」模板覆盖？</p>}
          confirmText="覆盖"
          cancelText="取消"
          variant="default"
          onConfirm={handleConfirmOverwrite}
          onCancel={() => setOverwriteTarget(null)}
        />
      )}
    </>
  );
}
