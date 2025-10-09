import { useRef, useCallback, useState, useEffect } from 'react';
import * as Tone from 'tone';
import { midiToNoteName } from '../utils/noteUtils';

export const usePianoSampler = () => {
  const samplerRef = useRef<Tone.Sampler | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [volume, setVolume] = useState(1.0); // Set to maximum (100%)

  // Initialize sampler with piano samples
  useEffect(() => {
    // Using Salamander Grand Piano samples from a CDN
    // These are high-quality free piano samples
    const sampler = new Tone.Sampler({
      urls: {
        A0: "A0.mp3",
        C1: "C1.mp3",
        "D#1": "Ds1.mp3",
        "F#1": "Fs1.mp3",
        A1: "A1.mp3",
        C2: "C2.mp3",
        "D#2": "Ds2.mp3",
        "F#2": "Fs2.mp3",
        A2: "A2.mp3",
        C3: "C3.mp3",
        "D#3": "Ds3.mp3",
        "F#3": "Fs3.mp3",
        A3: "A3.mp3",
        C4: "C4.mp3",
        "D#4": "Ds4.mp3",
        "F#4": "Fs4.mp3",
        A4: "A4.mp3",
        C5: "C5.mp3",
        "D#5": "Ds5.mp3",
        "F#5": "Fs5.mp3",
        A5: "A5.mp3",
        C6: "C6.mp3",
        "D#6": "Ds6.mp3",
        "F#6": "Fs6.mp3",
        A6: "A6.mp3",
        C7: "C7.mp3",
        "D#7": "Ds7.mp3",
        "F#7": "Fs7.mp3",
        A7: "A7.mp3",
        C8: "C8.mp3"
      },
      release: 1,
      baseUrl: "https://tonejs.github.io/audio/salamander/",
      onload: () => {
        console.log('Piano samples loaded successfully!');
        setIsLoaded(true);
      }
    }).toDestination();

    sampler.volume.value = Tone.gainToDb(1.0) + 15; // Maximum volume with +15dB boost (3x louder)
    samplerRef.current = sampler;

    return () => {
      sampler.dispose();
    };
  }, []);

  // Update volume
  useEffect(() => {
    if (samplerRef.current) {
      samplerRef.current.volume.value = isEnabled ? Tone.gainToDb(volume) + 15 : -Infinity; // +15dB boost (3x louder)
    }
  }, [volume, isEnabled]);

  // Play a note
  const playNote = useCallback(async (midiNote: number, duration = 0.5, velocity = 1) => {
    if (!samplerRef.current || !isLoaded || !isEnabled) {
      console.log('Cannot play - sampler:', !!samplerRef.current, 'loaded:', isLoaded, 'enabled:', isEnabled);
      return;
    }

    // Start Tone.js audio context if needed
    if (Tone.context.state !== 'running') {
      await Tone.start();
      console.log('Tone.js context started');
    }

    const noteName = midiToNoteName(midiNote);
    const velocityGain = velocity * 10; // Massive increase - 10x velocity amplification

    console.log('Playing piano note:', noteName, 'midi:', midiNote, 'velocity:', velocityGain);

    samplerRef.current.triggerAttackRelease(noteName, duration, undefined, velocityGain);
  }, [isLoaded, isEnabled]);

  const toggleAudio = useCallback(() => {
    setIsEnabled((prev) => !prev);
  }, []);

  const setVolumeLevel = useCallback((newVolume: number) => {
    setVolume(Math.max(0, Math.min(1, newVolume)));
  }, []);

  const resumeAudio = useCallback(async () => {
    if (Tone.context.state !== 'running') {
      await Tone.start();
      console.log('Tone.js audio context resumed');
    }
  }, []);

  return {
    playNote,
    isEnabled,
    isLoaded,
    volume,
    toggleAudio,
    setVolumeLevel,
    resumeAudio,
  };
};

