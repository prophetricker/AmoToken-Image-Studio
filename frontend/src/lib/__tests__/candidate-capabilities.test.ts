import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANDIDATE_MODES_QUERY_PARAM,
  CANDIDATE_MODES_STORAGE_KEY,
  getCandidateModesPreference,
  isCandidateMode,
  isCandidateModesEnabled,
  resolveCandidateModesEnabled,
} from '@/lib/candidate-capabilities';

describe('candidate capability gray switch', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_NOVA_CANDIDATE_MODES;
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('publishes GIF and canvas by default', () => {
    expect(isCandidateModesEnabled()).toBe(true);
    expect(resolveCandidateModesEnabled()).toBe(true);
  });

  it('enables candidate modes when the build-time switch is set', () => {
    process.env.NEXT_PUBLIC_NOVA_CANDIDATE_MODES = '1';

    expect(isCandidateModesEnabled()).toBe(true);
    expect(resolveCandidateModesEnabled()).toBe(true);
  });

  it('persists a local gray-test opt-in from the URL query', () => {
    window.history.replaceState(null, '', `/?${CANDIDATE_MODES_QUERY_PARAM}=1`);

    expect(resolveCandidateModesEnabled()).toBe(true);
    expect(window.localStorage.getItem(CANDIDATE_MODES_STORAGE_KEY)).toBe('enabled');
  });

  it('persists a local gray-test opt-out from the URL query', () => {
    window.localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');
    window.history.replaceState(null, '', `/?${CANDIDATE_MODES_QUERY_PARAM}=0`);

    expect(resolveCandidateModesEnabled()).toBe(false);
    expect(window.localStorage.getItem(CANDIDATE_MODES_STORAGE_KEY)).toBe('disabled');
  });

  it('reuses the stored local gray-test preference when no query is present', () => {
    window.localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');

    expect(resolveCandidateModesEnabled()).toBe(true);
  });

  it('reuses the stored emergency opt-out when no query is present', () => {
    window.localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'disabled');

    expect(resolveCandidateModesEnabled()).toBe(false);
  });

  it('treats only gif and canvas as candidate tabs', () => {
    expect(isCandidateMode('gif')).toBe(true);
    expect(isCandidateMode('canvas')).toBe(true);
    expect(isCandidateMode('assets')).toBe(false);
  });

  it('returns the stored preference without forcing a default', () => {
    expect(getCandidateModesPreference()).toBeNull();

    window.localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, 'enabled');
    expect(getCandidateModesPreference()).toBe('enabled');
  });
});
