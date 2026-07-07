import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from '@/components/ui/tabs';
import { WorkspaceModeTabs } from '@/components/workspace/WorkspaceModeTabs';

describe('WorkspaceModeTabs v0.5 public modes', () => {
  it('does not show GIF, assets, or canvas modes to ordinary users', () => {
    render(
      <Tabs value="image-generation">
        <WorkspaceModeTabs />
      </Tabs>,
    );

    expect(screen.getByText('生图工作台')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('反推提示词')).toBeInTheDocument();
    expect(screen.queryByText('动图生成')).not.toBeInTheDocument();
    expect(screen.queryByText('我的素材')).not.toBeInTheDocument();
    expect(screen.queryByText('无限画布')).not.toBeInTheDocument();
  });

  it('can reveal candidate modes only when the gray switch is enabled', () => {
    render(
      <Tabs value="image-generation">
        <WorkspaceModeTabs showCandidateModes />
      </Tabs>,
    );

    expect(screen.getByText('动图生成')).toBeInTheDocument();
    expect(screen.getByText('我的素材')).toBeInTheDocument();
    expect(screen.getByText('无限画布')).toBeInTheDocument();
  });
});
