import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitNodeGeneration } from "@/components/canvas/canvas-generation-service";
import { createNovaTask, resolveImageTaskProvider } from "@/lib/ccode-task-client";
import type { CanvasGenerationConfig } from "@/components/canvas/types";
import { clearAmoTokenImageCatalogCache } from "@/lib/amotoken-image-catalog";

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

const catalogPayload = {
  catalog_version: "image-v12",
  data: [{
    model: "gpt-image-2",
    display_name: "GPT Image 2",
    mode: "generation",
    resolution_tier: "1K",
    sizes: ["1024x1024", "1536x1024"],
    quality: "auto",
    max_count: 4,
    max_reference_images: 4,
  }],
};

beforeEach(() => {
  clearAmoTokenImageCatalogCache();
  mockedCreateNovaTask.mockReset();
  mockedResolveImageTaskProvider.mockReset();
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/nova/image-products/catalog") {
      return new Response(JSON.stringify(catalogPayload), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (String(input) === "/api/nova/image-products/quote") {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        data: {
          catalog_version: "image-v12",
          model: body.model,
          display_name: "GPT Image 2",
          mode: body.mode,
          resolution: "1K",
          size: body.size,
          quality: body.quality,
          count: body.count,
          reference_image_count: body.reference_image_count,
          unit_price: 0.3,
          total_price: 0.3,
          currency: "API_CREDIT",
          available: true,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  }));
});

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

  it("rejects a custom size missing from the product catalog before task creation", async () => {
    mockedResolveImageTaskProvider.mockReturnValue({
      apiKey: "sk-test",
      baseUrl: "https://amotoken.cc",
      protocol: "openai",
      modelId: "gpt-image-2",
    });

    await expect(submitNodeGeneration({
      prompt: "一张测试图",
      referenceImages: [],
      config: { ...config, customSize: "1000x1400" },
    })).rejects.toThrow("当前模型不支持这个图片尺寸");
    expect(mockedCreateNovaTask).not.toHaveBeenCalled();
  });

  it("blocks canvas editing while the catalog has no edit product", async () => {
    mockedResolveImageTaskProvider.mockReturnValue({
      apiKey: "sk-test",
      baseUrl: "https://amotoken.cc",
      protocol: "openai",
      modelId: "gpt-image-2",
    });

    await expect(submitNodeGeneration({
      prompt: "编辑这张图",
      referenceImages: [{
        id: "ref-1",
        name: "reference.png",
        type: "image/png",
        dataUrl: `data:image/png;base64,${"a".repeat(200)}`,
      }],
      config,
    })).rejects.toThrow("当前模型暂不支持图生图");
    expect(mockedCreateNovaTask).not.toHaveBeenCalled();
  });

  it("quotes and submits the catalog-selected generation size", async () => {
    mockedResolveImageTaskProvider.mockReturnValue({
      apiKey: "sk-test",
      baseUrl: "https://amotoken.cc",
      protocol: "openai",
      modelId: "gpt-image-2",
    });
    mockedCreateNovaTask.mockResolvedValue("canvas-task-1");

    await expect(submitNodeGeneration({
      prompt: "一张横向测试图",
      referenceImages: [],
      config: { ...config, aspectRatio: "3:2" },
    })).resolves.toBe("canvas-task-1");

    expect(mockedCreateNovaTask).toHaveBeenCalledWith(expect.objectContaining({
      mode: "text-to-image",
      model: "gpt-image-2",
      outputSize: "1K",
      customSize: "1536x1024",
      aspectRatio: "3:2",
      gptImageQuality: "auto",
      parallelCount: 1,
      images: [],
      imageQuote: expect.objectContaining({
        model: "gpt-image-2",
        mode: "generation",
        resolutionTier: "1K",
        size: "1536x1024",
        totalPrice: 0.3,
      }),
    }));
  });
});
