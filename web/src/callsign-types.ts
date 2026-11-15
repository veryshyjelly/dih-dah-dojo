import type { Activity } from './language-store';

export type CallsignFamily = 'short' | 'international' | 'long' | 'portable' | 'mixed';
export type CallsignMode =
  'call' | 'recovery' | 'qso' | 'contest-serial' | 'contest-zone' | 'pileup';
export type CallsignCondition = 'clean' | 'noise' | 'fading' | 'pileup';
export type CallsignItem = {
  id: string;
  text: string;
  audio_text: string;
  version: 1;
  corpus: 'dojo-callsigns';
  corpus_version: 1;
  family: CallsignFamily;
  mode: CallsignMode;
  condition: CallsignCondition;
  parts: { kind: string; label: string; text: string; start: number; end: number }[];
  own_call: string | null;
  exchange: { kind: 'serial' | 'zone'; label: string; text: string; report: string } | null;
  interferer: string | null;
};
export type CallsignCatalog = {
  version: 1;
  corpus: 'dojo-callsigns';
  corpus_version: 1;
  provenance: string;
  families: { id: CallsignFamily; label: string; description: string }[];
  modes: { id: CallsignMode; label: string; description: string }[];
  conditions: { id: CallsignCondition; label: string; description: string }[];
  references: CallsignItem[];
};
export type CallsignActivity = Omit<Activity, 'kind'> & {
  kind: 'callsign';
  trial_id: string;
  revision: number;
  latency_ms: number | null;
  speed_mode: 'fixed' | 'adaptive';
  exchange_answer: string | null;
  exchange_attempts: string[];
};
export type CallsignOutcome = {
  eligible: boolean;
  correct: boolean | null;
  attempt_accuracy: number | null;
  final_accuracy: number | null;
  first_exact: boolean | null;
  final_exact: boolean | null;
  expected: string;
  item: CallsignItem;
  corpus: 'dojo-callsigns';
  corpus_version: 1;
  family: CallsignFamily;
  mode: CallsignMode;
  condition: CallsignCondition;
  first_answer: string | null;
  parts: { name: string; expected: string; first_errors: number; final_errors: number }[];
  exchange_correct: boolean | null;
  exchange_final_correct: boolean | null;
};
