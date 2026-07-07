'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/workspace/dialogs/ConfirmDialog';
import {
  fetchQuickPrompts,
  filterPromptsForMode,
  getPromptModeLabel,
  getPromptSummary,
  type PromptMode,
  type QuickPromptItem,
} from '@/lib/quick-prompts';

interface QuickPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMode: PromptMode;
  currentPrompt: string;
  onSelect: (content: string) => void;
}

export function QuickPromptDialog({
  open,
  onOpenChange,
  currentMode,
  currentPrompt,
  onSelect,
}: QuickPromptDialogProps) {
  const [prompts, setPrompts] = useState<QuickPromptItem[]>([]);
  const [activeMode, setActiveMode] = useState(currentMode);
  const [overwriteTarget, setOverwriteTarget] = useState<QuickPromptItem | null>(null);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      prevOpenRef.current = false;
      return;
    }
    if (!prevOpenRef.current) {
      prevOpenRef.current = true;
      setActiveMode(currentMode);
      setOverwriteTarget(null);
    }
    void fetchQuickPrompts().then(setPrompts);
  }, [currentMode, open]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleClick = useCallback((item: QuickPromptItem) => {
    if (currentPrompt.trim().length > 0) {
      setOverwriteTarget(item);
    } else {
      onSelect(item.content);
      onOpenChange(false);
    }
  }, [currentPrompt, onSelect, onOpenChange]);

  const handleConfirmOverwrite = useCallback(() => {
    if (overwriteTarget) {
      onSelect(overwriteTarget.content);
      setOverwriteTarget(null);
      onOpenChange(false);
    }
  }, [overwriteTarget, onSelect, onOpenChange]);

  const handleCancelOverwrite = useCallback(() => {
    setOverwriteTarget(null);
  }, []);

  const filteredPrompts = filterPromptsForMode(prompts, activeMode);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-black/50 sm:items-center sm:p-4"
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh' }}
        onClick={handleClose}
        onWheel={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
      >
        <div
          className="flex min-h-[100dvh] w-full flex-col overflow-y-auto rounded-none border border-border bg-card p-6 pt-12 shadow-lg sm:min-h-0 sm:max-w-lg sm:rounded-xl sm:pt-6"
          onClick={e => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold">快速提示词</h3>
          </div>

          <div className="mb-4 flex w-fit rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setActiveMode('text-to-image')}
              className={`h-7 rounded-md px-3 text-sm transition-colors ${activeMode === 'text-to-image'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              文生图
            </button>
            <button
              type="button"
              onClick={() => setActiveMode('image-to-image')}
              className={`h-7 rounded-md px-3 text-sm transition-colors ${activeMode === 'image-to-image'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
            >
              图生图
            </button>
          </div>

          {filteredPrompts.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无可用模板</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filteredPrompts.map((item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  onClick={() => handleClick(item)}
                  className="min-h-24 rounded-lg border border-border bg-muted/40 p-3 text-left transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`使用${item.title}模板`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium leading-snug">{item.title}</span>
                    <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                      {getPromptModeLabel(item)}
                    </span>
                  </span>
                  <span className="mt-2 line-clamp-2 block text-xs leading-4 text-muted-foreground">
                    {getPromptSummary(item.content, 56)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleClose}>
              关闭
            </Button>
          </div>
        </div>
      </div>

      {overwriteTarget && (
        <ConfirmDialog
          title="覆盖提示词"
          message={
            <p>当前输入框已有内容，是否要用「{overwriteTarget.title}」模板覆盖？</p>
          }
          confirmText="覆盖"
          cancelText="取消"
          variant="default"
          onConfirm={handleConfirmOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
    </>
  );
}
