'use client';

import { useState } from 'react';

export function StarterGame() {
  const [score, setScore] = useState(0);
  const [playing, setPlaying] = useState(false);

  function start() {
    setScore(0);
    setPlaying(true);
  }

  return (
    <section className="game-stage" aria-label="AILO starter game">
      <div className="score-row">
        <span>Score</span>
        <strong>{score}</strong>
      </div>

      <div className="play-area">
        {playing ? (
          <button
            className="target"
            type="button"
            onClick={() => setScore((value) => value + 1)}
          >
            Tap
          </button>
        ) : (
          <button className="start-button" type="button" onClick={start}>
            Start starter game
          </button>
        )}
      </div>

      {playing && (
        <button className="reset-button" type="button" onClick={start}>
          Reset
        </button>
      )}
    </section>
  );
}
