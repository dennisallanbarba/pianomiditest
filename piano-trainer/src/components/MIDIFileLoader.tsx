import React, { useRef } from 'react';
import type { ParsedMIDI } from '../types/midi';
import { parseMIDIFile } from '../utils/midiParser';
import { parseMusicXMLFile } from '../utils/musicXmlParser';
import { MusicFileIcon, XmlFileIcon } from './Icons';
import { Tooltip } from './Tooltip';

interface MIDIFileLoaderProps {
  onMIDILoaded: (midi: ParsedMIDI) => void;
}

export const MIDIFileLoader: React.FC<MIDIFileLoaderProps> = ({ onMIDILoaded }) => {
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
    } catch (error) {
      console.error('Error parsing music file:', error);
      alert('Failed to parse the selected file. Please ensure it is a valid file.');
    }
  };

  return (
    <div className="file-loader-buttons">
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

      <Tooltip text="Load MIDI file (.mid)">
        <button onClick={() => midiInputRef.current?.click()} className="icon-btn icon-btn-success">
          <MusicFileIcon />
          <span className="icon-btn-label">MIDI</span>
        </button>
      </Tooltip>

      <Tooltip text="Load MusicXML file (.xml/.mxl)">
        <button onClick={() => xmlInputRef.current?.click()} className="icon-btn icon-btn-success">
          <XmlFileIcon />
          <span className="icon-btn-label">XML</span>
        </button>
      </Tooltip>
    </div>
  );
};



