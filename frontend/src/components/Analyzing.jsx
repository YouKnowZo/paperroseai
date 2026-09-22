import { useEffect, useState } from "react";
import Mascot from "./Mascot.jsx";

const STEPS = [
  "Reading the fine print…",
  "Spotting sneaky clauses…",
  "Checking what happens to your data…",
  "Weighing the legal traps…",
  "Grading the deal…",
];

export default function Analyzing({ level = 0 }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="analyzing">
      <Mascot size={88} mood="thinking" className="bot" />
      <h3>Scanning your document</h3>
      <p>{STEPS[step]}</p>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${level}%` }} />
      </div>
    </div>
  );
}
