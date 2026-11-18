// Music theory helpers: note spelling, scales, chords and diatonic degrees.
// Notes are { letter, pitch, name }: letter is 0–6 (C–B), pitch is 0–11.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS = new Map([[-2, '𝄫'], [-1, '♭'], [0, ''], [1, '♯'], [2, '𝄪']]);

const mod = (value, base) => ((value % base) + base) % base;

/** Spells `pitch` on `letter`, e.g. spell(1, 1) → D♭, spell(0, 1) → C♯. */
export function spell(letter, pitch) {
  const l = mod(letter, 7);
  const p = mod(pitch, 12);
  let offset = mod(p - NATURAL_PITCHES[l], 12);
  if (offset > 6) offset -= 12;
  return { letter: l, pitch: p, name: LETTERS[l] + (ACCIDENTALS.get(offset) ?? '') };
}

export const ROOTS = [
  [0, 0], [1, 1, 0], [1, 2], [2, 3, 1], [2, 4], [3, 5],
  [4, 6, 3], [4, 7], [5, 8, 4], [5, 9], [6, 10, 5], [6, 11]
].map(([letter, pitch, alternate]) => ({
  ...spell(letter, pitch),
  alternate: alternate === undefined ? null : spell(alternate, pitch)
}));

export const MODES = [
  { name: 'Major · Ionian', steps: [0, 2, 4, 5, 7, 9, 11], highlight: true },
  { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Minor · Aeolian', steps: [0, 2, 3, 5, 7, 8, 10], highlight: true },
  { name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] }
];

/** The seven notes of `mode` starting on `root`, one per letter. */
export function spellScale(root, mode) {
  return mode.steps.map((step, index) => spell(root.letter + index, root.pitch + step));
}

/** Picks the enharmonic root (e.g. G♭ vs F♯) that needs the fewest accidentals. */
export function preferredRoot(root, mode) {
  if (!root.alternate) return root;
  const cost = candidate => spellScale(candidate, mode).reduce((total, note) => {
    if (/[𝄪𝄫]/u.test(note.name)) return total + 4;
    return total + (note.name.length > 1 ? 1 : 0);
  }, 0);
  return cost(root.alternate) < cost(root) ? root.alternate : root;
}

// Chord tones are [semitones above root, chord degree]; the degree drives the spelling.
export const QUALITIES = [
  { id: 'maj', symbol: '', tones: [[0, 1], [4, 3], [7, 5]] },
  { id: 'min', symbol: 'min', tones: [[0, 1], [3, 3], [7, 5]] },
  { id: 'dim', symbol: 'dim', tones: [[0, 1], [3, 3], [6, 5]] },
  { id: 'aug', symbol: 'aug', tones: [[0, 1], [4, 3], [8, 5]] },
  { id: 'sus2', symbol: 'sus2', tones: [[0, 1], [2, 2], [7, 5]] },
  { id: 'sus4', symbol: 'sus4', tones: [[0, 1], [5, 4], [7, 5]] },
  { id: '6', symbol: '6', tones: [[0, 1], [4, 3], [7, 5], [9, 6]] },
  { id: 'min6', symbol: 'min6', tones: [[0, 1], [3, 3], [7, 5], [9, 6]] },
  { id: '7', symbol: '7', tones: [[0, 1], [4, 3], [7, 5], [10, 7]] },
  { id: 'maj7', symbol: 'maj7', tones: [[0, 1], [4, 3], [7, 5], [11, 7]] },
  { id: 'min7', symbol: 'min7', tones: [[0, 1], [3, 3], [7, 5], [10, 7]] },
  { id: 'm7♭5', symbol: 'm7♭5', tones: [[0, 1], [3, 3], [6, 5], [10, 7]] },
  { id: 'dim7', symbol: 'dim7', tones: [[0, 1], [3, 3], [6, 5], [9, 7]] },
  { id: 'minMaj7', symbol: 'minMaj7', tones: [[0, 1], [3, 3], [7, 5], [11, 7]] },
  { id: '7sus4', symbol: '7sus4', tones: [[0, 1], [5, 4], [7, 5], [10, 7]] },
  { id: '9', symbol: '9', tones: [[0, 1], [4, 3], [7, 5], [10, 7], [14, 9]] },
  { id: 'maj9', symbol: 'maj9', tones: [[0, 1], [4, 3], [7, 5], [11, 7], [14, 9]] },
  { id: 'min9', symbol: 'min9', tones: [[0, 1], [3, 3], [7, 5], [10, 7], [14, 9]] }
];

export const ALTERATIONS = [
  { id: 'none', symbol: '' },
  { id: 'add9', symbol: 'add9', add: [14, 9] },
  { id: 'add11', symbol: 'add11', add: [17, 11] },
  { id: 'add13', symbol: 'add13', add: [21, 13] },
  { id: '♭9', symbol: '♭9', add: [13, 9] },
  { id: '♯9', symbol: '♯9', add: [15, 9] },
  { id: '♯11', symbol: '♯11', add: [18, 11] },
  { id: '♭13', symbol: '♭13', add: [20, 13] },
  { id: '♭5', symbol: '♭5', fifth: [6, 5] },
  { id: '♯5', symbol: '♯5', fifth: [8, 5] }
];

const QUALITY_BY_ID = new Map(QUALITIES.map(quality => [quality.id, quality]));
const ALTERATION_BY_ID = new Map(ALTERATIONS.map(alteration => [alteration.id, alteration]));

export const isQuality = id => QUALITY_BY_ID.has(id);
export const isAlteration = id => ALTERATION_BY_ID.has(id);

/** A chord is { root: note, quality: id, alteration: id }. */
export function chordName({ root, quality, alteration }) {
  return root.name + QUALITY_BY_ID.get(quality).symbol + ALTERATION_BY_ID.get(alteration).symbol;
}

/**
 * Spelled chord tones in close position: every tone sits within the octave
 * above the root, so a chord always fits the two-octave keyboard.
 */
export function chordNotes({ root, quality, alteration }) {
  const alt = ALTERATION_BY_ID.get(alteration);
  let tones = QUALITY_BY_ID.get(quality).tones;
  if (alt.fifth) tones = tones.map(tone => (tone[1] === 5 ? alt.fifth : tone));
  if (alt.add) tones = [...tones, alt.add];

  const seen = new Set();
  return tones
    .map(([semitones, degree]) => ({
      ...spell(root.letter + degree - 1, root.pitch + semitones),
      key: root.pitch + mod(semitones, 12),
      isRoot: degree === 1
    }))
    .filter(note => !seen.has(note.key) && seen.add(note.key))
    .sort((a, b) => a.key - b.key);
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

// How a first chord is heard as "I": which scale its key uses and which
// curated variation table applies. Anything else gets the generic list.
const TONIC = {
  maj: 'major', 6: 'major', maj7: 'major', maj9: 'major',
  min: 'minor', min6: 'minor', min7: 'minor', minMaj7: 'minor', min9: 'minor'
};
const OTHER_TONIC_MODE = { 7: 4, 9: 4, sus2: 4, sus4: 4, '7sus4': 4, aug: 3, dim: 6, 'm7♭5': 6, dim7: 6 };
const MODE_OF_FAMILY = { major: 0, minor: 5 };

// Curated per-degree variations (beyond Diatonic), the ones musicians actually reach for.
// q: quality, alt: alteration, shift: semitones to move the root, note: why it works.
const CURATED = {
  minor: [
    /* i   */ [{ q: 'minMaj7' }, { q: 'min6' }, { q: 'min9' }],
    /* ii  */ [{ q: 'min7', note: 'Dorian' }, { q: '7', note: 'pulls to v' }],
    /* III */ [{ q: '7', note: 'pulls to VI' }],
    /* iv  */ [{ q: '7', note: 'Dorian, funky' }, { q: 'min6' }],
    /* v   */ [{ q: '7', note: 'pulls to i' }, { q: '7sus4' }, { q: '7', alt: '♭9' }],
    /* VI  */ [{ q: '7', note: 'bluesy' }, { q: 'm7♭5', shift: 1, note: 'Dorian' }],
    /* VII */ [{ q: 'maj7', note: 'Dorian' }, { q: 'dim7', shift: 1, note: 'leading tone' }]
  ],
  major: [
    /* I   */ [{ q: '6' }, { q: 'maj9' }, { q: '7', note: 'pulls to IV' }],
    /* ii  */ [{ q: '7', note: 'pulls to V' }, { q: 'm7♭5', note: 'borrowed' }],
    /* iii */ [{ q: '7', note: 'pulls to vi' }],
    /* IV  */ [{ q: 'min6', note: 'borrowed' }, { q: 'min7', note: 'borrowed' }, { q: '7', note: 'bluesy' }],
    /* V   */ [{ q: '7sus4' }, { q: '9' }, { q: '7', alt: '♭9' }],
    /* vi  */ [{ q: '7', note: 'pulls to ii' }],
    /* vii */ [{ q: 'dim7' }]
  ]
};

const GENERIC = [
  { label: 'Dominant 7', q: '7' },
  { label: 'Triad', note: 'no 7th', shape: 'triad' },
  { label: 'sus4', q: 'sus4' },
  { label: 'Add 9', shape: 'triad', alt: 'add9' }
];

const hasSeventh = quality => QUALITY_BY_ID.get(quality).tones.some(([, degree]) => degree === 7);
const isStackedThirds = quality => quality.tones.every(([, degree], index) => degree === index * 2 + 1);
const STACKED = QUALITIES.filter(isStackedThirds);

function keyOf(base) {
  const family = TONIC[base.quality] ?? 'other';
  const mode = MODE_OF_FAMILY[family] ?? OTHER_TONIC_MODE[base.quality];
  return { family, scale: spellScale(base.root, MODES[mode]) };
}

/** The chord built in thirds on `degree` of `scale`, as a triad (3) or seventh (4). */
function stacked(scale, degree, size) {
  const root = scale[degree];
  const intervals = Array.from({ length: size }, (_, i) => mod(scale[(degree + i * 2) % 7].pitch - root.pitch, 12));
  const match = STACKED.find(quality =>
    quality.tones.length === size && quality.tones.every(([semitones], i) => semitones === intervals[i]));
  return { root, quality: match?.id ?? 'maj', alteration: 'none' };
}

function build(scale, degree, spec, diatonicSize) {
  if (!spec.q) {
    const chord = stacked(scale, degree, spec.shape === 'triad' ? 3 : diatonicSize);
    return spec.alt ? { ...chord, alteration: spec.alt } : chord;
  }
  const { letter, pitch } = scale[degree];
  return { root: spell(letter, pitch + (spec.shift ?? 0)), quality: spec.q, alteration: spec.alt ?? 'none' };
}

const specLabel = spec => spec.label ?? (QUALITY_BY_ID.get(spec.q).symbol || 'maj') + (spec.alt ?? '');

/**
 * Degrees of the key the first chord implies, each with its curated variations.
 * Numerals are cased by the diatonic triad (i, ii, III …); variation 0 is always Diatonic.
 */
export function degreesOf(base) {
  const { family, scale } = keyOf(base);
  const size = hasSeventh(base.quality) ? 4 : 3;
  return ROMAN.map((roman, degree) => {
    const triad = stacked(scale, degree, 3).quality;
    const specs = [{ label: 'Diatonic' }, ...(CURATED[family]?.[degree] ?? GENERIC)];
    const seen = new Set();
    const variations = specs
      .map(spec => ({ label: specLabel(spec), note: spec.note ?? '', chord: build(scale, degree, spec, size) }))
      .filter(({ chord }) => !seen.has(chordName(chord)) && seen.add(chordName(chord)));
    return { numeral: triad === 'min' || triad === 'dim' ? roman.toLowerCase() : roman, variations };
  });
}
