// WebAutomate brand mark — inline SVG so it scales crisply and themes via props.
// Used on the splash loader, login footer, and anywhere the product is branded.
export function WebAutomateMark({ size = 28, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className}
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label="WebAutomate">
      <defs>
        <linearGradient id="wa-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e40af" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id="wa-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect x="36" y="36" width="440" height="440" rx="96" fill="url(#wa-bg)" />
      <g stroke="#ffffff" strokeOpacity="0.12" strokeWidth="5" fill="none" strokeLinecap="round">
        <path d="M90 150 H150 a16 16 0 0 1 16 16 V210" />
        <path d="M422 150 H362 a16 16 0 0 0 -16 16 V210" />
        <path d="M90 362 H150 a16 16 0 0 0 16 -16 V300" />
        <path d="M422 362 H362 a16 16 0 0 1 -16 -16 V300" />
      </g>
      <path d="M128 168 L186 344 L256 224 L326 344 L384 168"
        fill="none" stroke="#ffffff" strokeWidth="34"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="128" cy="168" r="26" fill="#ffffff" />
      <circle cx="384" cy="168" r="26" fill="#ffffff" />
      <circle cx="256" cy="224" r="22" fill="#ffffff" />
      <circle cx="186" cy="344" r="20" fill="#ffffff" />
      <circle cx="326" cy="344" r="20" fill="#ffffff" />
      <path d="M262 196 L242 232 L256 232 L250 262 L276 224 L260 224 Z" fill="url(#wa-spark)" />
    </svg>
  )
}

// Compact "powered by" lockup used in footers
export function PoweredByWebAutomate({ className = '' }) {
  return (
    <span className={`flex items-center gap-1.5 ${className}`}>
      <WebAutomateMark size={16} />
      <span className="font-semibold">webAutomate Nigeria</span>
    </span>
  )
}

export default WebAutomateMark
