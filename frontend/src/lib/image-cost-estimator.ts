import type { Mode, OutputSize } from '@/lib/job-store';
import type { GptImageQuality } from '@/lib/model-capabilities';

export type BillingStatus =
  | 'unverified'
  | 'pending-newapi-check'
  | 'confirmed-newapi-summary'
  | 'confirmed-charged'
  | 'confirmed-not-charged';

export interface CostEstimate {
  currency: 'CNY';
  min: number;
  max: number;
  source: 'gray-log-estimate';
}

interface EstimateInput {
  mode: Mode;
  outputSize: OutputSize;
  quality?: GptImageQuality;
  count?: number;
  referenceImageCount?: number;
}

const GENERATION_TABLE: Record<Exclude<OutputSize, 'auto' | '512'>, [number, number]> = {
  '1K': [0.03, 0.06],
  '2K': [0.08, 0.13],
  '4K': [0.15, 0.20],
};

const EDIT_TABLE: Record<Exclude<OutputSize, 'auto' | '512'>, [number, number]> = {
  '1K': [0.04, 0.08],
  '2K': [0.10, 0.13],
  '4K': [0.16, 0.20],
};

const FUSION_TABLE: Record<Exclude<OutputSize, 'auto' | '512'>, [number, number]> = {
  '1K': [0.05, 0.10],
  '2K': [0.12, 0.13],
  '4K': [0.18, 0.20],
};

function normalizeOutputSize(size: OutputSize): Exclude<OutputSize, 'auto' | '512'> {
  if (size === '4K') return '4K';
  if (size === '2K') return '2K';
  return '1K';
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function estimateImageCost(input: EstimateInput): CostEstimate {
  const size = normalizeOutputSize(input.outputSize);
  const referenceImageCount = Math.max(0, Math.trunc(input.referenceImageCount || 0));
  const table = input.mode === 'image-to-image'
    ? referenceImageCount > 1 ? FUSION_TABLE : EDIT_TABLE
    : GENERATION_TABLE;
  const [baseMin, baseMax] = table[size];
  const count = Math.max(1, Math.trunc(input.count || 1));

  return {
    currency: 'CNY',
    min: roundMoney(baseMin * count),
    max: roundMoney(baseMax * count),
    source: 'gray-log-estimate',
  };
}

export function formatCostEstimate(estimate?: CostEstimate): string {
  if (!estimate) return '预估费用待校准';
  if (estimate.min === estimate.max) return `约 ¥${estimate.min.toFixed(2)}`;
  return `约 ¥${estimate.min.toFixed(2)}-${estimate.max.toFixed(2)}`;
}

export function getBillingStatusLabel(status?: BillingStatus): string {
  switch (status) {
    case 'pending-newapi-check':
      return '实际扣费待 NewAPI 后台核对';
    case 'confirmed-newapi-summary':
      return '已从 NewAPI 摘要确认';
    case 'confirmed-charged':
      return '已确认扣费';
    case 'confirmed-not-charged':
      return '已确认未扣费';
    case 'unverified':
    default:
      return '实际扣费待 NewAPI 后台核对';
  }
}
