'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  ImageIcon,
  Info,
  Settings,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BackupProgress } from '@/components/BackupProgress';
import { syncDynamicModelExports } from '@/lib/gemini-config';
import {
  downloadBlob,
  exportAllData,
  generateBackupFilename,
  importAllData,
  type BackupProgress as BackupProgressType,
} from '@/lib/backup-utils';
import {
  AMOTOKEN_IMAGE_MODEL_ID,
  loadRegistry,
  saveAmoTokenToken,
} from '@/lib/nova-models';
import { BA_RANDOM_URL, BING_WALLPAPER_URL } from '@/lib/constants';
import { PROMPT_DATA_SOURCES, getPromptSourceLabel } from '@/lib/prompt-gallery-data';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApiKeyChange?: (apiKey: string) => void;
}

function getCurrentAmoToken(): string {
  const registry = loadRegistry();
  const imageModel = registry.imageModels.find(model => model.id === AMOTOKEN_IMAGE_MODEL_ID);
  return imageModel?.apiKey || '';
}

export function SettingsModal({ isOpen, onClose, onApiKeyChange }: SettingsModalProps) {
  const [amotokenApiKey, setAmotokenApiKey] = useState(() => getCurrentAmoToken());
  const [showAmoTokenApiKey, setShowAmoTokenApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [backupProgress, setBackupProgress] = useState<BackupProgressType>({ percent: 0, message: '' });
  const [isBackupActive, setIsBackupActive] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setAmotokenApiKey(getCurrentAmoToken());
      setShowAmoTokenApiKey(false);
      setError(null);
      setSuccess(null);
      setBackupError(null);
      setBackupSuccess(null);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    if (isBackupActive) return;
    setAmotokenApiKey(getCurrentAmoToken());
    setShowAmoTokenApiKey(false);
    setError(null);
    setSuccess(null);
    setBackupError(null);
    setBackupSuccess(null);
    onClose();
  };

  const handleSaveAmoTokenToken = () => {
    const token = amotokenApiKey.trim();
    if (!token) {
      setError('请先粘贴 AmoToken 令牌');
      setSuccess(null);
      return;
    }

    saveAmoTokenToken(token);
    syncDynamicModelExports();
    window.dispatchEvent(new Event('nova-model-registry-updated'));
    onApiKeyChange?.(token);
    setAmotokenApiKey(token);
    setError(null);
    setSuccess('令牌已保存');
  };

  const handleExport = async () => {
    setIsBackupActive(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const blob = await exportAllData(progress => setBackupProgress(progress));
      const filename = generateBackupFilename();
      downloadBlob(blob, filename);
      setBackupSuccess(`数据已导出为 ${filename}`);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setIsBackupActive(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setBackupError('请选择 .zip 格式的备份文件');
      return;
    }

    setIsBackupActive(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      await importAllData(file, progress => setBackupProgress(progress));
      setBackupSuccess('数据已导入，页面将在 2 秒后刷新。');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '导入失败');
      setIsBackupActive(false);
    }
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void handleImport(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 pt-0 sm:max-w-3xl">
        <DialogHeader className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <DialogTitle>设置</DialogTitle>
          </div>
          <DialogDescription>
            粘贴你的 AmoToken 专用令牌后即可使用预置的 GPT Image 2 生图能力。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="models" className="min-h-0 flex-1 gap-0">
          <TabsList className="h-auto w-full rounded-none border-b bg-transparent p-0">
            <TabsTrigger value="models" className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-active:border-primary data-active:bg-transparent data-active:shadow-none">
              <ImageIcon className="h-4 w-4" />
              模型配置
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-active:border-primary data-active:bg-transparent data-active:shadow-none">
              <Database className="h-4 w-4" />
              备份
            </TabsTrigger>
            <TabsTrigger value="about" className="gap-2 rounded-none border-b-2 border-transparent px-4 py-3 data-active:border-primary data-active:bg-transparent data-active:shadow-none">
              <Info className="h-4 w-4" />
              关于
            </TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="mt-0 min-h-0 space-y-5 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-1">
              <p className="text-sm font-medium">连接 AmoToken</p>
              <p className="text-xs text-muted-foreground">
                爱词元生图服务已预置完成，你只需要粘贴令牌。
              </p>
            </div>

            {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {success && <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">{success}</div>}

            <div className="space-y-3 rounded-lg border p-4">
              <div className="space-y-2">
                <label htmlFor="amotoken-api-key" className="text-sm font-medium">AmoToken 令牌</label>
                <div className="relative">
                  <Input
                    id="amotoken-api-key"
                    type={showAmoTokenApiKey ? 'text' : 'password'}
                    value={amotokenApiKey}
                    onChange={event => setAmotokenApiKey(event.target.value)}
                    placeholder="粘贴你的 AmoToken 专用令牌"
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAmoTokenApiKey(value => !value)}
                    className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={showAmoTokenApiKey ? '隐藏令牌' : '显示令牌'}
                  >
                    {showAmoTokenApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                建议在 amotoken.cc 创建仅限生图模型、带额度上限的专用令牌。
              </p>

              <div className="flex justify-end">
                <Button onClick={handleSaveAmoTokenToken} disabled={!amotokenApiKey.trim()}>
                  保存令牌
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="backup" className="mt-0 min-h-0 space-y-6 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-2">
              <h3 className="text-base font-medium">数据备份与恢复</h3>
              <p className="text-sm text-muted-foreground">
                导出本地配置和历史记录，或从备份文件恢复。备份文件可能包含令牌，请妥善保存。
              </p>
            </div>

            <BackupProgress percent={backupProgress.percent} message={backupProgress.message} isActive={isBackupActive} />

            {backupSuccess && !isBackupActive && (
              <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-500" />
                <p className="text-sm text-emerald-900 dark:text-emerald-100">{backupSuccess}</p>
              </div>
            )}

            {backupError && !isBackupActive && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <p className="break-all text-sm text-destructive">{backupError}</p>
              </div>
            )}

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Download className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex-1 space-y-2">
                  <h4 className="font-medium">导出数据</h4>
                  <p className="text-sm text-muted-foreground">将本地数据打包为 ZIP 文件。</p>
                  <Button onClick={handleExport} disabled={isBackupActive} className="gap-2">
                    <Download className="h-4 w-4" />
                    全量备份
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <Upload className="mt-0.5 h-5 w-5 text-muted-foreground" />
                <div className="flex-1 space-y-2">
                  <h4 className="font-medium">导入数据</h4>
                  <p className="text-sm text-muted-foreground">从 ZIP 备份恢复本地数据，此操作会覆盖当前本地记录。</p>
                  <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileSelect} className="hidden" />
                  <Button onClick={() => fileInputRef.current?.click()} disabled={isBackupActive} variant="outline" className="gap-2">
                    <Upload className="h-4 w-4" />
                    选择备份文件
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="about" className="mt-0 min-h-0 space-y-4 overflow-y-auto p-4 text-sm sm:p-6">
            <h3 className="text-lg font-medium">
              Nova Image <span className="text-xs font-normal text-muted-foreground">v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
            </h3>
            <p className="text-muted-foreground">
              AmoToken v0.5 基于 Nova Image Studio 定制，只向普通用户开放 GPT Image 2 文生图、单图编辑和多图融合。
            </p>
            <p className="text-muted-foreground">
              项目地址：
              {' '}
              <a
                href="https://github.com/tianjiangqiji/nova-image-studio"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                tianjiangqiji/nova-image-studio <ExternalLink className="h-3 w-3" />
              </a>
            </p>

            <details className="group rounded-lg bg-muted/50 p-3">
              <summary className="flex cursor-pointer select-none items-center gap-2 font-medium">
                数据来源
              </summary>
              <ul className="mt-3 list-inside list-disc space-y-2 text-muted-foreground">
                {PROMPT_DATA_SOURCES.map(source => (
                  <li key={source.name}>
                    <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      {getPromptSourceLabel(source.sourceUrl)} <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                ))}
                <li>
                  <a href={BA_RANDOM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    BA 随机图片 <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>
                  <a href={BING_WALLPAPER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                    Bing 壁纸 <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              </ul>
            </details>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
