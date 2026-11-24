import { useEffect, useId, useRef } from 'react';
import type { ProviderErrorCode } from '../../core/result';
import { TrialState } from '../../engine/machine';
import { useGame, useTrial } from '../hooks/game';

const COPY: Readonly<Record<ProviderErrorCode, string>> = {
  NETWORK: 'The courier never reached the court.',
  TIMEOUT: 'The court is slow to answer.',
  INSUFFICIENT_FUNDS: 'The treasury is too thin for this stake.',
  VALIDATION: "The court's ruling failed the scribe's check.",
  ROUND_NOT_FOUND: 'The court has no record of this trial.',
  SERVER: 'Disorder at the court.',
};

/** A sealed letter from the court. The primary action sits on the right. */
export function ErrorLetter() {
  const { controller } = useGame();
  const ctx = useTrial();
  const id = useId();
  const primary = useRef<HTMLButtonElement>(null);
  const err = ctx.error;
  const open = ctx.state === TrialState.ERROR_RECOVERABLE && err !== null;
  const mid = err?.phase === 'spin' || err?.phase === 'collect';
  useEffect(() => {
    if (open) primary.current?.focus();
  }, [open]);
  if (!open || !err) return null;
  return (
    <div className="letter-backdrop">
      <div className="letter" role="alertdialog" aria-modal="true" aria-labelledby={id} aria-describedby={`${id}-d`}>
        <span className="letter__seal" aria-hidden="true" />
        <div className="letter__code">
          {err.code} · during {err.phase}
        </div>
        <h2 id={id} className="letter__title">
          {mid ? 'Hold, good alchemist' : 'The trial was not begun'}
        </h2>
        <p id={`${id}-d`} className="letter__body">
          {COPY[err.code]}{' '}
          {mid
            ? 'Your trial is safe with the court. Sending the same request again can never count twice.'
            : err.phase === 'open'
              ? 'Your stake has been returned to the treasury.'
              : ''}
        </p>
        <p className="letter__detail">{err.message}</p>
        <div className="letter__actions">
          {mid ? (
            <button ref={primary} type="button" className="btn btn--primary" onClick={() => controller.retry()}>
              Send again
            </button>
          ) : (
            <button ref={primary} type="button" className="btn btn--primary" onClick={() => controller.dismissError()}>
              Return to the hall
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
