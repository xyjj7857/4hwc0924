// Web Audio API based alarm sound synthesizer
import { AlarmSoundType } from '../types';

let activeOscillators: OscillatorNode[] = [];
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch (e) {
    console.warn('[AlarmAudio] Failed to initialize AudioContext:', e);
    return null;
  }
}

export function stopAlarmSound() {
  activeOscillators.forEach(osc => {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      // ignore
    }
  });
  activeOscillators = [];
}

export function playAlarmSound(
  soundType: AlarmSoundType = 'chime',
  volume = 0.8,
  isMuted = false
) {
  if (isMuted || volume <= 0) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  stopAlarmSound();

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(Math.min(Math.max(volume, 0.01), 1), now);
  masterGain.connect(ctx.destination);

  if (soundType === 'chime') {
    // 优雅的4音阶清脆和弦 (C6, E6, G6, C7)
    const frequencies = [1046.5, 1318.5, 1568.0, 2093.0];
    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      // Attack & decay
      const startTime = now + idx * 0.11;
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.exponentialRampToValueAtTime(0.35, startTime + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.2);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + 1.25);
      activeOscillators.push(osc);
    });
  } else if (soundType === 'radar') {
    // 雷达脉冲双声
    const times = [0, 0.22, 0.5];
    times.forEach(tOffset => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1174.66, now + tOffset);

      noteGain.gain.setValueAtTime(0.001, now + tOffset);
      noteGain.gain.linearRampToValueAtTime(0.4, now + tOffset + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + tOffset + 0.18);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(now + tOffset);
      osc.stop(now + tOffset + 0.2);
      activeOscillators.push(osc);
    });
  } else if (soundType === 'gentle') {
    // 柔和钟声
    const freqs = [880.0, 1174.66];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.2);

      const startTime = now + idx * 0.2;
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(0.28, startTime + 0.06);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.4);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + 1.45);
      activeOscillators.push(osc);
    });
  } else if (soundType === 'tri-tone') {
    // 经典三连音提示
    const freqs = [783.99, 987.77, 1318.51];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);

      const startTime = now + idx * 0.12;
      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(0.35, startTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.7);

      osc.connect(noteGain);
      noteGain.connect(masterGain);

      osc.start(startTime);
      osc.stop(startTime + 0.75);
      activeOscillators.push(osc);
    });
  }
}
