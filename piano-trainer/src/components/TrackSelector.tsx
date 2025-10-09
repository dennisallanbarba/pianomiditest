import React from 'react';
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

  return (
    <div className="track-selector">
      <h3>Select Tracks</h3>
      <div className="track-selector-controls">
        <button onClick={handleSelectAll} className="btn-small">
          Select All
        </button>
        <button onClick={handleDeselectAll} className="btn-small">
          Deselect All
        </button>
      </div>
      <div className="track-list">
        {tracks.map((track, index) => (
          <label key={index} className="track-item">
            <input
              type="checkbox"
              checked={selectedTracks.includes(index)}
              onChange={() => handleTrackToggle(index)}
            />
            <span className="track-name">
              {track.name} ({track.notes.length} notes)
              {track.instrument && ` - ${track.instrument}`}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
};
