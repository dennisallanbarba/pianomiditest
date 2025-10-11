import React, { useRef } from 'react';
import { Box, IconButton, Tooltip, Chip } from '@mui/material';
import { Bluetooth, BluetoothConnected, AudioFile, Code } from '@mui/icons-material';
import type { ParsedMIDI } from '../types/midi';
import { parseMIDIFile } from '../utils/midiParser';
import { parseMusicXMLFile } from '../utils/musicXmlParser';

interface CompactControlsProps {
  isConnected: boolean;
  deviceName: string;
  onConnect: () => void;
  onDisconnect: () => void;
  onMIDILoaded: (midi: ParsedMIDI) => void;
}

export const CompactControls: React.FC<CompactControlsProps> = ({
  isConnected,
  deviceName,
  onConnect,
  onDisconnect,
  onMIDILoaded,
}) => {
  const midiInputRef = useRef<HTMLInputElement>(null);
  const xmlInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, expectedType: 'midi' | 'xml') => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();

      let parsedMIDI: ParsedMIDI;
      if (expectedType === 'midi' && (extension === 'mid' || extension === 'midi')) {
        parsedMIDI = await parseMIDIFile(file);
      } else if (expectedType === 'xml' && (extension === 'mxl' || extension === 'xml' || extension === 'musicxml')) {
        parsedMIDI = await parseMusicXMLFile(file);
      } else {
        throw new Error(`Unsupported file format. Please select a ${expectedType === 'midi' ? 'MIDI (.mid)' : 'MusicXML (.mxl/.xml)'} file.`);
      }

      onMIDILoaded(parsedMIDI);
      // Reset input
      event.target.value = '';
    } catch (error) {
      console.error('Error parsing music file:', error);
      alert('Failed to parse the selected file. Please ensure it is a valid file.');
    }
  };

  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
      {/* Bluetooth Connection */}
      <Tooltip title={isConnected ? `Connected: ${deviceName}` : 'Connect Bluetooth MIDI'} arrow>
        <IconButton
          onClick={isConnected ? onDisconnect : onConnect}
          sx={{
            width: 40,
            height: 40,
            background: isConnected
              ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
              : 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
            color: 'white',
            border: isConnected ? '2px solid #4CAF50' : '2px solid #2196F3',
            position: 'relative',
            overflow: 'visible',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              background: isConnected
                ? 'linear-gradient(135deg, #45a049 0%, #4CAF50 100%)'
                : 'linear-gradient(135deg, #1976D2 0%, #2196F3 100%)',
              transform: 'scale(1.1) rotate(5deg)',
              boxShadow: isConnected ? '0 8px 16px rgba(76, 175, 80, 0.4)' : '0 8px 16px rgba(33, 150, 243, 0.4)',
            },
            '&:active': {
              transform: 'scale(0.95)',
            },
            animation: isConnected ? 'pulse 2s ease-in-out infinite, glow 2s ease-in-out infinite' : 'none',
            '@keyframes pulse': {
              '0%, 100%': {
                boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.7), 0 4px 12px rgba(76, 175, 80, 0.3)'
              },
              '50%': {
                boxShadow: '0 0 0 10px rgba(76, 175, 80, 0), 0 4px 12px rgba(76, 175, 80, 0.3)'
              },
            },
            '@keyframes glow': {
              '0%, 100%': {
                filter: 'brightness(1)'
              },
              '50%': {
                filter: 'brightness(1.2)'
              },
            },
            '&::before': isConnected ? {
              content: '""',
              position: 'absolute',
              top: -2,
              right: -2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              bgcolor: '#8BC34A',
              border: '2px solid white',
              animation: 'blink 1.5s ease-in-out infinite',
              '@keyframes blink': {
                '0%, 100%': { opacity: 1 },
                '50%': { opacity: 0.4 }
              }
            } : {}
          }}
        >
          {isConnected ? <BluetoothConnected /> : <Bluetooth />}
        </IconButton>
      </Tooltip>

      {isConnected && (
        <Chip
          label={deviceName}
          size="small"
          color="success"
          onDelete={onDisconnect}
          sx={{
            maxWidth: 150,
            animation: 'slideIn 0.3s ease-out',
            '@keyframes slideIn': {
              from: { opacity: 0, transform: 'translateX(-10px)' },
              to: { opacity: 1, transform: 'translateX(0)' }
            }
          }}
        />
      )}

      {/* File inputs */}
      <input
        ref={midiInputRef}
        type="file"
        accept=".mid,.midi"
        onChange={(e) => handleFileChange(e, 'midi')}
        style={{ display: 'none' }}
      />
      <input
        ref={xmlInputRef}
        type="file"
        accept=".mxl,.xml,.musicxml"
        onChange={(e) => handleFileChange(e, 'xml')}
        style={{ display: 'none' }}
      />

      {/* MIDI File Button */}
      <Tooltip title="Load MIDI file (.mid)" arrow>
        <IconButton
          color="primary"
          onClick={() => midiInputRef.current?.click()}
          sx={{
            width: 40,
            height: 40,
            bgcolor: 'primary.light',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              bgcolor: 'primary.main',
              color: 'white',
              transform: 'scale(1.1) rotate(-5deg)',
              boxShadow: 4,
            },
            '&:active': {
              transform: 'scale(0.95)',
            }
          }}
        >
          <AudioFile />
        </IconButton>
      </Tooltip>

      {/* XML File Button */}
      <Tooltip title="Load MusicXML file (.xml/.mxl)" arrow>
        <IconButton
          color="secondary"
          onClick={() => xmlInputRef.current?.click()}
          sx={{
            width: 40,
            height: 40,
            bgcolor: 'secondary.light',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              bgcolor: 'secondary.main',
              color: 'white',
              transform: 'scale(1.1) rotate(5deg)',
              boxShadow: 4,
            },
            '&:active': {
              transform: 'scale(0.95)',
            }
          }}
        >
          <Code />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
