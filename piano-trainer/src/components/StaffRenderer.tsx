import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { NOTE_TIME_TOLERANCE, timesAreClose, midiToNoteName, durationToVexFlowType, calculateMeasures } from '../utils/noteUtils';
import { Stave, Renderer, StaveNote, Accidental, Voice, Formatter, StaveConnector, Beam } from 'vexflow';
import type { MIDINote, ParsedMIDI } from '../types/midi';
import type { ClefFilter } from '../App';
import { getClefForNote } from '../utils/midiParser';

const NOTE_NAME_REGEX = /^([A-G])([#b]?)(-?\d+)$/;

// Key signature definitions: which notes are affected by each key
const KEY_SIGNATURES: Record<string, Set<string>> = {
  'C': new Set([]),
  'G': new Set(['F#']),
  'D': new Set(['F#', 'C#']),
  'A': new Set(['F#', 'C#', 'G#']),
  'E': new Set(['F#', 'C#', 'G#', 'D#']),
  'B': new Set(['F#', 'C#', 'G#', 'D#', 'A#']),
  'F#': new Set(['F#', 'C#', 'G#', 'D#', 'A#', 'E#']),
  'C#': new Set(['F#', 'C#', 'G#', 'D#', 'A#', 'E#', 'B#']),
  'F': new Set(['Bb']),
  'Bb': new Set(['Bb', 'Eb']),
  'Eb': new Set(['Bb', 'Eb', 'Ab']),
  'Ab': new Set(['Bb', 'Eb', 'Ab', 'Db']),
  'Db': new Set(['Bb', 'Eb', 'Ab', 'Db', 'Gb']),
  'Gb': new Set(['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']),
  'Cb': new Set(['Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Fb']),
};

// Detect key signature from notes
const detectKeySignature = (notes: MIDINote[]): string => {
  const noteNames = new Map<string, { sharp: number; flat: number; natural: number }>();

  notes.forEach(note => {
    const match = note.name.match(NOTE_NAME_REGEX);
    if (!match) return;

    const [, letter, accidental] = match;
    const noteLetter = letter;

    if (!noteNames.has(noteLetter)) {
      noteNames.set(noteLetter, { sharp: 0, flat: 0, natural: 0 });
    }

    const counts = noteNames.get(noteLetter)!;
    if (accidental === '#') {
      counts.sharp++;
    } else if (accidental === 'b') {
      counts.flat++;
    } else {
      counts.natural++;
    }
  });

  // Find which key signature best matches the notes
  let bestKey = 'C';
  let bestScore = -1;

  for (const [key, signature] of Object.entries(KEY_SIGNATURES)) {
    let score = 0;

    // Check how well this key signature matches the notes
    noteNames.forEach((counts, letter) => {
      const sharp = `${letter}#`;
      const flat = `${letter}b`;

      if (signature.has(sharp)) {
        score += counts.sharp;
        score -= counts.natural * 0.5;
      } else if (signature.has(flat)) {
        score += counts.flat;
        score -= counts.natural * 0.5;
      } else {
        score += counts.natural;
        score -= (counts.sharp + counts.flat) * 0.5;
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestKey;
};

const getVexflowKey = (note: MIDINote, keySignature: string): { key: string; accidental: string | null } => {
  const preferredName = note.name || '';
  const match = preferredName.match(NOTE_NAME_REGEX) ?? midiToNoteName(note.midi).match(NOTE_NAME_REGEX);

  if (!match) {
    return { key: 'c/4', accidental: null };
  }

  const [, letter, accidental, octave] = match;
  const noteWithAccidental = `${letter}${accidental}`;
  const signature = KEY_SIGNATURES[keySignature] || new Set();

  // If this accidental is in the key signature, don't show it on the note
  const needsAccidental = accidental && !signature.has(noteWithAccidental);

  return {
    key: `${letter.toLowerCase()}${accidental ?? ''}/${octave}`,
    accidental: needsAccidental ? accidental : null,
  };
};

interface StaffRendererProps {
  notes: MIDINote[];
  expectedNoteIndex: number;
  clefFilter: ClefFilter;
  playedNotesInChord?: Map<number, number>;
  showNoteNames?: boolean;
  noteTimeTolerance?: number;
  midiHeader: ParsedMIDI['header'];
  totalDuration: number;
  loopStart: number | null;
  loopEnd: number | null;
  loopMode: 'none' | 'setStart' | 'setEnd';
  onClickNote: (noteIndex: number) => void;
}

interface MeasureNote {
  note: MIDINote;
  noteIndex: number;
  clef: 'treble' | 'bass';
}

interface MeasureData {
  measureIndex: number;
  startTime: number;
  endTime: number;
  trebleNotes: MeasureNote[];
  bassNotes: MeasureNote[];
  systemIndex: number; // Which line (system) this measure is on
  measureInSystem: number; // Position within the system (0, 1, 2, etc.)
}

export const StaffRenderer: React.FC<StaffRendererProps> = ({
  notes,
  expectedNoteIndex,
  clefFilter,
  playedNotesInChord = new Map(),
  showNoteNames = false,
  noteTimeTolerance = NOTE_TIME_TOLERANCE,
  midiHeader,
  totalDuration,
  loopStart,
  loopEnd,
  loopMode,
  onClickNote,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [containerWidth, setContainerWidth] = React.useState(1400);

  // Extract tempo and time signature from MIDI header
  const bpm = midiHeader.tempos[0]?.bpm || 120;
  const timeSignature = midiHeader.timeSignatures[0]?.timeSignature || [4, 4];
  const hasTimeSignature = midiHeader.timeSignatures && midiHeader.timeSignatures.length > 0;

  // Use key signature from file metadata if available, otherwise detect from notes
  const keySignature = useMemo(() => {
    // First, try to use key signature from the file metadata
    if (midiHeader.keySignatures && midiHeader.keySignatures.length > 0) {
      return midiHeader.keySignatures[0];
    }
    // Fall back to detection if no metadata available
    return detectKeySignature(notes);
  }, [notes, midiHeader.keySignatures]);

  // Calculate measure positions
  const measures = useMemo(() => {
    return calculateMeasures(totalDuration, timeSignature, bpm);
  }, [totalDuration, timeSignature, bpm]);

  // Responsive canvas sizing
  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        setContainerWidth(Math.max(800, width - 20)); // Minimum 800px, with 20px padding
      }
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  const CANVAS_WIDTH = containerWidth;
  const STAVE_MARGIN_LEFT = 80;
  const BASE_MEASURE_WIDTH = 350; // Increased from 280 for better spacing
  const MEASURES_PER_SYSTEM = Math.max(2, Math.floor((CANVAS_WIDTH - STAVE_MARGIN_LEFT - 40) / BASE_MEASURE_WIDTH));
  const MEASURE_WIDTH = (CANVAS_WIDTH - STAVE_MARGIN_LEFT - 40) / MEASURES_PER_SYSTEM;
  const SYSTEM_SPACING = clefFilter === 'both' ? 320 : 240;

  // Group notes by measures and calculate layout
  const measureLayout = useMemo((): MeasureData[] => {
    if (measures.length === 0) return [];

    const measureData: MeasureData[] = [];

    // Create measure data structures
    measures.forEach((measureStartTime, measureIndex) => {
      const measureEndTime = measures[measureIndex + 1] ?? totalDuration;
      const systemIndex = Math.floor(measureIndex / MEASURES_PER_SYSTEM);
      const measureInSystem = measureIndex % MEASURES_PER_SYSTEM;

      const measure: MeasureData = {
        measureIndex,
        startTime: measureStartTime,
        endTime: measureEndTime,
        trebleNotes: [],
        bassNotes: [],
        systemIndex,
        measureInSystem,
      };

      // Assign notes to this measure
      notes.forEach((note, noteIndex) => {
        if (note.time >= measureStartTime && note.time < measureEndTime) {
          const clef = getClefForNote(note.midi);
          const measureNote: MeasureNote = { note, noteIndex, clef };

          if (clef === 'treble') {
            measure.trebleNotes.push(measureNote);
          } else {
            measure.bassNotes.push(measureNote);
          }
        }
      });

      // Sort notes within measure by time
      measure.trebleNotes.sort((a, b) => a.note.time - b.note.time);
      measure.bassNotes.sort((a, b) => a.note.time - b.note.time);

      measureData.push(measure);
    });

    return measureData;
  }, [notes, measures, totalDuration, clefFilter, MEASURES_PER_SYSTEM]);

  // Calculate total number of systems (lines) needed
  const totalSystems = useMemo(() => {
    if (measureLayout.length === 0) return 1;
    const maxSystemIndex = Math.max(...measureLayout.map(m => m.systemIndex));
    return maxSystemIndex + 1;
  }, [measureLayout]);

  // Calculate canvas height based on clef filter and number of systems
  const CANVAS_HEIGHT = useMemo(() => {
    return Math.max(400, totalSystems * SYSTEM_SPACING + 100);
  }, [totalSystems, SYSTEM_SPACING]);

  // Track if user manually seeked to prevent auto-scroll
  const manualSeekRef = useRef(false);

  // Auto-scroll to keep current note visible (only during playback, not manual seeking)
  useEffect(() => {
    if (!containerRef.current) return;
    if (manualSeekRef.current) {
      manualSeekRef.current = false;
      return;
    }

    const currentNote = notes[expectedNoteIndex];
    if (!currentNote) return;

    // Find which measure contains this note
    const currentMeasure = measureLayout.find(m =>
      currentNote.time >= m.startTime && currentNote.time < m.endTime
    );
    if (!currentMeasure) return;

    const systemY = currentMeasure.systemIndex * SYSTEM_SPACING;
    const container = containerRef.current;
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;

    // Scroll to keep the current system in view
    if (systemY < scrollTop || systemY > scrollTop + containerHeight - SYSTEM_SPACING) {
      container.scrollTo({
        top: Math.max(0, systemY - 50),
        behavior: 'smooth',
      });
    }
  }, [expectedNoteIndex, notes, measureLayout, SYSTEM_SPACING]);

  // Helper function to create a rest note when measure is empty
  const createRestNote = (clef: 'treble' | 'bass'): StaveNote => {
    return new StaveNote({
      keys: [clef === 'treble' ? 'b/4' : 'd/3'],
      duration: 'wr', // whole rest
      clef,
    });
  };

  // Helper function to group notes at the same time position into a chord
  const groupNotesIntoChords = (measureNotes: MeasureNote[]): Array<MeasureNote[]> => {
    const chordGroups: Array<MeasureNote[]> = [];

    measureNotes.forEach((mn) => {
      // Find existing chord group at this time
      let group = chordGroups.find(g =>
        g.length > 0 && timesAreClose(g[0].note.time, mn.note.time, noteTimeTolerance)
      );

      if (!group) {
        group = [];
        chordGroups.push(group);
      }

      group.push(mn);
    });

    // Sort chord groups by time
    chordGroups.sort((a, b) => a[0].note.time - b[0].note.time);

    return chordGroups;
  };

  // Helper function to synchronize time points across treble and bass staves
  const getSynchronizedTimePoints = (trebleNotes: MeasureNote[], bassNotes: MeasureNote[]): number[] => {
    const timePoints = new Set<number>();

    // Collect all unique time points from both staves
    [...trebleNotes, ...bassNotes].forEach(mn => {
      // Round to avoid floating point issues
      const roundedTime = Math.round(mn.note.time * 1000) / 1000;
      timePoints.add(roundedTime);
    });

    // Sort time points
    return Array.from(timePoints).sort((a, b) => a - b);
  };

  // Helper function to get notes at a specific time point
  const getNotesAtTime = (measureNotes: MeasureNote[], targetTime: number): MeasureNote[] => {
    return measureNotes.filter(mn =>
      timesAreClose(mn.note.time, targetTime, noteTimeTolerance)
    );
  };

  // Render the staff and notes
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Update canvas height
    canvas.height = CANVAS_HEIGHT;

    // Clear canvas
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Create VexFlow renderer
    const renderer = new Renderer(canvas, Renderer.Backends.CANVAS);
    const vfContext = renderer.getContext();
    vfContext.clear();

    // Get the expected note time and find all notes at that time (for chords)
    const expectedNote = notes[expectedNoteIndex];
    const expectedTime = expectedNote?.time;

    // Count expected occurrences of each note at the expected time
    const expectedCounts = new Map<number, number>();
    if (expectedTime !== undefined) {
      notes.forEach((n) => {
        if (timesAreClose(n.time, expectedTime, noteTimeTolerance)) {
          expectedCounts.set(n.midi, (expectedCounts.get(n.midi) || 0) + 1);
        }
      });
    }

    // Group measures by system
    const systemMeasures = new Map<number, MeasureData[]>();
    measureLayout.forEach((measure) => {
      if (!systemMeasures.has(measure.systemIndex)) {
        systemMeasures.set(measure.systemIndex, []);
      }
      systemMeasures.get(measure.systemIndex)!.push(measure);
    });

    // Draw each system
    systemMeasures.forEach((measures, systemIndex) => {
      const yBase = systemIndex * SYSTEM_SPACING + 50;

      // Track first and last treble/bass staves for connectors
      let firstTrebleStave: Stave | undefined;
      let firstBassStave: Stave | undefined;
      let lastTrebleStave: Stave | undefined;
      let lastBassStave: Stave | undefined;

      // Track all treble and bass staves for barline connectors
      const allTrebleStaves: Stave[] = [];
      const allBassStaves: Stave[] = [];

      // Draw each measure in this system
      measures.forEach((measure, indexInSystem) => {
        const x = STAVE_MARGIN_LEFT + (indexInSystem * MEASURE_WIDTH);
        const isFirstMeasure = measure.measureIndex === 0;
        const isFirstInSystem = indexInSystem === 0;
        const isLastInSystem = indexInSystem === measures.length - 1;

        // Create staves for this measure
        let trebleStave: Stave | undefined;
        let bassStave: Stave | undefined;

        if (clefFilter === 'both' || clefFilter === 'treble') {
          const trebleY = yBase;
          trebleStave = new Stave(x, trebleY, MEASURE_WIDTH);

          if (isFirstInSystem) {
            trebleStave.addClef('treble');
            if (keySignature !== 'C') {
              trebleStave.addKeySignature(keySignature);
            }
          }
          if (isFirstMeasure && hasTimeSignature) {
            trebleStave.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}` as any);
          }

          trebleStave.setContext(vfContext).draw();
          allTrebleStaves.push(trebleStave);

          if (isFirstInSystem) firstTrebleStave = trebleStave;
          if (isLastInSystem) lastTrebleStave = trebleStave;
        }

        if (clefFilter === 'both' || clefFilter === 'bass') {
          const bassY = clefFilter === 'both' ? yBase + 140 : yBase;
          bassStave = new Stave(x, bassY, MEASURE_WIDTH);

          if (isFirstInSystem) {
            bassStave.addClef('bass');
            if (keySignature !== 'C') {
              bassStave.addKeySignature(keySignature);
            }
          }
          if (isFirstMeasure && hasTimeSignature) {
            bassStave.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}` as any);
          }

          bassStave.setContext(vfContext).draw();
          allBassStaves.push(bassStave);

          if (isFirstInSystem) firstBassStave = bassStave;
          if (isLastInSystem) lastBassStave = bassStave;
        }

        // Create voices and format notes for this measure
        let trebleVoice: Voice | undefined;
        let bassVoice: Voice | undefined;
        let trebleNotes: StaveNote[] = [];
        let bassNotes: StaveNote[] = [];

        // For better alignment, process both staves together using synchronized time points
        if (clefFilter === 'both') {
          // Get all time points that appear in either stave
          const syncedTimePoints = getSynchronizedTimePoints(measure.trebleNotes, measure.bassNotes);

          if (syncedTimePoints.length === 0) {
            // Both staves empty - add rests
            if (trebleStave) trebleNotes.push(createRestNote('treble'));
            if (bassStave) bassNotes.push(createRestNote('bass'));
          } else {
            // Process each time point
            syncedTimePoints.forEach((timePoint, idx) => {
              const trebleNotesAtTime = getNotesAtTime(measure.trebleNotes, timePoint);
              const bassNotesAtTime = getNotesAtTime(measure.bassNotes, timePoint);

              // Calculate the rhythmic duration based on time gap to next event
              // This ensures proper alignment regardless of note duration
              let rhythmicDuration = 'q'; // default quarter note
              if (idx < syncedTimePoints.length - 1) {
                // Calculate time gap to next time point
                const timeGap = syncedTimePoints[idx + 1] - timePoint;
                rhythmicDuration = durationToVexFlowType(timeGap, bpm);
              } else {
                // Last note in measure - use remaining measure time or the note's own duration
                if (trebleNotesAtTime.length > 0) {
                  rhythmicDuration = durationToVexFlowType(trebleNotesAtTime[0].note.duration, bpm);
                } else if (bassNotesAtTime.length > 0) {
                  rhythmicDuration = durationToVexFlowType(bassNotesAtTime[0].note.duration, bpm);
                }
              }

              // Create treble note or rest
              if (trebleStave) {
                if (trebleNotesAtTime.length > 0) {
                  const keys = trebleNotesAtTime.map(mn => getVexflowKey(mn.note, keySignature).key);

                  const staveNote = new StaveNote({
                    keys: keys,
                    clef: 'treble',
                    duration: rhythmicDuration,
                    autoStem: true,
                  });

                  // Apply highlighting and accidentals
                  trebleNotesAtTime.forEach((mn, i) => {
                    const isExpectedNote = expectedTime !== undefined &&
                      timesAreClose(mn.note.time, expectedTime, noteTimeTolerance);
                    const isInLoop = loopStart !== null && loopEnd !== null &&
                      mn.noteIndex >= loopStart && mn.noteIndex <= loopEnd;

                    let fillStyle = '#000000';
                    let strokeStyle = '#000000';

                    if (isExpectedNote) {
                      const expectedCount = expectedCounts.get(mn.note.midi) || 0;
                      const playedCount = playedNotesInChord.get(mn.note.midi) || 0;

                      if (playedCount >= expectedCount) {
                        fillStyle = '#3498db';
                        strokeStyle = '#2980b9';
                      } else if (playedCount > 0) {
                        fillStyle = '#f39c12';
                        strokeStyle = '#e67e22';
                      } else {
                        fillStyle = '#00ff00';
                        strokeStyle = '#00aa00';
                      }
                    } else if (isInLoop) {
                      // Notes in loop range - use purple/indigo color
                      fillStyle = '#7c3aed';
                      strokeStyle = '#6d28d9';
                    }

                    staveNote.setKeyStyle(i, { fillStyle, strokeStyle });

                    const { accidental } = getVexflowKey(mn.note, keySignature);
                    if (accidental) {
                      const vfAccidental = new Accidental(accidental);
                      vfAccidental.setStyle({ fillStyle: strokeStyle, strokeStyle });
                      staveNote.addModifier(vfAccidental, i);
                    }
                  });

                  trebleNotes.push(staveNote);
                } else {
                  // Add a rest to maintain alignment
                  const restNote = new StaveNote({
                    keys: ['b/4'],
                    duration: rhythmicDuration + 'r',
                    clef: 'treble',
                  });
                  trebleNotes.push(restNote);
                }
              }

              // Create bass note or rest
              if (bassStave) {
                if (bassNotesAtTime.length > 0) {
                  const keys = bassNotesAtTime.map(mn => getVexflowKey(mn.note, keySignature).key);

                  const staveNote = new StaveNote({
                    keys: keys,
                    clef: 'bass',
                    duration: rhythmicDuration,
                    autoStem: true,
                  });

                  // Apply highlighting and accidentals
                  bassNotesAtTime.forEach((mn, i) => {
                    const isExpectedNote = expectedTime !== undefined &&
                      timesAreClose(mn.note.time, expectedTime, noteTimeTolerance);
                    const isInLoop = loopStart !== null && loopEnd !== null &&
                      mn.noteIndex >= loopStart && mn.noteIndex <= loopEnd;

                    let fillStyle = '#000000';
                    let strokeStyle = '#000000';

                    if (isExpectedNote) {
                      const expectedCount = expectedCounts.get(mn.note.midi) || 0;
                      const playedCount = playedNotesInChord.get(mn.note.midi) || 0;

                      if (playedCount >= expectedCount) {
                        fillStyle = '#3498db';
                        strokeStyle = '#2980b9';
                      } else if (playedCount > 0) {
                        fillStyle = '#f39c12';
                        strokeStyle = '#e67e22';
                      } else {
                        fillStyle = '#00ff00';
                        strokeStyle = '#00aa00';
                      }
                    } else if (isInLoop) {
                      // Notes in loop range - use purple/indigo color
                      fillStyle = '#7c3aed';
                      strokeStyle = '#6d28d9';
                    }

                    staveNote.setKeyStyle(i, { fillStyle, strokeStyle });

                    const { accidental } = getVexflowKey(mn.note, keySignature);
                    if (accidental) {
                      const vfAccidental = new Accidental(accidental);
                      vfAccidental.setStyle({ fillStyle: strokeStyle, strokeStyle });
                      staveNote.addModifier(vfAccidental, i);
                    }
                  });

                  bassNotes.push(staveNote);
                } else {
                  // Add a rest to maintain alignment
                  const restNote = new StaveNote({
                    keys: ['d/3'],
                    duration: rhythmicDuration + 'r',
                    clef: 'bass',
                  });
                  bassNotes.push(restNote);
                }
              }
            });
          }

          // Create voices
          if (trebleStave && trebleNotes.length > 0) {
            trebleVoice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] });
            trebleVoice.setStrict(false);
            trebleVoice.addTickables(trebleNotes);
          }

          if (bassStave && bassNotes.length > 0) {
            bassVoice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] });
            bassVoice.setStrict(false);
            bassVoice.addTickables(bassNotes);
          }
        } else {
          // Single stave mode - process normally
          // Process treble clef notes
          if (trebleStave && (clefFilter === 'treble')) {
            const chordGroups = groupNotesIntoChords(measure.trebleNotes);

            if (chordGroups.length === 0) {
              trebleNotes.push(createRestNote('treble'));
            } else {
              chordGroups.forEach((chordGroup) => {
                const keys = chordGroup.map(mn => getVexflowKey(mn.note, keySignature).key);
                const firstNote = chordGroup[0].note;
                const noteDuration = durationToVexFlowType(firstNote.duration, bpm);

                const staveNote = new StaveNote({
                  keys: keys,
                  clef: 'treble',
                  duration: noteDuration,
                  autoStem: true,
                });

                chordGroup.forEach((mn, i) => {
                  const isExpectedNote = expectedTime !== undefined &&
                    timesAreClose(mn.note.time, expectedTime, noteTimeTolerance);
                  const isInLoop = loopStart !== null && loopEnd !== null &&
                    mn.noteIndex >= loopStart && mn.noteIndex <= loopEnd;

                  let fillStyle = '#000000';
                  let strokeStyle = '#000000';

                  if (isExpectedNote) {
                    const expectedCount = expectedCounts.get(mn.note.midi) || 0;
                    const playedCount = playedNotesInChord.get(mn.note.midi) || 0;

                    if (playedCount >= expectedCount) {
                      fillStyle = '#3498db';
                      strokeStyle = '#2980b9';
                    } else if (playedCount > 0) {
                      fillStyle = '#f39c12';
                      strokeStyle = '#e67e22';
                    } else {
                      fillStyle = '#00ff00';
                      strokeStyle = '#00aa00';
                    }
                  } else if (isInLoop) {
                    // Notes in loop range - use purple/indigo color
                    fillStyle = '#7c3aed';
                    strokeStyle = '#6d28d9';
                  }

                  staveNote.setKeyStyle(i, { fillStyle, strokeStyle });

                  const { accidental } = getVexflowKey(mn.note, keySignature);
                  if (accidental) {
                    const vfAccidental = new Accidental(accidental);
                    vfAccidental.setStyle({ fillStyle: strokeStyle, strokeStyle });
                    staveNote.addModifier(vfAccidental, i);
                  }
                });

                trebleNotes.push(staveNote);
              });
            }

            trebleVoice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] });
            trebleVoice.setStrict(false);
            trebleVoice.addTickables(trebleNotes);
          }

          // Process bass clef notes
          if (bassStave && (clefFilter === 'bass')) {
            const chordGroups = groupNotesIntoChords(measure.bassNotes);

            if (chordGroups.length === 0) {
              bassNotes.push(createRestNote('bass'));
            } else {
              chordGroups.forEach((chordGroup) => {
                const keys = chordGroup.map(mn => getVexflowKey(mn.note, keySignature).key);
                const firstNote = chordGroup[0].note;
                const noteDuration = durationToVexFlowType(firstNote.duration, bpm);

                const staveNote = new StaveNote({
                  keys: keys,
                  clef: 'bass',
                  duration: noteDuration,
                  autoStem: true,
                });

                chordGroup.forEach((mn, i) => {
                  const isExpectedNote = expectedTime !== undefined &&
                    timesAreClose(mn.note.time, expectedTime, noteTimeTolerance);
                  const isInLoop = loopStart !== null && loopEnd !== null &&
                    mn.noteIndex >= loopStart && mn.noteIndex <= loopEnd;

                  let fillStyle = '#000000';
                  let strokeStyle = '#000000';

                  if (isExpectedNote) {
                    const expectedCount = expectedCounts.get(mn.note.midi) || 0;
                    const playedCount = playedNotesInChord.get(mn.note.midi) || 0;

                    if (playedCount >= expectedCount) {
                      fillStyle = '#3498db';
                      strokeStyle = '#2980b9';
                    } else if (playedCount > 0) {
                      fillStyle = '#f39c12';
                      strokeStyle = '#e67e22';
                    } else {
                      fillStyle = '#00ff00';
                      strokeStyle = '#00aa00';
                    }
                  } else if (isInLoop) {
                    // Notes in loop range - use purple/indigo color
                    fillStyle = '#7c3aed';
                    strokeStyle = '#6d28d9';
                  }

                  staveNote.setKeyStyle(i, { fillStyle, strokeStyle });

                  const { accidental } = getVexflowKey(mn.note, keySignature);
                  if (accidental) {
                    const vfAccidental = new Accidental(accidental);
                    vfAccidental.setStyle({ fillStyle: strokeStyle, strokeStyle });
                    staveNote.addModifier(vfAccidental, i);
                  }
                });

                bassNotes.push(staveNote);
              });
            }

            bassVoice = new Voice({ numBeats: timeSignature[0], beatValue: timeSignature[1] });
            bassVoice.setStrict(false);
            bassVoice.addTickables(bassNotes);
          }
        }

        // Format and draw voices together for proper alignment
        if (trebleVoice || bassVoice) {
          const voicesToFormat: Voice[] = [];
          if (trebleVoice) voicesToFormat.push(trebleVoice);
          if (bassVoice) voicesToFormat.push(bassVoice);

          const formatter = new Formatter();
          formatter.joinVoices(voicesToFormat);

          // Format with more space for better readability - adjust based on measure width
          const formatterWidth = MEASURE_WIDTH - 100; // Leave more room for clefs and spacing
          formatter.format(voicesToFormat, formatterWidth);

          // Draw each voice on its respective stave
          if (trebleVoice && trebleStave) {
            trebleVoice.setStave(trebleStave);
            trebleVoice.draw(vfContext, trebleStave);
            // Skip beaming in synchronized mode to avoid beaming artifacts
            // Notes will display with individual flags which is clearer
          }

          if (bassVoice && bassStave) {
            bassVoice.setStave(bassStave);
            bassVoice.draw(vfContext, bassStave);
            // Skip beaming in synchronized mode to avoid beaming artifacts
            // Notes will display with individual flags which is clearer
          }
        }
      });

      // Draw system connectors (brace and barlines)
      if (clefFilter === 'both' && firstTrebleStave && firstBassStave) {
        // Draw brace on the left
        const brace = new StaveConnector(firstTrebleStave, firstBassStave);
        brace.setType('brace');
        brace.setContext(vfContext).draw();

        // Draw starting barline after the clefs
        const startBarline = new StaveConnector(firstTrebleStave, firstBassStave);
        startBarline.setType('single');
        startBarline.setContext(vfContext).draw();
      }

      // Draw barline connectors between each measure in the grand staff
      if (clefFilter === 'both' && allTrebleStaves.length > 0 && allBassStaves.length > 0) {
        for (let i = 0; i < allTrebleStaves.length; i++) {
          const trebleStave = allTrebleStaves[i];
          const bassStave = allBassStaves[i];

          if (trebleStave && bassStave) {
            // Draw barline connector at the end of each measure
            const barline = new StaveConnector(trebleStave, bassStave);
            barline.setType('singleRight');
            barline.setContext(vfContext).draw();
          }
        }
      }

      // Draw ending barline connector for the system (final barline should be thicker)
      if (clefFilter === 'both' && lastTrebleStave && lastBassStave) {
        // The singleRight barlines are already drawn above, but we could add a double barline for the last system
        // For now, the single barlines will do
      }
    });

    // Draw note names if enabled
    if (showNoteNames) {
      measureLayout.forEach((measure) => {
        [...measure.trebleNotes, ...measure.bassNotes].forEach((mn) => {
          const systemY = measure.systemIndex * SYSTEM_SPACING + 50;
          const x = STAVE_MARGIN_LEFT + (measure.measureInSystem * MEASURE_WIDTH) + 40;
          const y = mn.clef === 'treble' ? systemY + 40 : systemY + 180;

          context.save();
          context.font = '10px Arial';
          context.fillStyle = '#333';
          context.fillText(mn.note.name, x, y);
          context.restore();
        });
      });
    }

  }, [notes, expectedNoteIndex, clefFilter, noteTimeTolerance, playedNotesInChord, showNoteNames, measureLayout, totalSystems, CANVAS_HEIGHT, bpm, timeSignature, SYSTEM_SPACING, MEASURE_WIDTH, CANVAS_WIDTH, hasTimeSignature, keySignature, loopStart, loopEnd]);

  // Helper: find note index from canvas position (accounting for multi-row layout)
  const findNoteIndexFromCanvasPosition = useCallback((canvasX: number, canvasY: number): number => {
    // Determine which system (row) was clicked
    const systemIndex = Math.floor(canvasY / SYSTEM_SPACING);

    // Find measures in this system
    const systemMeasures = measureLayout.filter(m => m.systemIndex === systemIndex);
    if (systemMeasures.length === 0) return 0;

    // Find which measure was clicked based on X position
    let clickedMeasure: MeasureData | null = null;
    for (const measure of systemMeasures) {
      const measureX = STAVE_MARGIN_LEFT + (measure.measureInSystem * MEASURE_WIDTH);
      const measureEndX = measureX + MEASURE_WIDTH;

      if (canvasX >= measureX && canvasX < measureEndX) {
        clickedMeasure = measure;
        break;
      }
    }

    if (!clickedMeasure) {
      // Click was outside measures, use first or last measure in system
      clickedMeasure = canvasX < STAVE_MARGIN_LEFT
        ? systemMeasures[0]
        : systemMeasures[systemMeasures.length - 1];
    }

    // Get all notes in the clicked measure
    const measureNotes = [...clickedMeasure.trebleNotes, ...clickedMeasure.bassNotes];
    if (measureNotes.length === 0) {
      // No notes in this measure, find closest note
      return notes.findIndex(n => n.time >= clickedMeasure!.startTime) || 0;
    }

    // Find the closest note in this measure based on time
    const measureStartX = STAVE_MARGIN_LEFT + (clickedMeasure.measureInSystem * MEASURE_WIDTH);
    const relativeX = (canvasX - measureStartX) / MEASURE_WIDTH;
    const estimatedTime = clickedMeasure.startTime +
      relativeX * (clickedMeasure.endTime - clickedMeasure.startTime);

    // Find closest note to estimated time
    let closestNote = measureNotes[0];
    let closestDist = Math.abs(closestNote.note.time - estimatedTime);

    for (const mn of measureNotes) {
      const dist = Math.abs(mn.note.time - estimatedTime);
      if (dist < closestDist) {
        closestDist = dist;
        closestNote = mn;
      }
    }

    return closestNote.noteIndex;
  }, [notes, measureLayout, SYSTEM_SPACING, STAVE_MARGIN_LEFT, MEASURE_WIDTH]);

  // Helper: find canvas position from note index
  const findCanvasPositionFromNoteIndex = useCallback((noteIndex: number): { x: number; y: number } | null => {
    if (noteIndex < 0 || noteIndex >= notes.length) return null;

    const note = notes[noteIndex];

    // Find the measure containing this note
    const measure = measureLayout.find(m =>
      note.time >= m.startTime && note.time < m.endTime
    );

    if (!measure) return null;

    // Calculate position within the measure
    const measureStartX = STAVE_MARGIN_LEFT + (measure.measureInSystem * MEASURE_WIDTH);
    const measureDuration = measure.endTime - measure.startTime;
    const noteTimeInMeasure = note.time - measure.startTime;
    const relativeX = measureDuration > 0 ? noteTimeInMeasure / measureDuration : 0;

    // Calculate canvas coordinates
    const x = measureStartX + (relativeX * MEASURE_WIDTH);
    const y = measure.systemIndex * SYSTEM_SPACING;

    return { x, y };
  }, [notes, measureLayout, STAVE_MARGIN_LEFT, MEASURE_WIDTH, SYSTEM_SPACING]);

  // Mouse event handler - simple click to select note
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

    const noteIndex = findNoteIndexFromCanvasPosition(x, y);
    onClickNote(noteIndex);
  }, [CANVAS_WIDTH, CANVAS_HEIGHT, findNoteIndexFromCanvasPosition, onClickNote]);

  return (
    <div
      ref={containerRef}
      className="staff-renderer"
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        backgroundColor: '#fff',
        position: 'relative'
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onClick={handleCanvasClick}
        style={{
          display: 'block',
          width: '100%',
          height: 'auto',
          cursor: loopMode !== 'none' ? 'crosshair' : 'pointer'
        }}
      />
    </div>
  );
};

export default StaffRenderer;
