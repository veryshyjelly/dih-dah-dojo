export function Privacy() {
  return (
    <section className="page privacy-page">
      <div className="page-heading">
        <span className="eyebrow">YOUR PRACTICE, YOUR DATA</span>
        <h1>
          A little clarity.
          <br />
          <em>A little peace of mind.</em>
        </h1>
        <p>Privacy information · updated November 14, 2026</p>
      </div>
      <article className="settings-card">
        <h2>Listening can stay on your device.</h2>
        <p>
          Public listening tools and the five-sound demo run in your browser. Dojo does not record
          your microphone or request microphone access. Custom text becomes account history only
          when you save a signed-in manual drill.
        </p>
        <p>
          Word and story activities, responses, reveals, replay use and story bookmarks are saved on
          this browser. Signed-in activity syncs to your account; guest activity stays on this
          device and is never automatically added to an account. These activities do not update
          adaptive training milestones.
        </p>
        <h2>What an account keeps</h2>
        <p>
          Sign-in uses your Google or GitHub account. The account service stores your provider
          identity, name, email, session information and provider tokens needed for authentication.
          It stores your practice content, responses, timings, settings and learning progress to
          provide training and sync. Keyboard and touch have separate learning profiles.
        </p>
        <h2>Where it lives</h2>
        <p>
          Cloudflare serves the website and routes HTTPS requests to the privately operated Dojo
          account service. The service stores account data in SQLite on the operator’s device.
          Google or GitHub handles its own sign-in consent. These providers and Cloudflare may
          process connection and security information under their own policies. Dojo includes no
          advertising or product analytics trackers.
        </p>
        <h2>Cookies and pending practice</h2>
        <p>
          Essential session cookies keep you signed in. The appearance toggle stores your light/dark
          preference in this browser’s local storage. If a result cannot sync, this browser retains
          an account-scoped copy in IndexedDB until it is acknowledged. Signing out preserves
          pending results for that same account; avoid leaving them on a shared browser. Clearing
          browser storage removes unsynced results.
        </p>
        <h2>Your choices</h2>
        <p>
          Settings offers history export, progress reset and account deletion. Reset keeps your
          account; deletion removes the account and its live practice data. Both require you to type
          DELETE. Pending copies in this browser are cleared after confirmation. Older copies from
          another browser cannot restore progress after an acknowledged reset.
        </p>
        <h2>Backups and questions</h2>
        <p>
          Daily private server backups are retained for up to 14 daily snapshots. Deletion does not
          erase a prior export or backup immediately. Operator-created off-device recovery copies
          may have a separate retention period. Contact the operator through the{' '}
          <a href="https://github.com/veryshyjelly" target="_blank" rel="noreferrer">
            veryshyjelly GitHub profile
          </a>{' '}
          with account or privacy questions; do not send passwords or provider secrets.
        </p>
      </article>
    </section>
  );
}
