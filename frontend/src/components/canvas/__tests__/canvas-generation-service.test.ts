import { describe, expect, it, vi } from "vitest";
import { submitNodeGeneration } from "@/components/canvas/canvas-generation-service";
import { createNovaTask, resolveImageTaskProvider } from "@/lib/ccode-task-client";
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

const mockedCreateNovaTask = vi.mocked(createNovaTask);
const mockedResolveImageTaskProvider = vi.mocked(resolveImageTaskProvider);

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
    mockedResolveImageTaskProvider.mockReturnValue({
      apiKey: "",
      baseUrl: "https://amotoken.cc",
      protocol: "openai",
      modelId: "gpt-image-2",
    });

    await expect(submitNodeGeneration({
      prompt: "一张测试图",
      referenceImages: [],
      config,
    })).rejects.toThrow("请先粘贴 AmoToken 令牌");
  });

  it("cleans task creation failures before they reach canvas nodes", async () => {
    mockedResolveImageTaskProvider.mockReturnValue({
      apiKey: "sk-test",
      baseUrl: "https://amotoken.cc",
      protocol: "openai",
      modelId: "gpt-image-2",
    });
    mockedCreateNovaTask.mockRejectedValue(new Error("API 请求失败: 502 Upstream request failed"));

    let message = "";
    try {
      await submitNodeGeneration({
        prompt: "一张测试图",
        referenceImages: [],
        config,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("生图失败");
    expect(message).not.toMatch(/Upstream|NewAPI|上游/);
  });
});
