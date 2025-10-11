import React from 'react';
import { AppBar, Toolbar, Box, Chip, Typography, Tooltip } from '@mui/material';
import { CheckCircle, Cancel, DoNotDisturb, Piano } from '@mui/icons-material';

interface CompactHeaderProps {
  correct: number;
  incorrect: number;
  missed: number;
  fileName?: string;
  timeSignature?: string;
  bpm?: number;
}

export const CompactHeader: React.FC<CompactHeaderProps> = ({ correct, incorrect, missed, fileName, timeSignature, bpm }) => {
  return (
    <AppBar
      position="static"
      elevation={2}
      sx={{
        bgcolor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        transition: 'all 0.3s ease',
      }}
    >
      <Toolbar variant="dense" sx={{ minHeight: 56, gap: 2, justifyContent: 'space-between', px: 3, flexWrap: 'wrap' }}>
        {/* Logo with animation */}
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          transition: 'transform 0.3s ease',
          '&:hover': {
            transform: 'scale(1.05)',
          }
        }}>
          <Piano
            sx={{
              fontSize: 36,
              color: 'white',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.05)' },
              }
            }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <Typography
              variant="h6"
              sx={{
                color: 'white',
                fontWeight: 700,
                letterSpacing: '0.5px',
                lineHeight: 1.2,
              }}
            >
              {fileName || 'Piano Trainer'}
            </Typography>
            {(timeSignature || bpm) && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                {timeSignature && (
                  <Tooltip title="Time Signature" arrow>
                    <Chip
                      label={timeSignature}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        fontWeight: 600,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
                      }}
                    />
                  </Tooltip>
                )}
                {bpm && (
                  <Tooltip title="Tempo (Beats Per Minute)" arrow>
                    <Chip
                      label={`${bpm} BPM`}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: '0.7rem',
                        bgcolor: 'rgba(255,255,255,0.2)',
                        color: 'white',
                        fontWeight: 600,
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' }
                      }}
                    />
                  </Tooltip>
                )}
              </Box>
            )}
          </Box>
        </Box>

        {/* Score chips with animations and tooltips */}
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip title="Correct notes played" arrow>
            <Chip
              icon={<CheckCircle />}
              label={correct}
              color="success"
              size="small"
              sx={{
                fontWeight: 700,
                minWidth: 70,
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 3,
                }
              }}
            />
          </Tooltip>
          <Tooltip title="Incorrect notes played" arrow>
            <Chip
              icon={<Cancel />}
              label={incorrect}
              color="error"
              size="small"
              sx={{
                fontWeight: 700,
                minWidth: 70,
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 3,
                }
              }}
            />
          </Tooltip>
          <Tooltip title="Missed notes (not played in time)" arrow>
            <Chip
              icon={<DoNotDisturb />}
              label={missed}
              color="warning"
              size="small"
              sx={{
                fontWeight: 700,
                minWidth: 70,
                fontSize: '0.9rem',
                transition: 'all 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 3,
                }
              }}
            />
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
