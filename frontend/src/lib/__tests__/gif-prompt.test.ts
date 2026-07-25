import { describe, expect, it } from 'vitest';
import { buildGifPrompt } from '@/lib/gif-prompt';

describe('GIF sprite-sheet prompt', () => {
  it('requests the released 2048x1536 grid and 512px frames', () => {
    const prompt = buildGifPrompt({
      userPrompt: '小鲨鱼挥手',
      refImageCount: 0,
      loop: true,
      closedLoop: false,
    });

    expect(prompt).toContain('exactly 2048x1536 pixels');
    expect(prompt).toContain('exactly 512x512 pixels');
    expect(prompt).not.toMatch(/3264x2448|816x816/);
  });
});
