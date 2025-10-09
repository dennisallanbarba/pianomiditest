import { Midi } from '@tonejs/midi';
import type { ParsedMIDI, MIDITrack, MIDINote } from '../types/midi';
import { midiToNoteName } from './noteUtils';

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
    },
  };
};

export const getClefForNote = (midiNote: number): 'treble' | 'bass' => {
  return midiNote >= 60 ? 'treble' : 'bass';
};
