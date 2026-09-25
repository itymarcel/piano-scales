const roots = [
  { name: 'C', pitch: 0 }, { name: 'D♭', alternate: 'C♯', pitch: 1 },
  { name: 'D', pitch: 2 }, { name: 'E♭', alternate: 'D♯', pitch: 3 },
  { name: 'E', pitch: 4 }, { name: 'F', pitch: 5 },
  { name: 'G♭', alternate: 'F♯', pitch: 6 }, { name: 'G', pitch: 7 },
  { name: 'A♭', alternate: 'G♯', pitch: 8 }, { name: 'A', pitch: 9 },
  { name: 'B♭', alternate: 'A♯', pitch: 10 }, { name: 'B', pitch: 11 }
];

const modes = [
  { name: 'Major · Ionian', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Minor · Aeolian', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10] }
];

const naturalPitches = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const letters = Object.keys(naturalPitches);
const whiteKeys = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const blackKeys = [
  { pitch: 1, after: 1 }, { pitch: 3, after: 2 },
  { pitch: 6, after: 4 }, { pitch: 8, after: 5 },
  { pitch: 10, after: 6 }, { pitch: 13, after: 8 },
  { pitch: 15, after: 9 }, { pitch: 18, after: 11 },
  { pitch: 20, after: 12 }, { pitch: 22, after: 13 }
];

function savedIndex(name, limit) {
  try {
    const value = Number(localStorage.getItem(name));
    return Number.isInteger(value) && value >= 0 && value < limit ? value : 0;
  } catch { return 0; }
}

let rootIndex = savedIndex('scale-root', roots.length);
let modeIndex = savedIndex('scale-mode', modes.length);

function spellNotes(root, mode) {
  const firstLetter = letters.indexOf(root.name[0]);
  return mode.steps.map((step, index) => {
    const letter = letters[(firstLetter + index) % 7];
    const pitch = (root.pitch + step) % 12;
    const difference = (pitch - naturalPitches[letter] + 12) % 12;
    const accidental = difference === 1 ? '♯' : difference === 11 ? '♭' : difference === 2 ? '𝄪' : difference === 10 ? '𝄫' : '';
    return { pitch, label: letter + accidental };
  });
}

function chooseRoot(root, mode) {
  if (!root.alternate) return root;
  const score = name => spellNotes({ ...root, name }, mode).reduce((total, note) => {
    return total + (note.label.includes('𝄪') || note.label.includes('𝄫') ? 4 : note.label.length > 1 ? 1 : 0);
  }, 0);
  return score(root.alternate) < score(root.name) ? { ...root, name: root.alternate } : root;
}

function makeKey(pitch, kind, scaleKeys, after) {
  const key = document.createElement('div');
  key.className = `${kind}-key`;
  if (scaleKeys.some(note => note.pitch === pitch)) key.classList.add('is-active');
  if (kind === 'black') key.style.left = `${after / whiteKeys.length * 100}%`;
  const label = document.createElement('span');
  label.className = 'key-label';
  label.textContent = scaleKeys.find(note => note.pitch === pitch)?.label || '';
  key.append(label);
  return key;
}

function render() {
  const mode = modes[modeIndex];
  const root = chooseRoot(roots[rootIndex], mode);
  const notes = spellNotes(root, mode);
  const scaleKeys = [
    ...notes.map((note, index) => ({ pitch: root.pitch + mode.steps[index], label: note.label })),
    { pitch: root.pitch + 12, label: notes[0].label }
  ];
  const modeName = document.getElementById('mode-name');
  modeName.textContent = mode.name;
  modeName.classList.toggle('is-major-minor', modeIndex === 0 || modeIndex === 5);
  document.getElementById('key-name').textContent = root.name;
  document.title = `${root.name} ${mode.name} · Scales`;

  const keyboard = document.getElementById('keyboard');
  keyboard.setAttribute('aria-label', `${root.name} ${mode.name}: ${scaleKeys.map(note => note.label).join(', ')}`);
  keyboard.replaceChildren(
    ...whiteKeys.map(pitch => makeKey(pitch, 'white', scaleKeys)),
    ...blackKeys.map(({ pitch, after }) => makeKey(pitch, 'black', scaleKeys, after))
  );
}

function move(which, amount) {
  if (which === 'root') {
    rootIndex = (rootIndex + amount + roots.length) % roots.length;
  } else {
    modeIndex = (modeIndex + amount + modes.length) % modes.length;
  }
  try {
    localStorage.setItem('scale-root', String(rootIndex));
    localStorage.setItem('scale-mode', String(modeIndex));
  } catch { /* The viewer works without storage. */ }
  render();
}

document.getElementById('app').addEventListener('click', event => {
  const bounds = event.currentTarget.getBoundingClientRect();
  const vertical = (event.clientY - bounds.top) / bounds.height;
  if (vertical < 1 / 3) move('mode', -1);
  else if (vertical > 2 / 3) move('mode', 1);
  else move('root', event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
});

document.addEventListener('keydown', event => {
  const directions = { ArrowLeft: ['root', -1], ArrowRight: ['root', 1], ArrowUp: ['mode', -1], ArrowDown: ['mode', 1] };
  if (directions[event.key]) {
    event.preventDefault();
    move(...directions[event.key]);
  }
});

render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
