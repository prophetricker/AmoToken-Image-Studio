import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasNode } from "@/components/canvas/components/canvas-node";
import { CanvasNodeType, type CanvasNodeData } from "@/components/canvas/types";

const imageNode: CanvasNodeData = {
  id: "image-node-1",
  type: CanvasNodeType.Image,
  title: "结果图",
  position: { x: 0, y: 0 },
  width: 320,
  height: 240,
  metadata: {
    status: "error",
  },
};

describe("CanvasNode", () => {
  it("uses a concise user-facing image generation failure fallback", () => {
    render(
      <CanvasNode
        data={imageNode}
        isSelected={false}
        isRelated={false}
        isConnectionTarget={false}
        zIndex={1}
        showImageInfo={false}
        onPointerDownNode={vi.fn()}
        onSelectNode={vi.fn()}
        onContextMenu={vi.fn()}
        onConnectStart={vi.fn()}
        onResizeStart={vi.fn()}
        onContentChange={vi.fn()}
      />,
    );

    expect(screen.getByText("生图失败")).toBeInTheDocument();
    expect(screen.queryByText("生成失败")).not.toBeInTheDocument();
  });
});
