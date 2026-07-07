import { describe, expect, it } from 'vitest';
import {
  createReverseHistoryEntry,
  mergeReverseHistory,
  type StoredReverseResult,
} from '@/lib/reverse-prompt-store';

describe('reverse prompt history helpers', () => {
  it('creates stable history entries without overwriting current or previous slots', () => {
    const entry = createReverseHistoryEntry({
      text: 'cinematic shark portrait',
      model: 'helper',
      mode: 'replicate',
      timestamp: 1772800000000,
    });

    expect(entry.slot).toBe('history:1772800000000');
    expect(entry.text).toBe('cinematic shark portrait');
  });

  it('keeps multiple reverse prompt results ordered newest first', () => {
    const older: StoredReverseResult = {
      slot: 'history:1',
      text: 'older',
      model: 'helper',
      mode: 'replicate',
      timestamp: 1,
    };
    const newer: StoredReverseResult = {
      slot: 'history:2',
      text: 'newer',
      model: 'helper',
      mode: 'replicate',
      timestamp: 2,
    };

    expect(mergeReverseHistory([older], newer, 8).map(item => item.text)).toEqual(['newer', 'older']);
  });
});
