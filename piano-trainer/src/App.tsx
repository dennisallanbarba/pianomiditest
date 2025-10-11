import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Paper, Chip, Tooltip, IconButton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { PlayArrow, Pause, Refresh, VolumeUp, VolumeOff, Visibility, Piano, FlagCircle, Clear } from '@mui/icons-material';
import { useBluetoothMIDI } from './hooks/useBluetoothMIDI';
import { usePianoSampler } from './hooks/usePianoSampler';
import { TrackSelector } from './components/TrackSelector';
import { StaffRenderer } from './components/StaffRenderer';
import { PianoKeyboard } from './components/PianoKeyboard';
import { CompactHeader } from './components/CompactHeader';
import { CompactControls } from './components/CompactControls';
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

  // Loop and seek state
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [loopMode, setLoopMode] = useState<'none' | 'setStart' | 'setEnd'>('none');

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

  // Auto-select all tracks when MIDI data is loaded, or restore from localStorage
  useEffect(() => {
    if (midiData && midiData.tracks.length > 0) {
      // Try to load saved track selections from localStorage
      const storageKey = `trackSelection_${midiData.name}`;
      const savedSelection = localStorage.getItem(storageKey);

      if (savedSelection) {
        try {
          const parsed = JSON.parse(savedSelection);
          // Validate that saved indices are still valid
          const validIndices = parsed.filter((idx: number) => idx >= 0 && idx < midiData.tracks.length);
          if (validIndices.length > 0) {
            setSelectedTracks(validIndices);
            return;
          }
        } catch (e) {
          console.warn('Failed to parse saved track selection:', e);
        }
      }

      // If no saved selection or invalid, select all tracks by default
      const allTrackIndices = midiData.tracks.map((_, index) => index);
      setSelectedTracks(allTrackIndices);
    }
  }, [midiData]);

  // Save track selections to localStorage whenever they change
  useEffect(() => {
    if (midiData && selectedTracks.length > 0) {
      const storageKey = `trackSelection_${midiData.name}`;
      localStorage.setItem(storageKey, JSON.stringify(selectedTracks));
    }
  }, [selectedTracks, midiData]);

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

  // Auto-play notes in PREVIEW mode - simple timing
  useEffect(() => {
    if (!isPlaying || playMode !== 'preview') return;

    const currentNote = filteredNotes[expectedNoteIndex];
    if (!currentNote) {
      setIsPlaying(false);
      return;
    }

    const referenceTime = currentNote.time;

    // Find all notes at the same time (chord)
    const chordNotes = filteredNotes.filter((n) =>
      timesAreClose(n.time, referenceTime, NOTE_TIME_TOLERANCE)
    );

    // Simple delay: just the time to next note
    const nextNoteIndex = expectedNoteIndex + chordNotes.length;
    const nextNote = filteredNotes[nextNoteIndex];
    const delayMs = nextNote ? (nextNote.time - referenceTime) * 1000 : 0;

    // Play immediately
    chordNotes.forEach((note) => {
      playNote(note.midi, note.duration, note.velocity / 127);
    });

    setScore((prev) => ({ ...prev, correct: prev.correct + chordNotes.length }));
    setCurrentTime(referenceTime);

    // Schedule next note
    const timeoutId = setTimeout(() => {
      // Handle looping
      if (loopStart !== null && loopEnd !== null && nextNoteIndex > loopEnd) {
        setExpectedNoteIndex(loopStart);
        setCurrentTime(filteredNotes[loopStart].time);
      } else {
        setExpectedNoteIndex(nextNoteIndex);
      }
    }, delayMs);

    return () => clearTimeout(timeoutId);
  }, [isPlaying, playMode, expectedNoteIndex, filteredNotes, playNote, loopStart, loopEnd]);

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

          // Handle looping - loop back after playing the last note in the range
          if (loopStart !== null && loopEnd !== null && nextIndex > loopEnd) {
            nextIndex = loopStart;
            setCurrentTime(filteredNotes[loopStart].time);
          } else {
            setCurrentTime(referenceTime + NOTE_TIME_TOLERANCE);
          }

          setExpectedNoteIndex(nextIndex);
          setPlayedNotesInChord(new Map());
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
    [filteredNotes, expectedNoteIndex, isPlaying, playMode, playedNotesInChord, showPianoHelp, loopStart, loopEnd]
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

  const handleStartPractice = async () => {
    if (filteredNotes.length === 0) {
      alert('Please load a MIDI file and select at least one track');
      return;
    }
    if (!isConnected) {
      alert('Please connect to a Bluetooth MIDI device first for practice mode');
      return;
    }

    // Resume audio context (required by browsers)
    await resumeAudio();

    setPlayMode('practice');
    setIsPlaying(true);
    console.log('Practice mode started. Notes:', filteredNotes.length);
  };

  const handleStartPreview = async () => {
    if (filteredNotes.length === 0) {
      alert('Please load a MIDI file and select at least one track');
      return;
    }

    // Resume audio context (required by browsers)
    await resumeAudio();

    setPlayMode('preview');
    setIsPlaying(true);
    console.log('Preview mode started. Notes:', filteredNotes.length);
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

  const handleClickNote = useCallback((noteIndex: number) => {
    if (noteIndex < 0 || noteIndex >= filteredNotes.length) return;

    if (loopMode === 'setStart') {
      setLoopStart(noteIndex);
      setLoopMode('none');
      // Automatically position playback at loop start
      setExpectedNoteIndex(noteIndex);
      setCurrentTime(filteredNotes[noteIndex].time);
      setPlayedNotesInChord(new Map());
    } else if (loopMode === 'setEnd') {
      setLoopEnd(noteIndex);
      setLoopMode('none');
    } else {
      // Normal click - seek to note
      setExpectedNoteIndex(noteIndex);
      setCurrentTime(filteredNotes[noteIndex].time);
      setPlayedNotesInChord(new Map());
    }
  }, [filteredNotes, loopMode]);

  const handleSetLoopStart = useCallback(() => {
    setLoopMode('setStart');
  }, []);

  const handleSetLoopEnd = useCallback(() => {
    setLoopMode('setEnd');
  }, []);

  const handleClearLoop = useCallback(() => {
    setLoopStart(null);
    setLoopEnd(null);
    setLoopMode('none');
  }, []);

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

  const hasLoadedNotes = filteredNotes.length > 0;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#f5f5f5' }}>
      {/* Compact Header with Logo and Score */}
      <CompactHeader
        {...score}
        fileName={midiData?.name}
        timeSignature={midiData?.header.timeSignatures[0] ? `${midiData.header.timeSignatures[0].timeSignature[0]}/${midiData.header.timeSignatures[0].timeSignature[1]}` : undefined}
        bpm={midiData?.header.tempos[0] ? Math.round(midiData.header.tempos[0].bpm) : undefined}
      />

      {/* Toolbar with controls */}
      <Paper
        elevation={3}
        sx={{
          px: 2,
          py: 1.5,
          borderRadius: 0,
          background: 'linear-gradient(to right, #f8f9fa, #ffffff)',
        }}
      >
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {/* Left: Playback controls */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {!isPlaying ? (
              <>
                <Tooltip title={!isConnected ? 'Connect Bluetooth device first' : 'Start Practice Mode'} arrow>
                  <span>
                    <IconButton
                      color="primary"
                      onClick={handleStartPractice}
                      disabled={!hasLoadedNotes || !isConnected}
                      sx={{
                        bgcolor: 'primary.light',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          bgcolor: 'primary.main',
                          color: 'white',
                          transform: 'scale(1.15)',
                          boxShadow: 6,
                        },
                        '&:active': {
                          transform: 'scale(0.95)',
                        },
                        '&:disabled': {
                          opacity: 0.5,
                        }
                      }}
                    >
                      <PlayArrow />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Start Preview Mode (Auto-play)" arrow>
                  <span>
                    <IconButton
                      color="secondary"
                      onClick={handleStartPreview}
                      disabled={!hasLoadedNotes}
                      sx={{
                        bgcolor: 'secondary.light',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          bgcolor: 'secondary.main',
                          color: 'white',
                          transform: 'scale(1.15)',
                          boxShadow: 6,
                        },
                        '&:active': {
                          transform: 'scale(0.95)',
                        },
                        '&:disabled': {
                          opacity: 0.5,
                        }
                      }}
                    >
                      <PlayArrow />
                    </IconButton>
                  </span>
                </Tooltip>
              </>
            ) : (
              <Tooltip title="Pause" arrow>
                <IconButton
                  color="warning"
                  onClick={handlePause}
                  sx={{
                    bgcolor: 'warning.light',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.7 },
                    },
                    '&:hover': {
                      bgcolor: 'warning.main',
                      color: 'white',
                      transform: 'scale(1.15)',
                      boxShadow: 6,
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    }
                  }}
                >
                  <Pause />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Reset" arrow>
              <IconButton
                onClick={handleReset}
                sx={{
                  bgcolor: 'grey.200',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    bgcolor: 'grey.400',
                    transform: 'rotate(-360deg) scale(1.1)',
                    boxShadow: 4,
                  },
                  '&:active': {
                    transform: 'scale(0.95)',
                  }
                }}
              >
                <Refresh />
              </IconButton>
            </Tooltip>

            <Chip
              label={playMode === 'practice' ? '🎹 Practice' : '👁️ Preview'}
              size="small"
              color={playMode === 'practice' ? 'primary' : 'secondary'}
              sx={{
                fontWeight: 600,
                transition: 'all 0.3s ease',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: 2 }
              }}
            />
            <Tooltip title="Current playback time" arrow>
              <Chip
                label={`⏱️ ${currentTime.toFixed(1)}s`}
                size="small"
                variant="outlined"
                sx={{
                  fontWeight: 500,
                  transition: 'all 0.3s ease',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 2 }
                }}
              />
            </Tooltip>
            <Tooltip title="Current note position / Total notes" arrow>
              <Chip
                label={`🎵 ${expectedNoteIndex + 1}/${filteredNotes.length}`}
                size="small"
                variant="outlined"
                sx={{
                  fontWeight: 500,
                  transition: 'all 0.3s ease',
                  '&:hover': { transform: 'translateY(-2px)', boxShadow: 2 }
                }}
              />
            </Tooltip>

            {/* Loop Controls */}
            {hasLoadedNotes && (
              <>
                <Box sx={{ width: '2px', height: '30px', bgcolor: 'grey.300', mx: 1 }} />
                <Tooltip title={loopMode === 'setStart' ? 'Click on score to set loop start' : 'Set loop start'} arrow>
                  <IconButton
                    onClick={handleSetLoopStart}
                    size="small"
                    sx={{
                      bgcolor: loopMode === 'setStart' ? '#7c3aed' : (loopStart !== null ? '#e9d5ff' : 'grey.100'),
                      color: loopMode === 'setStart' ? 'white' : '#7c3aed',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        bgcolor: loopMode === 'setStart' ? '#6d28d9' : '#ddd6fe',
                        transform: 'scale(1.1)',
                        boxShadow: 3,
                      },
                      '&:active': {
                        transform: 'scale(0.95)',
                      }
                    }}
                  >
                    <FlagCircle />
                  </IconButton>
                </Tooltip>
                <Tooltip title={loopMode === 'setEnd' ? 'Click on score to set loop end' : 'Set loop end'} arrow>
                  <IconButton
                    onClick={handleSetLoopEnd}
                    size="small"
                    sx={{
                      bgcolor: loopMode === 'setEnd' ? '#7c3aed' : (loopEnd !== null ? '#e9d5ff' : 'grey.100'),
                      color: loopMode === 'setEnd' ? 'white' : '#7c3aed',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      '&:hover': {
                        bgcolor: loopMode === 'setEnd' ? '#6d28d9' : '#ddd6fe',
                        transform: 'scale(1.1)',
                        boxShadow: 3,
                      },
                      '&:active': {
                        transform: 'scale(0.95)',
                      }
                    }}
                  >
                    <FlagCircle sx={{ transform: 'scaleX(-1)' }} />
                  </IconButton>
                </Tooltip>
                {(loopStart !== null || loopEnd !== null) && (
                  <Tooltip title="Clear loop" arrow>
                    <IconButton
                      onClick={handleClearLoop}
                      size="small"
                      sx={{
                        bgcolor: 'grey.100',
                        color: 'error.main',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        '&:hover': {
                          bgcolor: 'error.light',
                          color: 'white',
                          transform: 'scale(1.1)',
                          boxShadow: 3,
                        },
                        '&:active': {
                          transform: 'scale(0.95)',
                        }
                      }}
                    >
                      <Clear />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
          </Box>

          {/* Right: Connection and File controls */}
          <CompactControls
            isConnected={isConnected}
            deviceName={deviceName}
            onConnect={connect}
            onDisconnect={disconnect}
            onMIDILoaded={handleMIDILoaded}
          />
        </Box>
      </Paper>

      <Box sx={{ flex: 1, display: 'flex', gap: 2, p: 2, overflow: 'hidden', minHeight: 0 }}>
        {/* Left Sidebar - Controls */}
        <Paper
          elevation={4}
          sx={{
            width: 300,
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
            p: 2.5,
            overflow: 'auto',
            borderRadius: 3,
            background: 'linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: 8,
            }
          }}
        >
          {error && (
            <Chip
              label={error}
              color="error"
              size="small"
              sx={{
                maxWidth: '100%',
                animation: 'shake 0.5s ease-in-out',
                '@keyframes shake': {
                  '0%, 100%': { transform: 'translateX(0)' },
                  '25%': { transform: 'translateX(-5px)' },
                  '75%': { transform: 'translateX(5px)' }
                }
              }}
            />
          )}

          {/* Track Selector */}
          {midiData && midiData.tracks.length > 0 && (
            <Box
              sx={{
                animation: 'fadeIn 0.5s ease-out',
                '@keyframes fadeIn': {
                  from: { opacity: 0, transform: 'translateY(-10px)' },
                  to: { opacity: 1, transform: 'translateY(0)' }
                }
              }}
            >
              <TrackSelector
                tracks={midiData.tracks}
                selectedTracks={selectedTracks}
                onTracksChange={setSelectedTracks}
              />
            </Box>
          )}

          {/* Divider */}
          {midiData && midiData.tracks.length > 0 && (
            <Box
              sx={{
                width: '100%',
                height: '2px',
                background: 'linear-gradient(90deg, transparent, #e0e0e0, transparent)',
                my: 1
              }}
            />
          )}

          {/* Settings Section Title */}
          <Typography
            variant="subtitle2"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontSize: '0.8rem',
              mb: 1
            }}
          >
            ⚙️ Settings
          </Typography>

          {/* Clef Filter */}
          <Box>
            <Box sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'text.secondary',
              mb: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              🎼 Clef
            </Box>
            <ToggleButtonGroup
              value={clefFilter}
              exclusive
              onChange={(_, value) => value && setClefFilter(value)}
              size="small"
              fullWidth
              sx={{
                '& .MuiToggleButton-root': {
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 2,
                  },
                  '&.Mui-selected': {
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    }
                  }
                }
              }}
            >
              <ToggleButton value="both">Both</ToggleButton>
              <ToggleButton value="treble">Treble</ToggleButton>
              <ToggleButton value="bass">Bass</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {/* Display Options */}
          <Box>
            <Box sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'text.secondary',
              mb: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              👁️ Display
            </Box>
            <Tooltip title="Show note names on staff" arrow>
              <IconButton
                size="small"
                color={showNoteNames ? 'primary' : 'default'}
                onClick={() => setShowNoteNames(!showNoteNames)}
                sx={{
                  bgcolor: showNoteNames ? 'primary.light' : 'grey.100',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    transform: 'scale(1.1)',
                    boxShadow: 3,
                  },
                  '&:active': {
                    transform: 'scale(0.95)',
                  }
                }}
              >
                <Visibility />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Audio Controls */}
          <Box>
            <Box sx={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'text.secondary',
              mb: 0.5,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              🔊 Audio
            </Box>
            {!samplesLoaded && (
              <Chip
                label="Loading..."
                size="small"
                color="warning"
                sx={{
                  mb: 1,
                  animation: 'pulse 1.5s ease-in-out infinite',
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 1 },
                    '50%': { opacity: 0.6 }
                  }
                }}
              />
            )}
            {samplesLoaded && (
              <Chip
                label="✓ Ready"
                size="small"
                color="success"
                sx={{
                  mb: 1,
                  animation: 'bounceIn 0.5s ease-out',
                  '@keyframes bounceIn': {
                    '0%': { transform: 'scale(0)' },
                    '50%': { transform: 'scale(1.1)' },
                    '100%': { transform: 'scale(1)' }
                  }
                }}
              />
            )}

            <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
              <Tooltip title={isAudioEnabled ? "Mute" : "Unmute"} arrow>
                <IconButton
                  size="small"
                  onClick={toggleAudio}
                  disabled={!samplesLoaded}
                  color={isAudioEnabled ? 'primary' : 'default'}
                  sx={{
                    bgcolor: isAudioEnabled ? 'primary.light' : 'grey.100',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      transform: 'scale(1.1)',
                      boxShadow: 3,
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    }
                  }}
                >
                  {isAudioEnabled ? <VolumeUp /> : <VolumeOff />}
                </IconButton>
              </Tooltip>

              <Tooltip title="Test sound (Middle C)" arrow>
                <IconButton
                  size="small"
                  onClick={async () => {
                    await resumeAudio();
                    playNote(60, 0.5, 1);
                  }}
                  disabled={!samplesLoaded}
                  sx={{
                    bgcolor: 'grey.100',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    '&:hover': {
                      bgcolor: 'primary.light',
                      transform: 'scale(1.1)',
                      boxShadow: 3,
                    },
                    '&:active': {
                      transform: 'scale(0.95)',
                    }
                  }}
                >
                  <PlayArrow />
                </IconButton>
              </Tooltip>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1 }}>
              <VolumeOff fontSize="small" />
              <input
                type="range"
                min="0"
                max="100"
                value={volume * 100}
                onChange={(e) => setVolumeLevel(parseInt(e.target.value) / 100)}
                disabled={!isAudioEnabled || !samplesLoaded}
                style={{ flex: 1 }}
              />
              <VolumeUp fontSize="small" />
              <Box sx={{ minWidth: 35, fontSize: '0.75rem' }}>{Math.round(volume * 100)}%</Box>
            </Box>
          </Box>
        </Paper>

        {/* Staff Display */}
        <Paper
          elevation={4}
          sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
            borderRadius: 3,
            background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
            transition: 'all 0.3s ease',
            '&:hover': {
              boxShadow: 8,
            }
          }}
        >
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0, width: '100%' }}>
            {hasLoadedNotes && midiData ? (
              <Box
                sx={{
                  width: '100%',
                  animation: 'fadeIn 0.5s ease-out',
                  '@keyframes fadeIn': {
                    from: { opacity: 0 },
                    to: { opacity: 1 }
                  }
                }}
              >
                <StaffRenderer
                  notes={filteredNotes}
                  expectedNoteIndex={expectedNoteIndex}
                  clefFilter={clefFilter}
                  playedNotesInChord={playedNotesInChord}
                  showNoteNames={showNoteNames}
                  noteTimeTolerance={NOTE_TIME_TOLERANCE}
                  midiHeader={midiData.header}
                  totalDuration={midiData.duration}
                  loopStart={loopStart}
                  loopEnd={loopEnd}
                  loopMode={loopMode}
                  onClickNote={handleClickNote}
                />
              </Box>
            ) : (
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                width: '100%',
                height: '100%',
                color: 'text.secondary',
                fontSize: '1.1rem',
                animation: 'float 3s ease-in-out infinite',
                '@keyframes float': {
                  '0%, 100%': { transform: 'translateY(0)' },
                  '50%': { transform: 'translateY(-10px)' }
                }
              }}>
                <Piano sx={{ fontSize: 60, opacity: 0.3 }} />
                <Box sx={{ textAlign: 'center' }}>
                  Load a MIDI or MusicXML file to begin
                </Box>
              </Box>
            )}
          </Box>
        </Paper>
      </Box>

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
    </Box>
  );
}

export default App;
