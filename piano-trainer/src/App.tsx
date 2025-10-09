import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useBluetoothMIDI } from './hooks/useBluetoothMIDI';
import { usePianoSampler } from './hooks/usePianoSampler';
import { MIDIFileLoader } from './components/MIDIFileLoader';
import { TrackSelector } from './components/TrackSelector';
import { StaffRenderer } from './components/StaffRenderer';
import { ScoreDisplay } from './components/ScoreDisplay';
import { PianoKeyboard } from './components/PianoKeyboard';
import type { ParsedMIDI, MIDINote } from './types/midi';
import { getClefForNote } from './utils/midiParser';
import { NOTE_TIME_TOLERANCE, timesAreClose } from './utils/noteUtils';
import './App.css';

export type ClefFilter = 'both' | 'treble' | 'bass';
export type PlayMode = 'practice' | 'preview';

function App() {
  const { isConnected, deviceName, error, connect, disconnect, onNote } = useBluetoothMIDI();
  const { playNote, isEnabled: isAudioEnabled, isLoaded: samplesLoaded, volume, toggleAudio, setVolumeLevel, resumeAudio } = usePianoSampler();

  const [midiData, setMidiData] = useState<ParsedMIDI | null>(null);
  const [selectedTracks, setSelectedTracks] = useState<number[]>([]);
  const [mergedNotes, setMergedNotes] = useState<MIDINote[]>([]);
  const [filteredNotes, setFilteredNotes] = useState<MIDINote[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expectedNoteIndex, setExpectedNoteIndex] = useState(0);
  const [clefFilter, setClefFilter] = useState<ClefFilter>('both');
  const [playMode, setPlayMode] = useState<PlayMode>('practice');
  const lastPlayedNoteIndexRef = useRef(-1);
  const [playedNotesInChord, setPlayedNotesInChord] = useState<Map<number, number>>(new Map());
  const [showNoteNames, setShowNoteNames] = useState(false);
  const [, setConsecutiveWrong] = useState(0);
  const [showPianoHelp, setShowPianoHelp] = useState(false);

  const [score, setScore] = useState({
    correct: 0,
    incorrect: 0,
    missed: 0,
  });

  // Merge notes from selected tracks and sort by time
  useEffect(() => {
    if (!midiData || selectedTracks.length === 0) {
      setMergedNotes([]);
      return;
    }

    const notes: MIDINote[] = [];
    selectedTracks.forEach((trackIndex) => {
      const track = midiData.tracks[trackIndex];
      if (track) {
        notes.push(...track.notes);
      }
    });

    // Sort by time
    notes.sort((a, b) => a.time - b.time);
    setMergedNotes(notes);
    setExpectedNoteIndex(0);
  }, [midiData, selectedTracks]);

  // Filter notes by clef selection
  useEffect(() => {
    if (clefFilter === 'both') {
      setFilteredNotes(mergedNotes);
    } else {
      const filtered = mergedNotes.filter((note) => {
        const clef = getClefForNote(note.midi);
        return clef === clefFilter;
      });
      setFilteredNotes(filtered);
    }
    setExpectedNoteIndex(0);
    setPlayedNotesInChord(new Map()); // Reset chord tracking
  }, [mergedNotes, clefFilter]);

  // Auto-play notes in PREVIEW mode
  useEffect(() => {
    if (!isPlaying || playMode !== 'preview') return;

    // In preview mode, play notes automatically with a delay
    const timeoutId = setTimeout(() => {
      const currentNote = filteredNotes[expectedNoteIndex];
      if (currentNote) {
        const referenceTime = currentNote.time;

        // Find all notes at the same time (chord)
        const chordNotes = filteredNotes.filter((n) =>
          timesAreClose(n.time, referenceTime, NOTE_TIME_TOLERANCE)
        );

        // Play all notes in the chord simultaneously
        console.log('Auto-playing chord:', chordNotes.map(n => n.name).join(', '));
        chordNotes.forEach((note) => {
          playNote(note.midi, note.duration, note.velocity / 127);
        });

        setScore((prev) => ({ ...prev, correct: prev.correct + chordNotes.length }));

        // Move to the next time position (skip all notes in this chord)
        let nextIndex = expectedNoteIndex;
        while (
          nextIndex < filteredNotes.length &&
          timesAreClose(filteredNotes[nextIndex].time, referenceTime, NOTE_TIME_TOLERANCE)
        ) {
          nextIndex += 1;
        }

        setExpectedNoteIndex(nextIndex);
        setCurrentTime(referenceTime);
      } else {
        // No more notes, stop playing
        setIsPlaying(false);
      }
    }, 500); // Half second delay between chords in preview mode

    return () => clearTimeout(timeoutId);
  }, [isPlaying, playMode, expectedNoteIndex, filteredNotes, playNote]);

  // Reset last played note when playback stops or resets
  useEffect(() => {
    if (!isPlaying) {
      lastPlayedNoteIndexRef.current = -1;
    }
  }, [isPlaying, expectedNoteIndex]);
  // Handle MIDI input (only in practice mode)
  const handleMIDINote = useCallback(
    (note: number) => {
      if (!isPlaying || playMode !== 'practice') {
        return;
      }

      const referenceNote = filteredNotes[expectedNoteIndex];
      if (!referenceNote) {
        return;
      }

      const referenceTime = referenceNote.time;
      const chordNotes = filteredNotes.filter((n) =>
        timesAreClose(n.time, referenceTime, NOTE_TIME_TOLERANCE)
      );

      if (chordNotes.length === 0) {
        console.warn('No notes matched expected time', referenceTime);
        return;
      }

      const expectedCounts = new Map<number, number>();
      chordNotes.forEach((n) => {
        expectedCounts.set(n.midi, (expectedCounts.get(n.midi) || 0) + 1);
      });

      const expectedCount = expectedCounts.get(note);
      const alreadyPlayed = playedNotesInChord.get(note) || 0;

      if (expectedCount) {
        if (alreadyPlayed >= expectedCount) {
          return;
        }

        const updatedPlayedCounts = new Map(playedNotesInChord);
        updatedPlayedCounts.set(note, alreadyPlayed + 1);

        setPlayedNotesInChord(updatedPlayedCounts);
        setScore((prev) => ({ ...prev, correct: prev.correct + 1 }));
        setConsecutiveWrong(0);

        const allNotesSatisfied = chordNotes.every((chordNote) => {
          const required = expectedCounts.get(chordNote.midi) || 0;
          const played = updatedPlayedCounts.get(chordNote.midi) || 0;
          return played >= required;
        });

        if (allNotesSatisfied) {
          let nextIndex = expectedNoteIndex;
          while (
            nextIndex < filteredNotes.length &&
            timesAreClose(filteredNotes[nextIndex].time, referenceTime, NOTE_TIME_TOLERANCE)
          ) {
            nextIndex += 1;
          }

          setExpectedNoteIndex(nextIndex);
          setPlayedNotesInChord(new Map());
          setCurrentTime(referenceTime + NOTE_TIME_TOLERANCE);
        }
      } else {
        setScore((prev) => ({ ...prev, incorrect: prev.incorrect + 1 }));
        setConsecutiveWrong((prev) => {
          const newCount = prev + 1;
          if (newCount >= 5 && !showPianoHelp) {
            setShowPianoHelp(true);
          }
          return newCount;
        });
      }
    },
    [filteredNotes, expectedNoteIndex, isPlaying, playMode, playedNotesInChord, showPianoHelp]
  );

  // Register MIDI note handler
  useEffect(() => {
    onNote(handleMIDINote);
  }, [onNote, handleMIDINote]);

  const handleMIDILoaded = (midi: ParsedMIDI) => {
    setMidiData(midi);
    setSelectedTracks([]);
    setCurrentTime(0);
    setIsPlaying(false);
    setExpectedNoteIndex(0);
    setScore({ correct: 0, incorrect: 0, missed: 0 });
    setPlayedNotesInChord(new Map());
    setConsecutiveWrong(0);
    setShowPianoHelp(false);
  };

  const handlePlay = async () => {
    if (filteredNotes.length === 0) {
      alert('Please load a MIDI file and select at least one track');
      return;
    }
    if (playMode === 'practice' && !isConnected) {
      alert('Please connect to a Bluetooth MIDI device first for practice mode');
      return;
    }

    // Resume audio context (required by browsers)
    await resumeAudio();

    setIsPlaying(true);
    console.log('Playback started. Mode:', playMode, 'Notes:', filteredNotes.length);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setExpectedNoteIndex(0);
    setScore({ correct: 0, incorrect: 0, missed: 0 });
    setPlayedNotesInChord(new Map());
    setConsecutiveWrong(0);
    setShowPianoHelp(false);
  };

  const highlightedChordNotes = useMemo(() => {
    const current = filteredNotes[expectedNoteIndex];
    if (!current) {
      return [] as number[];
    }

    const referenceTime = current.time;
    return filteredNotes
      .filter((note) => timesAreClose(note.time, referenceTime, NOTE_TIME_TOLERANCE))
      .map((note) => note.midi);
  }, [filteredNotes, expectedNoteIndex]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Piano Sight-Reading Trainer</h1>
      </header>

      <div className="main-content">
        <div className="control-panel">
          <section className="bluetooth-section">
            <h2>Bluetooth MIDI</h2>
            {!isConnected ? (
              <button onClick={connect} className="btn-primary">
                Connect Bluetooth Device
              </button>
            ) : (
              <div>
                <p>Connected to: <strong>{deviceName}</strong></p>
                <button onClick={disconnect} className="btn-secondary">
                  Disconnect
                </button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
          </section>

          <section className="midi-section">
            <h2>MIDI File</h2>
            <MIDIFileLoader onMIDILoaded={handleMIDILoaded} />
            {midiData && (
              <div className="midi-info">
                <p><strong>File:</strong> {midiData.name}</p>
                <p><strong>Duration:</strong> {midiData.duration.toFixed(2)}s</p>
                <p><strong>Tracks:</strong> {midiData.tracks.length}</p>
              </div>
            )}
          </section>

          {midiData && midiData.tracks.length > 0 && (
            <section className="track-section">
              <TrackSelector
                tracks={midiData.tracks}
                selectedTracks={selectedTracks}
                onTracksChange={setSelectedTracks}
              />
            </section>
          )}

          <section className="settings-section">
            <h2>Settings</h2>

            <div className="setting-group">
              <label className="setting-label">Clef:</label>
              <div className="radio-group">
                <label className="radio-item">
                  <input
                    type="radio"
                    name="clef"
                    value="both"
                    checked={clefFilter === 'both'}
                    onChange={(e) => setClefFilter(e.target.value as ClefFilter)}
                  />
                  <span>Both</span>
                </label>
                <label className="radio-item">
                  <input
                    type="radio"
                    name="clef"
                    value="treble"
                    checked={clefFilter === 'treble'}
                    onChange={(e) => setClefFilter(e.target.value as ClefFilter)}
                  />
                  <span>Treble Only</span>
                </label>
                <label className="radio-item">
                  <input
                    type="radio"
                    name="clef"
                    value="bass"
                    checked={clefFilter === 'bass'}
                    onChange={(e) => setClefFilter(e.target.value as ClefFilter)}
                  />
                  <span>Bass Only</span>
                </label>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Mode:</label>
              <div className="radio-group">
                <label className="radio-item">
                  <input
                    type="radio"
                    name="mode"
                    value="practice"
                    checked={playMode === 'practice'}
                    onChange={(e) => setPlayMode(e.target.value as PlayMode)}
                  />
                  <span>Practice (Play correct notes to advance)</span>
                </label>
                <label className="radio-item">
                  <input
                    type="radio"
                    name="mode"
                    value="preview"
                    checked={playMode === 'preview'}
                    onChange={(e) => setPlayMode(e.target.value as PlayMode)}
                  />
                  <span>Preview (Auto-play with timing)</span>
                </label>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Display:</label>
              <label className="radio-item">
                <input
                  type="checkbox"
                  checked={showNoteNames}
                  onChange={(e) => setShowNoteNames(e.target.checked)}
                />
                <span>Show Note Names</span>
              </label>
            </div>

            <div className="setting-group">
              <label className="setting-label">Audio Preview (Piano Samples):</label>
              {!samplesLoaded && (
                <p style={{ color: '#f39c12', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  ⏳ Loading piano samples...
                </p>
              )}
              {samplesLoaded && (
                <p style={{ color: '#27ae60', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  ✓ Piano samples loaded
                </p>
              )}
              <div className="audio-controls">
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={toggleAudio}
                    className={`btn-small ${isAudioEnabled ? 'btn-primary' : 'btn-secondary'}`}
                    disabled={!samplesLoaded}
                  >
                    {isAudioEnabled ? '🔊 Sound On' : '🔇 Sound Off'}
                  </button>
                  <button
                    onClick={async () => {
                      await resumeAudio();
                      playNote(60, 0.5, 1); // Play middle C
                    }}
                    className="btn-small btn-secondary"
                    disabled={!samplesLoaded}
                  >
                    Test Sound
                  </button>
                </div>
                <div className="volume-control">
                  <label htmlFor="volume-slider">Volume:</label>
                  <input
                    id="volume-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={volume * 100}
                    onChange={(e) => setVolumeLevel(parseInt(e.target.value) / 100)}
                    disabled={!isAudioEnabled || !samplesLoaded}
                  />
                  <span className="volume-value">{Math.round(volume * 100)}%</span>
                </div>
              </div>
            </div>
          </section>

          <section className="playback-section">
            <h2>Playback</h2>
            <div className="playback-controls">
              {!isPlaying ? (
                <button onClick={handlePlay} className="btn-primary" disabled={filteredNotes.length === 0}>
                  Start
                </button>
              ) : (
                <button onClick={handlePause} className="btn-primary">
                  Pause
                </button>
              )}
              <button onClick={handleReset} className="btn-secondary">
                Reset
              </button>
            </div>
            <p>Time: {currentTime.toFixed(2)}s</p>
            <p>Note: {expectedNoteIndex + 1} / {filteredNotes.length}</p>
          </section>

          <section className="score-section">
            <ScoreDisplay {...score} />
          </section>
        </div>

        <div className="staff-section">
          {filteredNotes.length > 0 && midiData ? (
            <StaffRenderer
              notes={filteredNotes}
              expectedNoteIndex={expectedNoteIndex}
              clefFilter={clefFilter}
              playedNotesInChord={playedNotesInChord}
              showNoteNames={showNoteNames}
              noteTimeTolerance={NOTE_TIME_TOLERANCE}
              midiHeader={midiData.header}
              totalDuration={midiData.duration}
            />
          ) : (
            <div className="staff-placeholder">
              <p>Load a MIDI file and select tracks to begin</p>
            </div>
          )}
        </div>
      </div>

      {/* Piano keyboard help overlay */}
      {showPianoHelp && highlightedChordNotes.length > 0 && (
        <PianoKeyboard
          highlightedNotes={highlightedChordNotes}
          onClose={() => {
            setShowPianoHelp(false);
            setConsecutiveWrong(0);
          }}
        />
      )}
    </div>
  );
}

export default App;

