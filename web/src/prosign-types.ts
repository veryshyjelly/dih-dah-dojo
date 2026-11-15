import type { Activity } from './language-store';

export type ProsignMode = 'recognition' | 'meaning' | 'context';
export type ProsignSignal = {
  id: string;
  token: string;
  pattern: string;
  meaning: string;
  meaning_id: string;
  description: string;
  convention: 'standard' | 'amateur-variant';
  aliases: string[];
  source: string;
};
export type ProsignCatalog = {
  version: 1;
  corpus: 'dojo-prosigns';
  corpus_version: 1;
  provenance: string;
  signals: ProsignSignal[];
  modes: { id: ProsignMode; label: string; description: string }[];
};
export type ProsignItem = {
  id: string;
  version: 1;
  corpus: 'dojo-prosigns';
  corpus_version: 1;
  mode: ProsignMode;
  selection: string[];
  signal: string;
  token: string;
  audio_text: string;
  prompt: string;
  expected: string;
  choices: { id: string; label: string }[];
};
export type ProsignActivity = Omit<Activity, 'kind'> & {
  kind: 'prosign';
  trial_id: string;
  revision: number;
  latency_ms: number | null;
};
export type ProsignOutcome = {
  eligible: boolean;
  correct: boolean | null;
  attempt_accuracy: number | null;
  final_accuracy: number | null;
  first_exact: boolean | null;
  final_exact: boolean | null;
  expected: string;
  first_answer: string | null;
  item: ProsignItem;
  corpus: 'dojo-prosigns';
  corpus_version: 1;
  mode: ProsignMode;
  selection: string[];
  signal: string;
  accepted: string[];
};
