import { describe, expect, it, vi } from "vitest";
import { submitNodeGeneration } from "@/components/canvas/canvas-generation-service";
import type { CanvasGenerationConfig } from "@/components/canvas/types";

vi.mock("@/lib/ccode-task-client", () => ({
  resolveImageTaskProvider: vi.fn(() => ({
    apiKey: "",
    baseUrl: "https://amotoken.cc",
    protocol: "openai",
    modelId: "gpt-image-2",
  })),
  createNovaTask: vi.fn(),
  getNovaTask: vi.fn(),
  ackNovaTask: vi.fn(),
}));

const config: CanvasGenerationConfig = {
  model: "amotoken-gpt-image-2",
  outputSize: "1K",
  aspectRatio: "1:1",
  temperature: 1,
  count: 1,
  gptImageQuality: "auto",
  gptImageStyle: "auto",
  gptImageBackground: "auto",
};

describe("canvas generation service", () => {
  it("asks for an AmoToken token when image generation credentials are missing", async () => {
    await expect(submitNodeGeneration({
      prompt: "一张测试图",
      referenceImages: [],
      config,
    })).rejects.toThrow("请先粘贴 AmoToken 令牌");
  });
});
