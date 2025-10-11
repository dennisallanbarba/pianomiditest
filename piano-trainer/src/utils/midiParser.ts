import { Midi } from '@tonejs/midi';
import type { ParsedMIDI, MIDITrack, MIDINote } from '../types/midi';
import { midiToNoteName } from './noteUtils';

// Map MIDI key signature to key name (for major keys)
const MIDI_KEY_TO_NAME: Record<number, string> = {
  '-7': 'Cb',
  '-6': 'Gb',
  '-5': 'Db',
  '-4': 'Ab',
  '-3': 'Eb',
  '-2': 'Bb',
  '-1': 'F',
  '0': 'C',
  '1': 'G',
  '2': 'D',
  '3': 'A',
  '4': 'E',
  '5': 'B',
  '6': 'F#',
  '7': 'C#',
};

export const parseMIDIFile = async (file: File): Promise<ParsedMIDI> => {
  const arrayBuffer = await file.arrayBuffer();
  const midi = new Midi(arrayBuffer);

  const tracks: MIDITrack[] = midi.tracks.map((track, index) => {
    const notes: MIDINote[] = track.notes.map((note) => ({
      midi: note.midi,
      time: note.time,
      duration: note.duration,
      velocity: note.velocity,
      name: midiToNoteName(note.midi),
    }));

    return {
      name: track.name || `Track ${index + 1}`,
      notes,
      instrument: track.instrument?.name,
    };
  });

  // Extract key signatures from MIDI header
  const keySignatures: string[] = [];
  const rawKeySignatures = (midi.header as any).keySignatures;
  if (Array.isArray(rawKeySignatures) && rawKeySignatures.length > 0) {
    rawKeySignatures.forEach((ks: any) => {
      // MIDI key signatures have a 'key' property (number of sharps/flats)
      // Positive = sharps, Negative = flats
      // Scale: 0 = major, 1 = minor (we'll use major for now)
      if (typeof ks === 'object' && 'key' in ks) {
        const keyName = MIDI_KEY_TO_NAME[ks.key] || 'C';
        if (!keySignatures.includes(keyName)) {
          keySignatures.push(keyName);
        }
      }
    });
  }

  return {
    name: midi.name || file.name,
    tracks: tracks.filter((track) => track.notes.length > 0),
    duration: midi.duration,
    header: {
      ppq: midi.header.ppq,
      tempos: midi.header.tempos.map((t) => ({ bpm: t.bpm, ticks: t.ticks })),
      timeSignatures: midi.header.timeSignatures.map((ts) => ({
        timeSignature: ts.timeSignature,
        ticks: ts.ticks,
      })),
      keySignatures,
    },
  };
};

export const getClefForNote = (midiNote: number): 'treble' | 'bass' => {
  return midiNote >= 60 ? 'treble' : 'bass';
};
