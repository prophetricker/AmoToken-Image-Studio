export type CandidateMode = 'gif' | 'canvas';
export type CandidateModesPreference = 'enabled' | 'disabled';

export const CANDIDATE_MODES_QUERY_PARAM = 'novaCandidateModes';
export const CANDIDATE_MODES_STORAGE_KEY = 'nova-candidate-modes';

function hasBuildTimeCandidateSwitch(): boolean {
  return process.env.NEXT_PUBLIC_NOVA_CANDIDATE_MODES !== '0';
}

export function isCandidateModesEnabled(): boolean {
  return hasBuildTimeCandidateSwitch();
}

export function isCandidateMode(value: string): value is CandidateMode {
  return value === 'gif' || value === 'canvas';
}

export function getCandidateModesPreference(): CandidateModesPreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(CANDIDATE_MODES_STORAGE_KEY);
    return value === 'enabled' || value === 'disabled' ? value : null;
  } catch {
    return null;
  }
}

function setCandidateModesPreference(preference: CandidateModesPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CANDIDATE_MODES_STORAGE_KEY, preference);
  } catch {
    // Ignore unavailable storage; the current URL still controls this render.
  }
}

function getCandidateModesQueryValue(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href).searchParams.get(CANDIDATE_MODES_QUERY_PARAM);
  } catch {
    return null;
  }
}

export function resolveCandidateModesEnabled(): boolean {
  const queryValue = getCandidateModesQueryValue();
  if (queryValue === '1' || queryValue === 'true' || queryValue === 'enabled') {
    setCandidateModesPreference('enabled');
    return true;
  }
  if (queryValue === '0' || queryValue === 'false' || queryValue === 'disabled') {
    setCandidateModesPreference('disabled');
    return false;
  }

  const preference = getCandidateModesPreference();
  if (preference) return preference === 'enabled';

  return hasBuildTimeCandidateSwitch();
}
