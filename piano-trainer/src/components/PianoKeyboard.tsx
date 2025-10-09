import React, { useMemo } from 'react';
import { midiToNoteName } from '../utils/noteUtils';
import './PianoKeyboard.css';

interface PianoKeyboardProps {
  highlightedNotes: number[]; // MIDI note numbers to highlight
  onClose: () => void;
}

export const PianoKeyboard: React.FC<PianoKeyboardProps> = ({ highlightedNotes, onClose }) => {
  // 88 keys: A0 (MIDI 21) to C8 (MIDI 108)
  const startNote = 21; // A0
  const endNote = 108; // C8

  const isBlackKey = (midiNote: number): boolean => {
    const note = midiNote % 12;
    return [1, 3, 6, 8, 10].includes(note); // C#, D#, F#, G#, A#
  };
  const { whiteKeys, blackKeys } = useMemo(() => {
    const white: React.ReactElement[] = [];
    const black: React.ReactElement[] = [];
    let whiteKeyIndex = 0;
    const highlightedSet = new Set(highlightedNotes);

    for (let midiNote = startNote; midiNote <= endNote; midiNote += 1) {
      const highlighted = highlightedSet.has(midiNote);
      const noteName = midiToNoteName(midiNote);

      if (!isBlackKey(midiNote)) {
        white.push(
          <div
            key={`white-${midiNote}`}
            className={`piano-key white-key ${highlighted ? 'highlighted' : ''}`}
            title={noteName}
            data-midi={midiNote}
          >
            {highlighted && <span className="note-label">{noteName}</span>}
          </div>
        );
        whiteKeyIndex += 1;
      } else {
        const leftPosition = whiteKeyIndex * 32 - 10; // Align black keys relative to current white keys

        black.push(
          <div
            key={`black-${midiNote}`}
            className={`piano-key black-key ${highlighted ? 'highlighted' : ''}`}
            style={{ left: `${leftPosition}px` }}
            title={noteName}
            data-midi={midiNote}
          >
            {highlighted && <span className="note-label">{noteName}</span>}
          </div>
        );
      }
    }

    return { whiteKeys: white, blackKeys: black };
  }, [highlightedNotes]);

  return (
    <div className="piano-keyboard-overlay">
      <div className="piano-keyboard-container">
        <div className="piano-keyboard-header">
          <h3>Play these notes:</h3>
          <button className="close-button" onClick={onClose}>X</button>
        </div>
        <div className="piano-keyboard">
          <div className="white-keys">
            {whiteKeys}
          </div>
          <div className="black-keys">
            {blackKeys}
          </div>
        </div>
        <div className="piano-keyboard-footer">
          <p>Highlighted keys show the notes you need to play</p>
        </div>
      </div>
    </div>
  );
};


