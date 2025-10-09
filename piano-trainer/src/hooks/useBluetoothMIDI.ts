import { useState, useCallback, useRef } from 'react';
import { PIANO_KEYDOWN } from '../types/midi';

const BT_MIDI_SERVICE_UID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const MIDI_CHARACTERISTIC_UID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

export const useBluetoothMIDI = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const onNoteCallbackRef = useRef<((note: number, velocity: number) => void) | null>(null);

  const handleMIDIMessage = useCallback((event: Event) => {
    const target = event.target as unknown as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;

    const data: number[] = [];
    for (let i = 0; i < value.byteLength; i++) {
      data.push(value.getUint8(i));
    }

    // MIDI over Bluetooth LE format: [header, timestamp, status, data1, data2]
    // We're interested in note on/off messages
    if (data.length >= 5) {
      const status = data[2];
      const note = data[3];
      const velocity = data[4];

      // Only trigger on key down (note on with velocity > 0)
      if (status === PIANO_KEYDOWN && velocity > 0) {
        if (onNoteCallbackRef.current) {
          onNoteCallbackRef.current(note, velocity);
        }
      }
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      setError('');

      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API is not supported in this browser');
      }

      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [BT_MIDI_SERVICE_UID] }],
      });

      setDeviceName(device.name || 'Unknown Device');

      const server = await device.gatt?.connect();
      if (!server) {
        throw new Error('Failed to connect to GATT server');
      }

      const service = await server.getPrimaryService(BT_MIDI_SERVICE_UID);
      const characteristic = await service.getCharacteristic(MIDI_CHARACTERISTIC_UID);

      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', handleMIDIMessage);

      characteristicRef.current = characteristic;
      setIsConnected(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect';
      setError(errorMessage);
      console.error('Bluetooth MIDI connection error:', err);
    }
  }, [handleMIDIMessage]);

  const disconnect = useCallback(async () => {
    if (characteristicRef.current) {
      try {
        await characteristicRef.current.stopNotifications();
        characteristicRef.current.removeEventListener('characteristicvaluechanged', handleMIDIMessage);
        characteristicRef.current.service.device.gatt?.disconnect();
        characteristicRef.current = null;
      } catch (err) {
        console.error('Error disconnecting:', err);
      }
    }
    setIsConnected(false);
    setDeviceName('');
  }, [handleMIDIMessage]);

  const onNote = useCallback((callback: (note: number, velocity: number) => void) => {
    onNoteCallbackRef.current = callback;
  }, []);

  return {
    isConnected,
    deviceName,
    error,
    connect,
    disconnect,
    onNote,
  };
};
