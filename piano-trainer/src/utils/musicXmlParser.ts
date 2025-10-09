import { midiToNoteName } from './noteUtils';
import JSZip from 'jszip';
import type { ParsedMIDI, MIDITrack, MIDINote } from '../types/midi';

const STEP_TO_SEMITONE: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const DEFAULT_TEMPO = 120;
const DEFAULT_DIVISIONS = 480;
const DEFAULT_VELOCITY = 100;

interface VoiceState {
  currentBeats: number;
  lastStartBeats: number;
}

interface TrackState {
  track: MIDITrack;
  voiceState: VoiceState;
}

const createParser = () => new DOMParser();

const normaliseTrackName = (partName: string, voiceId: string) => {
  if (voiceId === '1') {
    return partName;
  }
  return `${partName} - Voice ${voiceId}`;
};

const getPartNames = (doc: Document): Map<string, string> => {
  const map = new Map<string, string>();
  const scoreParts = Array.from(doc.getElementsByTagName('score-part'));
  scoreParts.forEach((part, index) => {
    const id = part.getAttribute('id') || `part-${index + 1}`;
    const partName = part.querySelector('part-name')?.textContent?.trim();
    map.set(id, partName && partName.length > 0 ? partName : `Part ${index + 1}`);
  });
  return map;
};

const pitchToMidi = (noteElement: Element): number | null => {
  const pitch = noteElement.querySelector('pitch');
  if (!pitch) {
    return null;
  }

  const step = pitch.querySelector('step')?.textContent?.trim();
  const octaveText = pitch.querySelector('octave')?.textContent?.trim();
  if (!step || !octaveText) {
    return null;
  }

  const alterText = pitch.querySelector('alter')?.textContent?.trim();
  const alter = alterText ? parseInt(alterText, 10) : 0;
  const semitone = STEP_TO_SEMITONE[step];
  if (typeof semitone !== 'number') {
    return null;
  }

  const octave = parseInt(octaveText, 10);
  return (octave + 1) * 12 + semitone + alter;
};

const extractTempo = (direction: Element): number | null => {
  const sound = direction.querySelector('sound[tempo]');
  if (sound) {
    const tempoAttr = sound.getAttribute('tempo');
    if (tempoAttr) {
      const parsed = parseFloat(tempoAttr);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  const perMinute = direction.querySelector('per-minute')?.textContent?.trim();
  if (perMinute) {
    const parsed = parseFloat(perMinute);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
};

const extractTimeSignature = (attributes: Element): [number, number] | null => {
  const beats = attributes.querySelector('time > beats')?.textContent?.trim();
  const beatType = attributes.querySelector('time > beat-type')?.textContent?.trim();
  if (beats && beatType) {
    const beatsNum = parseInt(beats, 10);
    const beatTypeNum = parseInt(beatType, 10);
    if (!Number.isNaN(beatsNum) && !Number.isNaN(beatTypeNum)) {
      return [beatsNum, beatTypeNum];
    }
  }
  return null;
};

const parseMusicXMLContent = (xmlContent: string, sourceName: string): ParsedMIDI => {
  const parser = createParser();
  const doc = parser.parseFromString(xmlContent, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Unable to parse MusicXML file');
  }

  const partNameMap = getPartNames(doc);
  const parts = Array.from(doc.getElementsByTagName('part'));

  const trackStates = new Map<string, TrackState>();
  const timeSignatureSet = new Map<string, { timeSignature: number[]; ticks: number }>();
  const tempoEvents: { bpm: number; ticks: number }[] = [];

  let tempoBPM = DEFAULT_TEMPO;
  let secondsPerBeat = 60 / tempoBPM;
  let maxEndTime = 0;

  parts.forEach((part, partIndex) => {
    const partId = part.getAttribute('id') || `part-${partIndex + 1}`;
    const partName = partNameMap.get(partId) || `Part ${partIndex + 1}`;

    let divisions = DEFAULT_DIVISIONS;

    const measures = Array.from(part.getElementsByTagName('measure'));

    measures.forEach((measure) => {
      const measureChildren = Array.from(measure.children) as Element[];

      measureChildren.forEach((child) => {
        const tag = child.tagName.toLowerCase();

        if (tag === 'attributes') {
          const divisionsText = child.querySelector('divisions')?.textContent?.trim();
          if (divisionsText) {
            const parsed = parseInt(divisionsText, 10);
            if (!Number.isNaN(parsed) && parsed > 0) {
              divisions = parsed;
            }
          }

          const timeSig = extractTimeSignature(child);
          if (timeSig) {
            const key = `${timeSig[0]}/${timeSig[1]}`;
            if (!timeSignatureSet.has(key)) {
              timeSignatureSet.set(key, {
                timeSignature: timeSig,
                ticks: 0,
              });
            }
          }
          return;
        }

        if (tag === 'direction') {
          const tempoCandidate = extractTempo(child);
          if (tempoCandidate && tempoCandidate > 0) {
            tempoBPM = tempoCandidate;
            secondsPerBeat = 60 / tempoBPM;
            tempoEvents.push({ bpm: tempoBPM, ticks: 0 });
          }
          return;
        }

        if (tag !== 'note') {
          return;
        }

        const isRest = child.querySelector('rest') !== null;
        const isGrace = child.querySelector('grace') !== null;
        if (isGrace) {
          return;
        }

        const voice = child.querySelector('voice')?.textContent?.trim() || '1';
        const trackKey = `${partId}:${voice}`;

        if (!trackStates.has(trackKey)) {
          const track: MIDITrack = {
            name: normaliseTrackName(partName, voice),
            notes: [],
          };
          trackStates.set(trackKey, {
            track,
            voiceState: {
              currentBeats: 0,
              lastStartBeats: 0,
            },
          });
        }

        const trackState = trackStates.get(trackKey)!;
        const state = trackState.voiceState;

        const durationText = child.querySelector('duration')?.textContent?.trim();
        const durationDivisions = durationText ? parseFloat(durationText) : 0;
        const durationBeats = divisions > 0 ? durationDivisions / divisions : 0;

        const hasChordTag = child.querySelector('chord') !== null;
        const startBeats = hasChordTag ? state.lastStartBeats : state.currentBeats;

        if (!hasChordTag) {
          state.lastStartBeats = startBeats;
        }

        if (!isRest) {
          const midiValue = pitchToMidi(child);
          if (typeof midiValue === 'number') {
            const timeSeconds = startBeats * secondsPerBeat;
            const durationSeconds = durationBeats * secondsPerBeat;

            const note: MIDINote = {
              midi: midiValue,
              time: timeSeconds,
              duration: durationSeconds,
              velocity: DEFAULT_VELOCITY,
              name: midiToNoteName(midiValue),
            };

            trackState.track.notes.push(note);
            maxEndTime = Math.max(maxEndTime, timeSeconds + durationSeconds);
          }
        }

        if (!hasChordTag) {
          state.currentBeats = startBeats + durationBeats;
        }
      });
    });
  });

  const tracks = Array.from(trackStates.values())
    .map((state) => state.track)
    .filter((track) => track.notes.length > 0);

  tracks.forEach((track) => {
    track.notes.sort((a, b) => a.time - b.time || a.midi - b.midi);
  });

  tracks.sort((a, b) => a.name.localeCompare(b.name));

  return {
    name: sourceName,
    tracks,
    duration: maxEndTime,
    header: {
      ppq: DEFAULT_DIVISIONS,
      tempos: tempoEvents.length > 0 ? tempoEvents : [{ bpm: tempoBPM, ticks: 0 }],
      timeSignatures: Array.from(timeSignatureSet.values()),
    },
  };
};

export const parseMusicXMLFile = async (file: File): Promise<ParsedMIDI> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'mxl') {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const candidate = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.xml') || name.toLowerCase().endsWith('.musicxml'));

    if (!candidate) {
      throw new Error('No MusicXML content found inside MXL archive');
    }

    const xmlContent = await zip.files[candidate].async('text');
    return parseMusicXMLContent(xmlContent, file.name);
  }

  if (extension === 'xml' || extension === 'musicxml') {
    const xmlContent = await file.text();
    return parseMusicXMLContent(xmlContent, file.name);
  }

  throw new Error('Unsupported MusicXML file type');
};




