export default function Mascot({ size = 40, mood = "happy", className = "logo" }) {
  // Friendly little robot drawn in the brand gradient — pure SVG, no image assets.
  const eyeStyle = mood === "thinking" ? { transform: "translateY(3px)" } : {};
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pr-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fb7185" />
          <stop offset="0.55" stopColor="#a855f7" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="12" r="6" fill="url(#pr-grad)" />
      <rect x="46" y="17" width="8" height="12" rx="4" fill="url(#pr-grad)" />
      <rect x="12" y="27" width="76" height="60" rx="19" fill="url(#pr-grad)" />
      <circle cx="34" cy="53" r="10" fill="white" style={eyeStyle} />
      <circle cx="66" cy="53" r="10" fill="white" style={eyeStyle} />
      <circle cx="34" cy="53" r="4.5" fill="#1e1b2e" style={eyeStyle} />
      <circle cx="66" cy="53" r="4.5" fill="#1e1b2e" style={eyeStyle} />
      <rect x="37" y="70" width="26" height="6" rx="3" fill="white" opacity="0.85" />
      <rect x="86" y="45" width="7" height="16" rx="3.5" fill="url(#pr-grad)" />
      <rect x="7" y="45" width="7" height="16" rx="3.5" fill="url(#pr-grad)" />
    </svg>
  );
}
