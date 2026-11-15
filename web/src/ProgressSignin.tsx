import { Cloud, ArrowUpRight } from 'lucide-react';
export function ProgressSignin({ onSignin }: { onSignin: () => void }) {
  return (
    <aside className="progress-signin" aria-label="Save progress with an account">
      <span className="tool-icon" aria-hidden="true">
        <Cloud size={23} />
      </span>
      <div>
        <h2>Make this progress yours.</h2>
        <p>Sign in to keep your practice and saved places across devices.</p>
        <small>
          Guest activity stays in this browser and isn’t automatically added to your account.
        </small>
      </div>
      <button className="btn" onClick={onSignin}>
        Sign in to sync progress <ArrowUpRight size={16} aria-hidden="true" />
      </button>
    </aside>
  );
}
