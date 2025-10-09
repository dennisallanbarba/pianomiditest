export interface MIDINote {
  midi: number; // MIDI note number (0-127)
  time: number; // Time in seconds
  duration: number; // Duration in seconds
  velocity: number; // Velocity (0-127)
  name: string; // Note name (e.g., "C4")
}

export interface MIDITrack {
  name: string;
  notes: MIDINote[];
  instrument?: string;
}

export interface ParsedMIDI {
  name: string;
  tracks: MIDITrack[];
  duration: number;
  header: {
    ppq: number;
    tempos: { bpm: number; ticks: number }[];
    timeSignatures: { timeSignature: number[]; ticks: number }[];
  };
}

export interface MIDIMessage {
  status: number;
  data1: number;
  data2: number;
  note: number;
  velocity: number;
}

export const PIANO_KEYDOWN = 144;
export const PIANO_KEYUP = 128;

export const OCTAVE_KEY_COUNT = 12;

export const pianoKeyMaps = [
  { name: 'C', note: 0 },
  { name: 'C#', note: 1 },
  { name: 'D', note: 2 },
  { name: 'D#', note: 3 },
  { name: 'E', note: 4 },
  { name: 'F', note: 5 },
  { name: 'F#', note: 6 },
  { name: 'G', note: 7 },
  { name: 'G#', note: 8 },
  { name: 'A', note: 9 },
  { name: 'A#', note: 10 },
  { name: 'B', note: 11 },
];
