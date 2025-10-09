import React, { useEffect, useRef, useMemo } from 'react';
import { NOTE_TIME_TOLERANCE, timesAreClose, midiToNoteName, durationToVexFlowType, calculateMeasures } from '../utils/noteUtils';
import { Stave, Renderer, StaveNote, Accidental, TickContext, StaveConnector } from 'vexflow';
import type { MIDINote, ParsedMIDI } from '../types/midi';
import type { ClefFilter } from '../App';
import { getClefForNote } from '../utils/midiParser';

const NOTE_NAME_REGEX = /^([A-G])([#b]?)(-?\d+)$/;

const getVexflowKey = (note: MIDINote): { key: string; accidental: string | null } => {
  const preferredName = note.name || '';
  const match = preferredName.match(NOTE_NAME_REGEX) ?? midiToNoteName(note.midi).match(NOTE_NAME_REGEX);

  if (!match) {
    return { key: 'c/4', accidental: null };
  }

  const [, letter, accidental, octave] = match;
  return {
    key: `${letter.toLowerCase()}${accidental ?? ''}/${octave}`,
    accidental: accidental || null,
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
}

interface NoteLayout {
  note: MIDINote;
  noteIndex: number;
  x: number;
  lineIndex: number;
  clef: 'treble' | 'bass';
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Extract tempo and time signature from MIDI header
  const bpm = midiHeader.tempos[0]?.bpm || 120;
  const timeSignature = midiHeader.timeSignatures[0]?.timeSignature || [4, 4];

  // Calculate measure positions
  const measures = useMemo(() => {
    return calculateMeasures(totalDuration, timeSignature, bpm);
  }, [totalDuration, timeSignature, bpm]);

  const CANVAS_WIDTH = 1200;
  const TIME_GROUPS_PER_LINE = 12; // Number of time positions per line
  const NOTE_SPACING = 75; // Spacing between time groups
  const STAVE_MARGIN_LEFT = 80;
  const STAVE_WIDTH = CANVAS_WIDTH - STAVE_MARGIN_LEFT - 40;
  const LINE_SPACING = clefFilter === 'both' ? 280 : 220; // Vertical spacing between staves

  // Group notes by time and calculate layout
  const noteLayout = useMemo((): NoteLayout[] => {
    const layout: NoteLayout[] = [];

    // Group notes by time (within tolerance)
    const timeGroups: Array<{ time: number; notes: Array<{ note: MIDINote; index: number }> }> = [];

    notes.forEach((note, index) => {
      // Find existing time group or create new one
      let group = timeGroups.find(g => timesAreClose(g.time, note.time, noteTimeTolerance));

      if (!group) {
        group = { time: note.time, notes: [] };
        timeGroups.push(group);
      }

      group.notes.push({ note, index });
    });

    // Sort time groups by time
    timeGroups.sort((a, b) => a.time - b.time);

    // Layout each time group
    timeGroups.forEach((group, groupIndex) => {
      const lineIndex = Math.floor(groupIndex / TIME_GROUPS_PER_LINE);
      const positionInLine = groupIndex % TIME_GROUPS_PER_LINE;
      const x = STAVE_MARGIN_LEFT + 50 + (positionInLine * NOTE_SPACING);

      // Place each note in the group
      group.notes.forEach(({ note, index }) => {
        const clef = getClefForNote(note.midi);

        layout.push({
          note,
          noteIndex: index,
          x,
          lineIndex,
          clef,
        });
      });
    });

    return layout;
  }, [notes, noteTimeTolerance, clefFilter]);

  // Calculate total number of lines needed based on time groups
  const totalLines = useMemo(() => {
    if (noteLayout.length === 0) return 1;
    const maxLineIndex = Math.max(...noteLayout.map(n => n.lineIndex));
    return maxLineIndex + 1;
  }, [noteLayout]);

  // Calculate canvas height based on clef filter and number of lines
  const CANVAS_HEIGHT = useMemo(() => {
    const heightPerLine = clefFilter === 'both' ? 300 : 200;
    return Math.max(heightPerLine, totalLines * LINE_SPACING + 100);
  }, [totalLines, clefFilter]);

  // Auto-scroll to keep current note visible
  useEffect(() => {
    if (!containerRef.current) return;

    const currentNote = noteLayout[expectedNoteIndex];
    if (!currentNote) return;

    const lineY = currentNote.lineIndex * LINE_SPACING;
    const container = containerRef.current;
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;

    // Scroll to keep the current line in view
    if (lineY < scrollTop || lineY > scrollTop + containerHeight - 300) {
      container.scrollTo({
        top: Math.max(0, lineY - 100),
        behavior: 'smooth',
      });
    }
  }, [expectedNoteIndex, noteLayout]);

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

    // Draw staves for each line
    const stavesMap = new Map<string, Stave>();

    for (let lineIndex = 0; lineIndex < totalLines; lineIndex++) {
      const yBase = lineIndex * LINE_SPACING + 50;
      let trebleStave: Stave | undefined;
      let bassStave: Stave | undefined;

      if (clefFilter === 'both' || clefFilter === 'treble') {
        const trebleY = yBase;
        trebleStave = new Stave(STAVE_MARGIN_LEFT, trebleY, STAVE_WIDTH);
        trebleStave.addClef('treble'); // Add clef to every stave
        if (lineIndex === 0) {
          // Add time signature only to first stave
          trebleStave.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}` as any);
        }
        trebleStave.setEndBarType('single' as any); // Add end barline
        trebleStave.setContext(vfContext).draw();
        stavesMap.set(`treble-${lineIndex}`, trebleStave);
      }

      if (clefFilter === 'both' || clefFilter === 'bass') {
        const bassY = clefFilter === 'both' ? yBase + 140 : yBase;
        bassStave = new Stave(STAVE_MARGIN_LEFT, bassY, STAVE_WIDTH);
        bassStave.addClef('bass'); // Add clef to every stave
        if (lineIndex === 0) {
          // Add time signature only to first stave
          bassStave.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}` as any);
        }
        bassStave.setEndBarType('single' as any); // Add end barline
        bassStave.setContext(vfContext).draw();
        stavesMap.set(`bass-${lineIndex}`, bassStave);
      }

      // Draw brace connector between treble and bass staves for grand staff
      if (clefFilter === 'both' && trebleStave && bassStave) {
        // Draw brace on the left
        const brace = new StaveConnector(trebleStave, bassStave);
        brace.setType('brace');
        brace.setContext(vfContext).draw();

        // Draw starting single barline after the clefs
        const startBarline = new StaveConnector(trebleStave, bassStave);
        startBarline.setType('single');
        startBarline.setContext(vfContext).draw();

        // Draw ending barline connector to connect both staves
        const endBarline = new StaveConnector(trebleStave, bassStave);
        endBarline.setType('singleRight');
        endBarline.setContext(vfContext).draw();
      }
    }

    // Draw notes with VexFlow glyphs
    noteLayout.forEach((item) => {
      const { note, x, lineIndex, clef } = item;

      const staveKey = `${clef}-${lineIndex}`;
      const stave = stavesMap.get(staveKey);
      if (!stave) {
        return;
      }

      const isExpectedNote =
        expectedTime !== undefined && timesAreClose(note.time, expectedTime, noteTimeTolerance);

      let fillStyle = '#000000';
      let strokeStyle = '#000000';

      if (isExpectedNote) {
        const expectedCount = expectedCounts.get(note.midi) || 0;
        const playedCount = playedNotesInChord.get(note.midi) || 0;

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
      }

      const { key, accidental } = getVexflowKey(note);
      const noteDuration = durationToVexFlowType(note.duration, bpm);
      const staveNote = new StaveNote({
        keys: [key],
        clef,
        duration: noteDuration,
        autoStem: true,
      });

      staveNote.setIgnoreTicks(true);
      staveNote.setCenterAlignment(true);
      staveNote.setStyle({ fillStyle, strokeStyle });
      staveNote.setStemStyle({ fillStyle: strokeStyle, strokeStyle });
      staveNote.setLedgerLineStyle({ strokeStyle });

      if (accidental) {
        const vfAccidental = new Accidental(accidental);
        vfAccidental.setStyle({ fillStyle: strokeStyle, strokeStyle });
        staveNote.addModifier(vfAccidental, 0);
      }

      const tickContext = new TickContext();
      tickContext.addTickable(staveNote);
      tickContext.setPadding(0);
      tickContext.setX(x);
      tickContext.preFormat();

      staveNote.setContext(vfContext);
      staveNote.setStave(stave);
      staveNote.draw();

      if (showNoteNames) {
        const noteYs = staveNote.getYs();
        if (noteYs.length > 0) {
          context.save();
          context.font = '10px Arial';
          context.fillStyle = '#333';
          context.fillText(note.name, x - 10, noteYs[0] - 20);
          context.restore();
        }
      }
    });

  }, [notes, expectedNoteIndex, clefFilter, noteTimeTolerance, playedNotesInChord, showNoteNames, noteLayout, totalLines, CANVAS_HEIGHT, bpm, timeSignature, measures]);

  return (
    <div
      ref={containerRef}
      className="staff-renderer"
      style={{
        maxHeight: '600px',
        overflowY: 'auto',
        border: '1px solid #ccc',
        backgroundColor: '#fff'
      }}
    >
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ display: 'block' }}
      />
    </div>
  );
};

export default StaffRenderer;
