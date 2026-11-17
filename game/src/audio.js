// Sound, synthesized live with WebAudio: no audio files to ship, no network, and every
// effect is a few oscillators or a burst of filtered noise. The context is created on the
// first user gesture (browsers block audio before one); M toggles mute.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  /** Unlock audio from a user gesture; call from keydown / pointerdown. */
  function unlock() {
    if (!ensure()) return;
    if (context.state === 'suspended') context.resume().catch(() => {});
  }

  function tone(freqFrom, freqTo, seconds, type, volume, when = 0) {
    if (!ensure() || muted) return;
    const start = context.currentTime + when;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freqFrom), start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), start + seconds);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.02);
  }

  function noise(seconds, volume, freq) {
    if (!ensure() || muted) return;
    const start = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  return {
    unlock,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    shoot() {
      tone(920, 320, 0.07, 'square', 0.05);
    },
    explosion(big) {
      noise(big ? 0.35 : 0.2, big ? 0.5 : 0.3, big ? 900 : 1400);
      tone(big ? 160 : 220, 40, big ? 0.3 : 0.18, 'sawtooth', 0.16);
    },
    pickup(step) {
      // The pickup ping climbs with the combo step, so a chain sounds like it rises.
      const base = 520 + Math.min(step, 12) * 42;
      tone(base, base * 1.6, 0.09, 'sine', 0.14);
    },
    hit() {
      tone(200, 55, 0.28, 'sawtooth', 0.3);
      noise(0.18, 0.3, 700);
    },
    dash() {
      noise(0.12, 0.12, 3200);
      tone(300, 900, 0.12, 'sine', 0.06);
    },
    powerup() {
      tone(440, 440, 0.09, 'triangle', 0.16);
      tone(660, 660, 0.09, 'triangle', 0.16, 0.09);
      tone(880, 880, 0.14, 'triangle', 0.16, 0.18);
    },
    wave() {
      tone(392, 392, 0.1, 'triangle', 0.14);
      tone(523, 523, 0.1, 'triangle', 0.14, 0.1);
      tone(659, 659, 0.18, 'triangle', 0.14, 0.2);
    },
  };
}
