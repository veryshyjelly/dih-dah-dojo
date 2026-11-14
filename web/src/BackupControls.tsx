import { useState } from 'react';
import { Download, Upload, Database, X } from 'lucide-react';
import type { EngineClient } from './engine-client';
import { API } from './api';
import { LanguageStore } from './language-store';
import { MAX_BACKUP, parseBackup } from './backup-format';
type AccountPreview = {
  epoch: string;
  baseline: string;
  digest: string;
  profiles: number;
  blocks: number;
  language: number;
  legacy: boolean;
};
export function BackupControls({
  engine,
  owner,
  onRestored,
}: {
  engine: EngineClient;
  owner: string;
  onRestored: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<{
      name: string;
      bytes: Uint8Array;
      account?: AccountPreview;
      language?: Awaited<ReturnType<LanguageStore['previewImport']>>;
      store?: LanguageStore;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [message, setMessage] = useState('');
  async function call(path: string, bytes: Uint8Array) {
    const response = await fetch(API + path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(bytes),
    });
    const result = await response
      .json()
      .catch(() => ({ error: 'Backup service did not respond. Please try again.' }));
    if (!response.ok || result.error) throw new Error(result.error || 'Could not restore backup.');
    return result;
  }
  async function choose(file: File | undefined) {
    if (!file) return;
    setSelection(null);
    setConfirmation('');
    setMessage('');
    setBusy(true);
    try {
      if (file.size > MAX_BACKUP) throw new Error('Choose a Dojo backup under 32 MiB.');
      const bytes = new Uint8Array(await file.arrayBuffer()),
        parsed = await parseBackup(bytes);
      if (parsed.kind === 'account') {
        if (owner === 'guest') throw new Error('Sign in before restoring a full account backup.');
        const account = await call('/api/account/import/preview', bytes);
        setSelection({ name: file.name, bytes, account });
      } else {
        const store = new LanguageStore(owner, engine),
          language = await store.previewImport(bytes);
        setSelection({ name: file.name, bytes, language, store });
      }
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!selection) return;
    setBusy(true);
    setMessage('');
    try {
      if (selection.account) {
        if (confirmation !== 'RESTORE') return;
        const query = new URLSearchParams({
          ...selection.account,
          confirmation: 'RESTORE',
        } as unknown as Record<string, string>);
        await call('/api/account/import?' + query, selection.bytes);
        await onRestored();
        setMessage('Your saved account progress has been restored.');
      } else {
        const n = await selection.store!.importPreview(selection.language!);
        setMessage(`${n} word/story records imported. ${selection.store!.status}.`);
      }
      setSelection(null);
      setConfirmation('');
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(API + '/api/account/export', { credentials: 'include' });
      if (!response.ok) throw new Error('Could not export your account.');
      save(await response.blob(), 'dih-dah-dojo.cwweb');
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  function save(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="backup-workspace" aria-labelledby="backup-title">
      <div className="tool-heading">
        <span className="tool-icon">
          <Database size={24} />
        </span>
        <div>
          <h2 id="backup-title">Your progress, backed up.</h2>
          <p>Take a copy with you, or bring a saved one back.</p>
        </div>
      </div>
      <div className={`backup-options ${owner === 'guest' ? 'guest-backup-options' : ''}`}>
        {owner !== 'guest' && (
          <article>
            <h3>Account backup</h3>
            <p>
              Training state, keyboard and touch profiles, practice history, words and story
              bookmarks.
            </p>
            <button className="setting-link" disabled={busy} onClick={() => void download()}>
              <Download size={17} />
              Export my history
            </button>
          </article>
        )}
        <article>
          <h3>Browser word &amp; story backup</h3>
          <p>Includes activity on this browser, including anything still waiting to sync.</p>
          <button
            className="setting-link"
            disabled={busy}
            onClick={() => {
              setMessage('');
              void new LanguageStore(owner, engine)
                .export()
                .then((bytes) => save(new Blob([new Uint8Array(bytes)]), 'dojo-language.bin'))
                .catch((e) => setMessage(String(e)));
            }}
          >
            <Download size={17} />
            Export this browser's activity
          </button>
        </article>
        <article>
          <h3>Import a saved backup</h3>
          <p>
            Choose a .cwweb account backup or .bin word/story export. Files are checked before
            anything changes. Up to 32 MiB.
          </p>
          <label className="btn backup-file">
            <Upload size={17} />
            Choose backup
            <input
              aria-label="Import backup file"
              type="file"
              accept=".cwweb,.bin,application/octet-stream"
              disabled={busy}
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </article>
      </div>
      {busy && <p role="status">Checking or saving your backup…</p>}
      {message && <p role="status">{message}</p>}
      {selection && (
        <section className="backup-preview" aria-label="Backup preview">
          <h3>{selection.name}</h3>
          <p>
            Destination:{' '}
            {owner === 'guest' ? 'this browser’s guest activity' : 'your signed-in account'}.
          </p>
          {selection.account ? (
            <>
              <p>
                {selection.account.profiles} input profiles · {selection.account.blocks} practice
                blocks · {selection.account.language} word/story records
              </p>
              <p>
                This replaces your current account progress, including saved speeds and bookmarks.
                Export a copy above if you want to keep the current state.
              </p>
              {selection.account.legacy && (
                <p className="backup-warning">
                  Older backup: training state is restored, but history missing acceptance metadata
                  is retained as extra/imported practice rather than qualifying evidence.
                </p>
              )}
              <label>
                Type RESTORE to replace current progress
                <input
                  aria-label="Confirm restoring account backup"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </>
          ) : (
            <p>
              {selection.language!.packets.size} new records · {selection.language!.duplicates}{' '}
              duplicates skipped. Existing records are kept.
            </p>
          )}
          <div className="button-row">
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setSelection(null);
                setConfirmation('');
              }}
            >
              <X size={16} />
              Cancel import
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || (!!selection.account && confirmation !== 'RESTORE')}
              onClick={() => void restore()}
            >
              {selection.account ? 'Restore saved progress' : 'Import activity'}
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
