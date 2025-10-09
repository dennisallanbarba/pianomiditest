import React, { useRef } from 'react';
import type { ParsedMIDI } from '../types/midi';
import { parseMIDIFile } from '../utils/midiParser';
import { parseMusicXMLFile } from '../utils/musicXmlParser';

interface MIDIFileLoaderProps {
  onMIDILoaded: (midi: ParsedMIDI) => void;
}

export const MIDIFileLoader: React.FC<MIDIFileLoaderProps> = ({ onMIDILoaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const extension = file.name.split('.').pop()?.toLowerCase();

      let parsedMIDI: ParsedMIDI;
      if (extension === 'mid' || extension === 'midi') {
        parsedMIDI = await parseMIDIFile(file);
      } else if (extension === 'mxl' || extension === 'xml' || extension === 'musicxml') {
        parsedMIDI = await parseMusicXMLFile(file);
      } else {
        throw new Error('Unsupported file format. Please select a MIDI (.mid) or MusicXML (.mxl/.xml) file.');
      }

      onMIDILoaded(parsedMIDI);
    } catch (error) {
      console.error('Error parsing music file:', error);
      alert('Failed to parse the selected file. Please ensure it is a valid MIDI or MusicXML file.');
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="midi-file-loader">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,.mxl,.xml,.musicxml"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button onClick={handleClick} className="load-midi-btn">
        Load MIDI/MusicXML
      </button>
    </div>
  );
};



