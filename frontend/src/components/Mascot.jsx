export default function Mascot({ size = 40, mood = "happy", className = "logo" }) {
  const eyeStyle = mood === "thinking" ? { transform: "translateY(3px)" } : {};

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Scribe's sleeves and robe */}
      <path d="M38 77C28 78 22 85 19 94l9 6 18-13" fill="#38445B" stroke="#20283A" strokeWidth="3" strokeLinejoin="round" />
      <path d="M82 77c10 1 17 7 21 16l-8 7-18-13" fill="#38445B" stroke="#20283A" strokeWidth="3" strokeLinejoin="round" />
      <path d="M37 73c7-5 15-8 23-8s17 3 23 8l10 39c-20 7-47 7-67 0l11-39Z" fill="#242A40" stroke="#20283A" strokeWidth="3" strokeLinejoin="round" />

      {/* Polished robot head, rose-gold ears and illuminated face */}
      <rect x="16" y="43" width="13" height="18" rx="6.5" fill="#E7B48A" stroke="#20283A" strokeWidth="3" />
      <rect x="91" y="43" width="13" height="18" rx="6.5" fill="#E7B48A" stroke="#20283A" strokeWidth="3" />
      <rect x="24" y="27" width="72" height="49" rx="16" fill="#FFF9F3" stroke="#20283A" strokeWidth="3" />
      <rect x="32" y="35" width="56" height="33" rx="11" fill="#D4F5EF" />
      <circle cx="45" cy="51" r="7" fill="white" />
      <circle cx="75" cy="51" r="7" fill="white" />
      <g className="mascot-eyes" style={eyeStyle}>
        <circle cx="45" cy="51" r="4" fill="#263244" />
        <circle cx="75" cy="51" r="4" fill="#263244" />
        <circle cx="46" cy="49.5" r="1.3" fill="#FFFFFF" />
        <circle cx="76" cy="49.5" r="1.3" fill="#FFFFFF" />
      </g>
      <ellipse cx="37" cy="59" rx="4" ry="2" fill="#F2A3AA" opacity="0.7" />
      <ellipse cx="83" cy="59" rx="4" ry="2" fill="#F2A3AA" opacity="0.7" />
      <path d="M53 62c4 3 10 3 14 0" stroke="#263244" strokeWidth="2.5" strokeLinecap="round" />

      {/* Legal-scribe collar, tie and scales-of-justice badge */}
      <path d="m40 76 20 16-9 8-15-18 4-6Z" fill="#FFF9F3" stroke="#20283A" strokeWidth="2" strokeLinejoin="round" />
      <path d="m80 76-20 16 9 8 15-18-4-6Z" fill="#FFF9F3" stroke="#20283A" strokeWidth="2" strokeLinejoin="round" />
      <path d="M57 91h6l5 11-8 7-8-7 5-11Z" fill="#B92F49" />
      <g stroke="#E7BD65" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M79 96v9m-6-7h12m-10 0-3 5h6l-3-5Zm8 0-3 5h6l-3-5ZM75 106h8" />
      </g>
      <path d="M41 111h32" stroke="#E7B48A" strokeWidth="2" strokeLinecap="round" opacity="0.65" />

      {/* Red rose worn above the scribe's head */}
      <path d="M60 30c0-5-1-8 0-12" stroke="#26734D" strokeWidth="3" strokeLinecap="round" />
      <path d="M59 25c-7-6-11-5-13-2 4 5 8 7 14 5m1-3c6-7 11-6 13-3-4 5-8 7-14 5" fill="#38865B" stroke="#26734D" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M53 15c-3-5 2-9 7-6 3-6 10-3 9 2 6 1 7 8 1 10-2 6-9 7-13 2-6 2-10-4-6-8-2 0-2 0 2 0Z" fill="#D52E4B" stroke="#92233A" strokeWidth="2" strokeLinejoin="round" />
      <path d="M58 14c1-3 5-3 6 0 2-2 5 0 4 3-1 3-5 4-8 2-3 0-4-3-2-5Z" fill="#F36A78" />

      {/* A second rose held in the robot's hand */}
      <path d="M102 94c1-9 3-16 5-24" stroke="#26734D" strokeWidth="3" strokeLinecap="round" />
      <path d="M104 83c-5-5-9-4-10-1 3 4 6 5 11 4m2-6c5-5 9-4 10-1-3 4-6 5-11 4" fill="#38865B" stroke="#26734D" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M101 66c-2-4 2-7 5-5 2-5 7-3 7 1 5 1 5 6 1 8-1 4-7 5-9 2-5 1-7-3-4-6Z" fill="#D52E4B" stroke="#92233A" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M104 66c1-2 4-2 5 0 2-1 4 1 3 3-1 2-4 3-6 1-2 0-3-2-2-4Z" fill="#F36A78" />
      <circle cx="102" cy="94" r="5" fill="#FFF9F3" stroke="#20283A" strokeWidth="2" />
    </svg>
  );
}
