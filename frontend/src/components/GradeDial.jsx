import { useEffect, useState } from "react";

const LEVELS = {
  safe: { emoji: "🟢", label: "Safe" },
  moderate: { emoji: "🟡", label: "Moderate" },
  caution: { emoji: "🟠", label: "Caution" },
  dangerous: { emoji: "🔴", label: "High Risk" },
};

function colorFor(score) {
  if (score >= 75) return "#10b981";
  if (score >= 55) return "#f59e0b";
  if (score >= 35) return "#f97316";
  return "#ef4444";
}

export default function GradeDial({ result }) {
  const [shown, setShown] = useState(0);
  const { score, grade, safety_level, safety_headline, safety_blurb } = result;

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(t);
  }, [score]);

  const R = 86;
  const C = 2 * Math.PI * R;
  const color = colorFor(shown);
  const level = LEVELS[safety_level] || LEVELS.moderate;

  return (
    <div className="card grade-card">
      <div className="dial-wrap">
        <svg viewBox="0 0 200 200">
          <circle className="dial-track" cx="100" cy="100" r={R} fill="none" strokeWidth="13" />
          <circle
            className="dial-fill"
            cx="100"
            cy="100"
            r={R}
            fill="none"
            strokeWidth="13"
            strokeLinecap="round"
            stroke={color}
            strokeDasharray={C}
            strokeDashoffset={C - (C * shown) / 100}
          />
        </svg>
        <div className="dial-center">
          <div className="dial-grade" style={{ color }}>{grade}</div>
          <div className="dial-score">{score}/100 fairness</div>
        </div>
      </div>
      <div className={`safety-pill level-${safety_level}`}>
        {level.emoji} {level.label}
      </div>
      <div className="grade-headline">{safety_headline}</div>
      <p className="grade-blurb">{safety_blurb}</p>
    </div>
  );
}
