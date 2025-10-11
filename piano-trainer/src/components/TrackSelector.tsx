import React from 'react';
import {
  Box,
  Typography,
  Checkbox,
  FormControlLabel,
  Button,
  Divider
} from '@mui/material';
import { CheckBoxOutlineBlank, CheckBox } from '@mui/icons-material';
import type { MIDITrack } from '../types/midi';

interface TrackSelectorProps {
  tracks: MIDITrack[];
  selectedTracks: number[];
  onTracksChange: (trackIndices: number[]) => void;
}

export const TrackSelector: React.FC<TrackSelectorProps> = ({
  tracks,
  selectedTracks,
  onTracksChange,
}) => {
  const handleTrackToggle = (trackIndex: number) => {
    if (selectedTracks.includes(trackIndex)) {
      onTracksChange(selectedTracks.filter((i) => i !== trackIndex));
    } else {
      onTracksChange([...selectedTracks, trackIndex]);
    }
  };

  const handleSelectAll = () => {
    onTracksChange(tracks.map((_, index) => index));
  };

  const handleDeselectAll = () => {
    onTracksChange([]);
  };

  const allSelected = selectedTracks.length === tracks.length;
  const noneSelected = selectedTracks.length === 0;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 700,
            color: 'text.primary',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontSize: '0.8rem'
          }}
        >
          🎼 Tracks ({selectedTracks.length}/{tracks.length})
        </Typography>
      </Box>

      {/* Select/Deselect All */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
        <Button
          size="small"
          variant={allSelected ? "contained" : "outlined"}
          onClick={handleSelectAll}
          disabled={allSelected}
          fullWidth
          sx={{
            fontSize: '0.75rem',
            py: 0.5,
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: 2,
            }
          }}
        >
          Select All
        </Button>
        <Button
          size="small"
          variant={noneSelected ? "contained" : "outlined"}
          onClick={handleDeselectAll}
          disabled={noneSelected}
          fullWidth
          sx={{
            fontSize: '0.75rem',
            py: 0.5,
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: 2,
            }
          }}
        >
          Clear
        </Button>
      </Box>

      <Divider sx={{ mb: 1.5 }} />

      {/* Track List */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          maxHeight: 250,
          overflow: 'auto',
          pr: 0.5,
          '&::-webkit-scrollbar': {
            width: '6px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: 'rgba(0,0,0,0.2)',
            borderRadius: '3px',
          }
        }}
      >
        {tracks.map((track, index) => {
          const isSelected = selectedTracks.includes(index);
          return (
            <Box
              key={index}
              sx={{
                py: 0.75,
                px: 0.5,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:hover': {
                  bgcolor: 'action.hover',
                }
              }}
              onClick={() => handleTrackToggle(index)}
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={isSelected}
                    icon={<CheckBoxOutlineBlank />}
                    checkedIcon={<CheckBox />}
                    size="small"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, width: '100%' }}>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.85rem',
                        color: 'text.primary'
                      }}
                    >
                      {track.name || `Track ${index + 1}`}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: '0.7rem',
                        color: 'text.secondary',
                      }}
                    >
                      {track.notes.length} notes
                    </Typography>
                  </Box>
                }
                sx={{ m: 0, width: '100%' }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
