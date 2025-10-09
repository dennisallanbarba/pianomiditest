import React from 'react';

interface ScoreDisplayProps {
  correct: number;
  incorrect: number;
  missed: number;
}

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ correct, incorrect, missed }) => {
  const total = correct + incorrect + missed;
  const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="score-display">
      <h3>Score</h3>
      <div className="score-stats">
        <div className="stat correct">
          <span className="label">Correct:</span>
          <span className="value">{correct}</span>
        </div>
        <div className="stat incorrect">
          <span className="label">Incorrect:</span>
          <span className="value">{incorrect}</span>
        </div>
        <div className="stat missed">
          <span className="label">Missed:</span>
          <span className="value">{missed}</span>
        </div>
        <div className="stat accuracy">
          <span className="label">Accuracy:</span>
          <span className="value">{accuracy}%</span>
        </div>
      </div>
    </div>
  );
};
