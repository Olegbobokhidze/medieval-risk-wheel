import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconClose } from './icons';

export type DrawerProps = {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
  /** Footer actions, right-aligned, primary last. */
  readonly footer?: ReactNode;
  /** Modal drawers get a backdrop; the inspector is non-modal so you can keep playing. */
  readonly modal?: boolean;
  readonly className?: string;
};

export function Drawer({ open, title, onClose, children, footer, modal = true, className = '' }: DrawerProps) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    ref.current?.toggleAttribute('inert', !open);
  }, [open]);

  useEffect(() => {
    if (!open || !modal) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>('[data-autofocus], button')?.focus();
    return () => returnFocus.current?.focus?.();
  }, [open, modal]);

  return (
    <>
      {modal && <div className={`backdrop ${open ? 'is-open' : ''}`} onClick={onClose} aria-hidden="true" />}
      <aside
        ref={ref}
        className={`drawer ${open ? 'is-open' : ''} ${modal ? 'drawer--modal' : ''} ${className}`}
        role={modal ? 'dialog' : 'complementary'}
        aria-modal={modal || undefined}
        aria-labelledby={id}
        aria-hidden={!open}
      >
        <header className="drawer__header">
          <h2 id={id} className="drawer__title">
            {title}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </header>
        <div className="drawer__body">{children}</div>
        {footer && <footer className="drawer__footer">{footer}</footer>}
      </aside>
    </>
  );
}
