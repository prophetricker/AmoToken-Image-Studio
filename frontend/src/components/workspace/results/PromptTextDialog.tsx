'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface PromptTextDialogProps {
  open: boolean;
  prompt: string;
  onOpenChange: (open: boolean) => void;
}

export function PromptTextDialog({ open, prompt, onOpenChange }: PromptTextDialogProps) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>完整提示词</DialogTitle>
        </DialogHeader>
        <Textarea
          aria-label="完整提示词内容"
          readOnly
          value={prompt}
          className="min-h-72 resize-y whitespace-pre-wrap rounded-xl bg-muted/30 text-sm leading-6"
        />
        <div className="flex justify-end border-t border-border pt-3">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void copyPrompt()}>
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? '已复制' : '复制全部'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
