import { useEffect, useState } from 'react';
import './login-welcome.css';

/** A brief welcome after explicit sign-in; session restoration never mounts this screen. */
export function LoginWelcome({ ready, onComplete }: { ready: boolean; onComplete: () => void }) {
  const [reducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [elapsed, setElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setElapsed(true), reducedMotion ? 0 : 950);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (!elapsed || !ready) return;
    setLeaving(true);
    const timer = window.setTimeout(onComplete, reducedMotion ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [elapsed, ready, reducedMotion, onComplete]);

  return <div className={'login-welcome ' + (leaving ? 'is-leaving' : '')}>
    <div className="login-welcome-content" role="status" aria-live="polite" aria-label="Opening your Teleperformance travel workspace">
      <div className="login-welcome-emblem" aria-hidden="true"><span className="login-welcome-orbit"/><img src="/favicon.svg" alt="" width="92" height="92" fetchPriority="high"/></div>
      <div className="login-welcome-wordmark"><img src="/brand/teleperformance-wordmark.svg" alt="Teleperformance" width="168" height="36" fetchPriority="high"/><span>TRAVEL MANAGEMENT</span></div>
      <span className="login-welcome-rule" aria-hidden="true"/>
      <p className="login-welcome-tagline">Connected people. Exceptional journeys.</p>
      <p className="login-welcome-message">{ready ? 'Welcome to your travel workspace.' : 'Preparing your travel workspace…'}</p>
      <span className="login-welcome-progress" aria-hidden="true"><i/></span>
    </div>
    <span className="login-welcome-footer" aria-hidden="true">TELEPERFORMANCE · CORPORATE TRAVEL</span>
  </div>;
}
