// A small synthesized piano: no samples, so nothing to download or cache.
// Each note is two slightly detuned harmonic oscillators through a lowpass that
// closes as the note decays (bright attack, mellow tail), with a two-stage
// volume envelope: a quick drop after the hammer strike, then a long ring.

// Relative strength of harmonics 1…10, a soft-piano spectrum.
const PARTIALS = [0, 1, .5, .3, .2, .12, .08, .05, .035, .02, .015];
const DETUNE_CENTS = 3;
const BASE_MIDI = 48; // keyboard key 0 is C3

let ctx = null;
let master = null;
let wave = null;
const voices = new Set();

function context() {
  if (!ctx) {
    // iOS: play even when the ring/silent switch is on, like any music app.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const compressor = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = .6;
    master.connect(compressor).connect(ctx.destination);
    wave = ctx.createPeriodicWave(new Float32Array(PARTIALS.length), Float32Array.from(PARTIALS));
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

function note(key, when, length, peak) {
  const midi = BASE_MIDI + key;
  const frequency = 440 * 2 ** ((midi - 69) / 12);
  // Lower strings ring longer.
  const ring = 1.4 * 2 ** (-(midi - 60) / 24);
  const end = when + length;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(peak, when + .005);
  gain.gain.setTargetAtTime(peak * .35, when + .005, .1);
  gain.gain.setTargetAtTime(0, when + .2, ring);
  gain.gain.setTargetAtTime(0, end, .08);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = .4;
  filter.frequency.setValueAtTime(Math.min(frequency * 12, 18000), when);
  filter.frequency.setTargetAtTime(Math.max(frequency * 2.5, 400), when, .5);

  filter.connect(gain).connect(master);
  const oscillators = [-DETUNE_CENTS, DETUNE_CENTS].map(detune => {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = frequency;
    osc.detune.value = detune;
    osc.connect(filter);
    osc.start(when);
    osc.stop(end + .6);
    return osc;
  });

  const voice = { gain, oscillators };
  voices.add(voice);
  oscillators[0].onended = () => {
    voices.delete(voice);
    gain.disconnect();
  };
}

/** Fades out everything that's sounding. */
export function stop() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const { gain, oscillators } of voices) {
    if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(now);
    else gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, .02);
    for (const osc of oscillators) osc.stop(now + .15);
  }
  voices.clear();
}

/** Plays keys one by one; returns the duration in ms. */
export function playSequence(keys, step = .26) {
  context();
  stop();
  const start = ctx.currentTime + .02;
  keys.forEach((key, index) => note(key, start + index * step, index === keys.length - 1 ? 1.4 : step * 2, .32));
  return ((keys.length - 1) * step + 1.4) * 1000;
}

/** Plays keys together; returns the duration in ms. */
export function playChord(keys, length = 1.8) {
  context();
  stop();
  const start = ctx.currentTime + .02;
  const peak = .45 / Math.sqrt(keys.length);
  for (const key of keys) note(key, start, length, peak);
  return length * 1000;
}
