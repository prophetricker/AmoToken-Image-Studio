export type CandidateMode = 'gif' | 'canvas';

export function isCandidateModesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NOVA_CANDIDATE_MODES === '1';
}

export function isCandidateMode(value: string): value is CandidateMode {
  return value === 'gif' || value === 'canvas';
}
