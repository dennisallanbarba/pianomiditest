export const NOTE_TIME_TOLERANCE = 0.03;

export const timesAreClose = (a: number, b: number, tolerance: number = NOTE_TIME_TOLERANCE): boolean => {
  return Math.abs(a - b) <= tolerance;
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_INDEX: Record<string, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};
const NOTE_NAME_REGEX = /^([A-G])(#?)(-?\d+)$/;

export const midiToNoteName = (midi: number): string => {
  const normalized = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const noteName = NOTE_NAMES[normalized] ?? 'C';
  return `${noteName}${octave}`;
};

export const midiToDiatonicNumber = (midi: number): number => {
  const name = midiToNoteName(midi);
  const match = name.match(NOTE_NAME_REGEX);
  if (!match) {
    return 0;
  }

  const letter = match[1] as typeof NOTE_LETTERS[number];
  const octave = parseInt(match[3], 10);
  const letterIndex = LETTER_INDEX[letter] ?? 0;
  return octave * NOTE_LETTERS.length + letterIndex;
};

/**
 * Convert duration in seconds to VexFlow duration string
 * Based on tempo (bpm) and time signature
 */
export const durationToVexFlowType = (
  durationSeconds: number,
  bpm: number = 120
): string => {
  // Calculate quarter note duration in seconds
  const quarterNoteDuration = 60 / bpm;

  // Calculate ratio to quarter note
  const ratio = durationSeconds / quarterNoteDuration;

  // Map to closest VexFlow duration
  if (ratio >= 3.5) return 'w'; // whole note (4 beats)
  if (ratio >= 1.75) return 'h'; // half note (2 beats)
  if (ratio >= 0.875) return 'q'; // quarter note (1 beat)
  if (ratio >= 0.4375) return '8'; // eighth note (0.5 beats)
  if (ratio >= 0.21875) return '16'; // sixteenth note (0.25 beats)
  return '32'; // thirty-second note
};

/**
 * Calculate measure boundaries based on time signature
 */
export const calculateMeasures = (
  totalDuration: number,
  timeSignature: number[] = [4, 4],
  bpm: number = 120
): number[] => {
  const [beatsPerMeasure, beatUnit] = timeSignature;

  // Calculate measure duration in seconds
  const quarterNoteDuration = 60 / bpm;
  const beatDuration = quarterNoteDuration * (4 / beatUnit);
  const measureDuration = beatDuration * beatsPerMeasure;

  // Calculate measure positions
  const measures: number[] = [0]; // Start at 0
  let currentTime = 0;

  while (currentTime + measureDuration < totalDuration) {
    currentTime += measureDuration;
    measures.push(currentTime);
  }

  return measures;
};
