import React from 'react';

interface ScoreDisplayProps {
  correct: number;
  incorrect: number;
  missed: number;
}

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({ correct, incorrect, missed }) => {
  return (
    <div className="score-display">
      <div className="score-display__item">
        <span className="score-display__label">Correct</span>
        <span className="score-display__value">{correct}</span>
      </div>
      <div className="score-display__divider" aria-hidden="true" />
      <div className="score-display__item">
        <span className="score-display__label">Incorrect</span>
        <span className="score-display__value">{incorrect}</span>
      </div>
      <div className="score-display__divider" aria-hidden="true" />
      <div className="score-display__item">
        <span className="score-display__label">Missed</span>
        <span className="score-display__value">{missed}</span>
      </div>
    </div>
  );
};
