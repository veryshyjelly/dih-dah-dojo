import { Headphones, Keyboard, Hand, Radio, Signal } from 'lucide-react';

export function HelpGuide({
  onClose,
  paused,
  summaryHeld,
}: {
  onClose: () => void;
  paused: boolean;
  summaryHeld: boolean;
}) {
  return (
    <>
      <div className="help-content">
        <p className="help-intro">Listen to the whole sound. Skip what you miss and rejoin.</p>
        <div className="help-layout">
          <section className="help-section" aria-labelledby="help-controls">
            <h3 id="help-controls">Keyboard controls</h3>
            <dl className="help-shortcuts">
              <div>
                <dt>
                  <kbd>F5</kbd>
                </dt>
                <dd>Pause / resume</dd>
              </div>
              <div>
                <dt>
                  <kbd>F6</kbd>
                </dt>
                <dd>
                  Replay recognition <small>Assisted</small>
                </dd>
              </div>
              <div>
                <dt>
                  <kbd>Tab</kbd>
                </dt>
                <dd>
                  I don’t know <small>Recognition only</small>
                </dd>
              </div>
              <div>
                <dt>
                  <kbd>Backspace</kbd>
                </dt>
                <dd>Edit the end of your copy</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>Finish practice</dd>
              </div>
            </dl>
            <p className="help-summary-keys">
              At a saved summary: <kbd>Space</kbd> holds or resumes the countdown. <kbd>Enter</kbd>{' '}
              continues.
            </p>
            <p>
              Words offers self-paced word drills. Stories plays one sentence at a time, with
              optional continuous listening or transcription. Callsigns trains complete station
              identities and exchanges. F5 pauses, F6 replays, and Esc finishes the activity. Replay
              and reveal are assisted practice.
            </p>
          </section>
          <section className="help-section help-practice" aria-label="Ways to practice">
            <article>
              <h3>
                <Headphones size={17} aria-hidden="true" /> Recognition
              </h3>
              <p>One character at a time. Give your first answer as soon as you recognize it.</p>
            </article>
            <article>
              <h3>
                <Radio size={17} aria-hidden="true" /> Callsigns
              </h3>
              <p>
                Listen to a whole call, type it, and press Enter. First attempts and repaired copies
                stay separate. Optional band conditions and exchanges have their own progress.
              </p>
            </article>
            <article>
              <h3>
                <Signal size={17} aria-hidden="true" /> Prosigns
              </h3>
              <p>
                A prosign joins its letters into one signal. Identify the sound, recall its meaning
                or choose it for a situation. Type the whole token and press Enter. Replays and
                reveals are assisted; your first answer stays in progress.
              </p>
            </article>
            <article>
              <h3>
                <Keyboard size={17} aria-hidden="true" /> Copying
              </h3>
              <p>Follow the stream and keep typing. Correctness waits until the block ends.</p>
            </article>
            <p className="help-phone">
              <Hand size={16} aria-hidden="true" />
              <span>
                On a phone, use the response keys for recognition and your keyboard for copying.
                Touch and physical-keyboard progress stay separate.
              </span>
            </p>
          </section>
        </div>
        <div className="help-details">
          <details>
            <summary>How progress is counted</summary>
            <p>
              Attempt accuracy keeps the original answers; final accuracy includes tail corrections.
              Replays are assisted. Latency includes typing. Introduced characters are not
              automatically mastered.
            </p>
          </details>
          <details>
            <summary>Why timing is estimated</summary>
            <p>
              The Rust engine schedules samples, but browser, headphone and input timing have not
              been physically verified. Dojo does not certify proficiency or learning effectiveness.
            </p>
          </details>
          <details>
            <summary>Your practice data</summary>
            <p>
              Signed-in practice syncs to your account. If sync fails, this browser keeps the block
              until it is acknowledged. Settings includes history export, progress reset and account
              deletion.
            </p>
          </details>
        </div>
      </div>
      <div className="help-footer">
        <span>
          {paused
            ? 'Practice stays paused until you resume.'
            : summaryHeld
              ? 'Your saved summary stays held.'
              : 'Esc closes this guide.'}
        </span>
        <button className="button" onClick={onClose}>
          Got it
        </button>
      </div>
    </>
  );
}
