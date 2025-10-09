import { useRef, useCallback, useEffect, useState } from 'react';

export const useAudioSynthesizer = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [volume, setVolume] = useState(0.3);

  // Initialize audio context
  useEffect(() => {
    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) {
      console.error('Web Audio API is not supported in this browser');
      return;
    }

    audioContextRef.current = new AudioContextCtor();
    masterGainRef.current = audioContextRef.current.createGain();
    masterGainRef.current.connect(audioContextRef.current.destination);
    masterGainRef.current.gain.value = 0.3; // Initial volume

    console.log('Audio context initialized:', audioContextRef.current.state);
    console.log('Master gain value:', masterGainRef.current.gain.value);

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Update volume
  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = isEnabled ? volume : 0;
    }
  }, [volume, isEnabled]);

  // Convert MIDI note number to frequency
  const midiToFrequency = (midi: number): number => {
    return 440 * Math.pow(2, (midi - 69) / 12);
  };

  // Play a note
  const playNote = useCallback((midiNote: number, duration = 0.5, velocity = 1) => {
    if (!audioContextRef.current || !masterGainRef.current || !isEnabled) return;

    const context = audioContextRef.current;

    // Resume audio context if suspended (required by browsers)
    if (context.state === 'suspended') {
      context.resume();
    }

    const now = context.currentTime;
    const frequency = midiToFrequency(midiNote);

    console.log('Playing note:', midiNote, 'frequency:', frequency, 'duration:', duration);

    // Create oscillator for the note
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const filterNode = context.createBiquadFilter();

    // Configure oscillator (sine wave for piano-like sound)
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;

    // Configure filter for warmer sound
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 2000;
    filterNode.Q.value = 1;

    // Configure envelope (ADSR)
    const attack = 0.01;
    const decay = 0.1;
    const sustain = 0.7;
    const release = 0.3;

    const peakGain = velocity * 0.8; // Increased from 0.3 to make it louder
    const sustainGain = peakGain * sustain;

    console.log('Note gain - peak:', peakGain, 'sustain:', sustainGain, 'master:', masterGainRef.current?.gain.value);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + attack);
    gainNode.gain.linearRampToValueAtTime(sustainGain, now + attack + decay);
    gainNode.gain.setValueAtTime(sustainGain, now + duration - release);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    // Connect nodes
    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(masterGainRef.current);

    // Start and stop
    oscillator.start(now);
    oscillator.stop(now + duration);

    // Clean up
    oscillator.onended = () => {
      oscillator.disconnect();
      filterNode.disconnect();
      gainNode.disconnect();
    };
  }, [isEnabled]);

  const toggleAudio = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const setVolumeLevel = useCallback((newVolume: number) => {
    setVolume(Math.max(0, Math.min(1, newVolume)));
  }, []);

  const resumeAudio = useCallback(async () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
      console.log('Audio context resumed');
    }
  }, []);

  return {
    playNote,
    isEnabled,
    volume,
    toggleAudio,
    setVolumeLevel,
    resumeAudio,
  };
};
