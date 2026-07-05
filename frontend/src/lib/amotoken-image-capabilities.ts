export type AmoTokenImageMode = 'text-to-image' | 'image-to-image' | 'multi-image-fusion';

export interface AmoTokenImageCapability {
  id: string;
  modelId: string;
  provider: 'openai' | 'gemini';
  visible: boolean;
  gray: boolean;
  modes: AmoTokenImageMode[];
  allowedSizes: string[];
  allowedQualities: string[];
  maxInputImages: number;
  autoRetry: boolean;
}

export const AMOTOKEN_IMAGE_MODEL_ID = 'amotoken-gpt-image-2';
export const AMOTOKEN_TEXT_MODEL_ID = 'amotoken-gpt-5.4-mini';

export const AMOTOKEN_IMAGE_CAPABILITIES: AmoTokenImageCapability[] = [
  {
    id: AMOTOKEN_IMAGE_MODEL_ID,
    modelId: 'gpt-image-2',
    provider: 'openai',
    visible: true,
    gray: false,
    modes: ['text-to-image', 'image-to-image', 'multi-image-fusion'],
    allowedSizes: ['1024x1024', '1536x1024', '1024x1536'],
    allowedQualities: ['medium'],
    maxInputImages: 4,
    autoRetry: false,
  },
  {
    id: 'amotoken-banana-hidden',
    modelId: 'banana',
    provider: 'gemini',
    visible: false,
    gray: true,
    modes: [],
    allowedSizes: ['1024x1024'],
    allowedQualities: [],
    maxInputImages: 1,
    autoRetry: false,
  },
];

export function getPublicAmoTokenImageCapabilities(): AmoTokenImageCapability[] {
  return AMOTOKEN_IMAGE_CAPABILITIES.filter(capability => capability.visible && !capability.gray);
}
