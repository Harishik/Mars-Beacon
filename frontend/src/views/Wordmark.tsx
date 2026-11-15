// Mars BEACON mark: a beacon of light over the Martian ridgeline, inside a night-sky disc. Team artwork, redrawn
// as vector shapes (measured from the 1254 px source) so it stays crisp from favicon to hero size.
// Our own mark, no NASA insignia.

/** The disc mark on its own. `ring` adds a faint edge so the dark disc reads on dark backgrounds. */
export function BeaconMark({ size = 28, ring = true, title }: { size?: number; ring?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="94 94 1066 1066" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <defs>
        <clipPath id="bm-disc"><circle cx="627" cy="627" r="528" /></clipPath>
      </defs>
      <circle cx="627" cy="627" r="528" fill="#171e29" />
      <g clipPath="url(#bm-disc)">
        {/* Beam from the beacon down into the notch between the ridges */}
        <polygon points="627,377 520,920 734,920" fill="#9cc3e8" />
        {/* Ridgeline: two peaks with the notch where the beam lands */}
        <polygon points="-100,1132 443,682 627,862 811,682 1354,1146 1354,1300 -100,1300" fill="#b97353" />
      </g>
      <circle cx="627" cy="335" r="42" fill="#9cc3e8" />
      {ring && <circle cx="627" cy="627" r="524" fill="none" stroke="rgba(173, 201, 236, 0.28)" strokeWidth="8" />}
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark">
      <BeaconMark size={size} />
      <span className="wm-text">Mars <b>BEACON</b></span>
    </span>
  );
}
