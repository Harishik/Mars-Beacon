// Mars BEACON wordmark: a haven point with return rings. Our own mark, no NASA insignia.
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="wordmark">
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10.5" fill="none" stroke="var(--home)" strokeOpacity="0.35" />
        <circle cx="12" cy="12" r="6.5" fill="none" stroke="var(--home)" strokeOpacity="0.7" />
        <circle cx="12" cy="12" r="2.6" fill="var(--home)" />
      </svg>
      <span className="wm-text">Mars <b>BEACON</b></span>
    </span>
  );
}
