export const SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,?/=+';
export type InputProfile = 'keyboard' | 'touch';
export type User = { id: string; name: string; email: string; image?: string };
export type Snapshot = {
  policy: string;
  introduced: string;
  entryComplete: boolean;
  recognitionC: number;
  copyingC: number;
  copyingE: number;
  timeout: number;
  sessions: number;
  volume: number;
  frequency: number;
  nextMode: 'recognition' | 'copying';
  milestones: string[];
  checkOffer: null | {
    c: number;
    e: number;
    material: string;
    repertoire: string;
  };
};
export type Summary = {
  attempt: number | null;
  finalAccuracy: number | null;
  targets: number;
  decision: string;
  pace: string;
  reason: string;
  gaps: number;
  completed: boolean;
  interrupted: string | null;
  kind: string;
  source: string;
  details: string[];
  qualifying: boolean;
};
export type Estimate = {
  mean: number;
  lower: number;
  upper: number;
  n: number;
  reliable: boolean;
  median: number | null;
  p90: number | null;
  latencyN: number;
  confusions: { response: string; count: number }[];
};
export type CharacterEstimate = {
  symbol: string;
  introduced: boolean;
  recognition: Estimate;
  copying: Estimate;
  due: boolean;
};
export type Graph = {
  title: string;
  primary_label: string;
  secondary_label: string | null;
  context: string;
  points: {
    primary: number;
    secondary: number | null;
    milestone: boolean;
    detail: string[];
  }[];
  trend: string | null;
};
export type Progress = {
  graphs: Graph[];
  characters: CharacterEstimate[];
  history: { kind: string; details: string[] }[];
};
export type AudioSpec = { text: string; c: number; e: number; rescue: boolean };
export type Plan = {
  mode: 'recognition' | 'copying';
  placement: boolean;
  count: number;
  c: number;
  e: number;
  timeout: number;
  reason: string;
  audio: AudioSpec | null;
};
export type Trial = {
  done?: boolean;
  teaching?: boolean;
  symbol?: string;
  pattern?: string;
  index?: number;
  count?: number;
  assisted?: boolean;
  audio?: AudioSpec;
  c?: number;
};
export type Feedback = {
  expected: string;
  pattern: string;
  correct: boolean;
  response: string | null;
  unknown: boolean;
  replay: boolean;
  assisted: boolean;
  interrupted: boolean;
  done: boolean;
};
export type BlockUpload = {
  epoch: string;
  id: string;
  profile: InputProfile;
  baseRevision: number;
  packet: Uint8Array;
};
export const percent = (value: number | null | undefined) =>
  value == null ? '—' : `${Math.round(value * 100)}%`;
