# Piano Sight-Reading Trainer

A React-TypeScript application for training piano sight-reading skills using real MIDI files and Bluetooth MIDI connectivity.

## Features

- **Bluetooth MIDI Connection**: Connect your piano or keyboard via Bluetooth MIDI
- **MIDI & MusicXML Support**: Load MIDI (.mid/.midi) or compressed MusicXML (.mxl/.xml) scores from your computer
- **Multi-Track Selection**: Select which tracks to practice from the MIDI file
- **Automatic Clef Assignment**: Notes are automatically placed in treble or bass clef based on pitch
- **Scrolling Notation**: Notes scroll from right to left like a rhythm game
- **Manual Navigation**: Drag the staff left or right to rewind or skip sections
- **Real-time Feedback**: Get immediate feedback on correct, incorrect, and missed notes
- **Score Tracking**: Track your accuracy with detailed statistics

## Requirements

- Node.js 20.10.0 or higher
- A Bluetooth MIDI-enabled piano/keyboard or MIDI device
- A browser that supports Web Bluetooth API (Chrome, Edge, Opera)
- MIDI files (.mid or .midi) or MusicXML files (.mxl/.xml)

## Installation

```bash
cd piano-trainer
npm install
```

## Running the Application

```bash
npm run dev
```

The application will open at `http://localhost:5173` (or another port if 5173 is in use).

## How to Use

1. **Connect Bluetooth MIDI Device**
   - Click "Connect Bluetooth Device"
   - Select your piano/keyboard from the browser's Bluetooth pairing dialog
   - Once connected, you'll see the device name

2. **Load a MIDI or MusicXML File**
   - Click "Load MIDI/MusicXML"
   - Select a .mid, .midi, .mxl, or .xml file from your computer
   - The file will be parsed and track information will display

3. **Select Tracks**
   - Choose which tracks from the MIDI file you want to practice
   - You can select multiple tracks - they'll be merged and sorted by time
   - Use "Select All" or "Deselect All" for convenience

4. **Start Playing**
   - Click "Start" to begin the sight-reading exercise
   - Notes will scroll from right to left
   - Play the correct keys on your piano when notes reach the red line (hit zone)
   - The game will only progress when you play the correct note

5. **Manual Navigation**
   - You can drag the staff left or right to manually navigate through the piece
   - This is useful for practicing specific sections

6. **Track Your Progress**
   - View your score in real-time:
     - **Correct**: Notes played correctly
     - **Incorrect**: Wrong notes played
     - **Missed**: Notes that scrolled past without being played
     - **Accuracy**: Your overall accuracy percentage

## Technical Details

### Project Structure

```
piano-trainer/
├── src/
│   ├── components/
│   │   ├── MIDIFileLoader.tsx      # MIDI file loading component
│   │   ├── TrackSelector.tsx       # Track selection UI
│   │   ├── StaffRenderer.tsx       # VexFlow staff rendering
│   │   └── ScoreDisplay.tsx        # Score statistics display
│   ├── hooks/
│   │   └── useBluetoothMIDI.ts     # Bluetooth MIDI connection hook
│   ├── types/
│   │   ├── bluetooth-midi.d.ts     # Bluetooth type definitions
│   │   └── midi.ts                 # MIDI type definitions
│   ├── utils/
│   │   └── midiParser.ts           # MIDI file parsing utilities
│   ├── App.tsx                     # Main application component
│   └── App.css                     # Application styles
```

### Libraries Used

- **React + TypeScript**: UI framework
- **Vite**: Build tool and dev server
- **VexFlow**: Music notation rendering
- **@tonejs/midi**: MIDI file parsing
- **JSZip**: Decompression for compressed MusicXML (.mxl) files
- **Web Bluetooth API**: Bluetooth MIDI connectivity

## Browser Compatibility

The Web Bluetooth API is required for this application. It's supported in:
- Google Chrome (desktop & Android)
- Microsoft Edge
- Opera

**Not supported in:**
- Firefox
- Safari
- iOS browsers

For testing without a Bluetooth device, you'll need to add keyboard input support or use a MIDI loopback device.

## Troubleshooting

### Bluetooth Connection Issues
- Ensure your device is in pairing mode
- Make sure Bluetooth is enabled on your computer
- Try refreshing the page and reconnecting
- Some devices may require a specific pairing procedure

### File Parsing Errors
- Ensure the file is a valid MIDI (.mid/.midi) or MusicXML (.mxl/.xml) score
- Some complex scores may include advanced notation not yet supported
- Try a different file to verify the application is working

### Performance Issues
- Long MIDI files with many notes may impact performance
- Try selecting fewer tracks or shorter sections
- Close other browser tabs to free up resources

## Future Enhancements

- Add metronome functionality
- Support for custom scroll speeds
- Practice mode with specific sections
- Difficulty settings (note density, speed)
- Better VexFlow integration for proper music notation
- Support for keyboard input (for testing without MIDI device)
- Record and playback performance
- Export statistics

## License

MIT
