import {
  ROOTS, MODES, QUALITIES, ALTERATIONS,
  spell, spellScale, preferredRoot, chordName, chordNotes, keyNotes, degreesOf, isQuality, isAlteration
} from './music.js';
import { playSequence, playChord, stop as stopSound } from './audio.js';

const SLOT_COUNT = 5;
const MAX_CHORDS = 5;
const STORAGE_KEY = 'piano-scales:v2';

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
// [pitch, index of the white-key gap the black key sits on]
const BLACK_KEYS = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6], [13, 8], [15, 9], [18, 11], [20, 12], [22, 13]];
// Where each key sits, in key-pitch units; the CSS turns this into pixels.
const KEY_POSITION = new Map([
  ...WHITE_KEYS.map((pitch, index) => [pitch, { index, black: false }]),
  ...BLACK_KEYS.map(([pitch, gap]) => [pitch, { index: gap, black: true }])
]);

const ICONS = {
  plus: '<svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true"><path d="M6.5 1.5v10M1.5 6.5h10"/></svg>',
  close: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.25 1.25l7.5 7.5M8.75 1.25l-7.5 7.5"/></svg>',
  speaker: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M12 6h.01"/><circle cx="12" cy="14" r="4"/><path d="M12 14h.01"/></svg>',
  arrow: '<svg width="11" height="12" viewBox="0 0 11 12" aria-hidden="true"><path d="M5.5 1v10M1.5 7l4 4 4-4"/></svg>'
};

const $ = id => document.getElementById(id);

/* ---------- Motion tokens (defined once, in styles.css) ---------- */

const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const motion = {
  easeOut: css('--ease-out'),
  // The outgoing half of a slot change: a quick cubic, so it doesn't linger at the edge.
  exit: css('--ease-out-cubic'),
  // Read on use so the reduced-motion media query (which zeroes them) is respected live.
  ms: name => parseFloat(css(name)) || 0
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------- State ---------- */

// Session-only keys so list rendering can tell chords apart; never persisted.
let lastChordId = 0;
const withId = chord => ({ ...chord, id: `chord-${++lastChordId}` });

const state = loadState();
const draft = {
  based: false,
  root: 0,
  quality: 'maj',
  alteration: 'none',
  degree: 1,
  variation: 0 // index into the chosen degree's variations; 0 is Diatonic
};

function inRange(value, limit) {
  return Number.isInteger(value) && value >= 0 && value < limit;
}

function reviveChord(raw) {
  if (!raw || !inRange(raw.letter, 7) || !inRange(raw.pitch, 12)) return null;
  if (!isQuality(raw.quality) || !isAlteration(raw.alteration)) return null;
  return withId({ root: spell(raw.letter, raw.pitch), quality: raw.quality, alteration: raw.alteration });
}

function loadState() {
  const fallback = {
    view: 'scales', root: 0, mode: 0, slot: 0, introDismissed: false, playStyle: 'notes',
    slots: Array.from({ length: SLOT_COUNT }, () => [])
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) {
      // Carry over the position from the scales-only version of the app.
      const root = Number(localStorage.getItem('scale-root'));
      const mode = Number(localStorage.getItem('scale-mode'));
      return { ...fallback, root: inRange(root, 12) ? root : 0, mode: inRange(mode, MODES.length) ? mode : 0 };
    }
    return {
      view: saved.view === 'progression' ? 'progression' : 'scales',
      root: inRange(saved.root, ROOTS.length) ? saved.root : 0,
      mode: inRange(saved.mode, MODES.length) ? saved.mode : 0,
      slot: inRange(saved.slot, SLOT_COUNT) ? saved.slot : 0,
      introDismissed: saved.introDismissed === true,
      playStyle: saved.playStyle === 'chord' ? 'chord' : 'notes',
      slots: fallback.slots.map((_, index) =>
        (Array.isArray(saved.slots?.[index]) ? saved.slots[index] : [])
          .map(reviveChord).filter(Boolean).slice(0, MAX_CHORDS))
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  const slots = state.slots.map(chords => chords.map(({ root, quality, alteration }) =>
    ({ letter: root.letter, pitch: root.pitch, quality, alteration })));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, slots }));
  } catch { /* The app works without storage. */ }
}

const currentChords = () => state.slots[state.slot];

/* ---------- Keyboard ---------- */

const keyboardTemplate = (() => {
  const keyboard = el('div', 'keyboard');
  const whites = el('div', 'keyboard-whites');
  for (const pitch of WHITE_KEYS) {
    const key = el('div', 'key-white');
    key.dataset.pitch = pitch;
    whites.append(key);
  }
  keyboard.append(whites);
  for (const [pitch, gap] of BLACK_KEYS) {
    const key = el('div', 'key-black');
    key.dataset.pitch = pitch;
    key.style.setProperty('--i', gap);
    keyboard.append(key);
  }
  return keyboard;
})();

/** Fills `container` with a keyboard and returns a function that highlights notes on it. */
function mountKeyboard(container) {
  const keyboard = keyboardTemplate.cloneNode(true);
  const labels = el('div', 'key-labels');
  const keys = new Map([...keyboard.querySelectorAll('[data-pitch]')].map(key => [Number(key.dataset.pitch), key]));
  keyboard.setAttribute('role', 'img');
  container.replaceChildren(keyboard, labels);

  // Notes flagged `inKey` get a faint label only: context, not part of what's shown.
  return function update(notes, description) {
    const active = new Set(notes.filter(note => !note.inKey).map(note => note.key));
    for (const [pitch, key] of keys) key.classList.toggle('is-active', active.has(pitch));
    labels.replaceChildren(...notes.map(note => {
      const { index, black } = KEY_POSITION.get(note.key);
      const label = el('span', 'key-label', note.name);
      label.classList.toggle('on-black', black);
      label.classList.toggle('is-root', note.isRoot);
      label.classList.toggle('in-key', Boolean(note.inKey));
      label.style.setProperty('--i', index);
      return label;
    }));
    keyboard.setAttribute('aria-label', `${description}: ${notes.filter(note => !note.inKey).map(note => note.name).join(', ')}`);
  };
}

const describeChord = chord => {
  const notes = chordNotes(chord);
  return { name: chordName(chord), notes, spelled: notes.map(note => note.name).join(' ') };
};

/* ---------- Playback ---------- */

// One sound at a time; its button glows until the sound has rung out.
let playing = null;

function endPlaying() {
  if (!playing) return;
  clearTimeout(playing.timer);
  playing.button.classList.remove('is-playing');
  playing = null;
}

/** Plays via `play` (which returns its length in ms), replacing whatever was sounding. */
function startPlay(button, play) {
  endPlaying();
  button.classList.add('is-playing');
  playing = { button, timer: setTimeout(endPlaying, play()) };
}

/** Like startPlay, but tapping the button that's sounding stops it instead. */
function togglePlay(button, play) {
  if (playing?.button === button) {
    endPlaying();
    stopSound();
    return;
  }
  startPlay(button, play);
}

/** The keys a speaker plays. */
function keysOf(button) {
  if (button === scalePlay) return scaleKeys;
  if (button === composerPlay) return chordNotes(draftChord()).map(note => note.key);
  return button.dataset.play.split(' ').map(Number);
}

/** Every speaker plays in the saved style: one by one, upwards (default), or as a chord. */
function tapPlay(button) {
  const keys = keysOf(button);
  togglePlay(button, () => (state.playStyle === 'chord' ? playChord(keys) : playSequence(keys)));
}

/** A drag or hold that ends over a button must not count as a tap on it. The click
 *  (if any) follows pointerup in the same task, so the guard only lives until then. */
function swallowClick() {
  const swallow = click => click.stopPropagation();
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
}

/* ---------- Speaker hold: choose the play style (left chord, right notes) ---------- */

// delay: ms before the choice opens; slop: movement (px) that cancels the hold before
// that; dead: distance from the centre (px) before a side is picked.
const HOLD = { delay: 350, slop: 10, dead: 8, margin: 10 };
const choice = $('play-choice');
const choiceThumb = choice.querySelector('.play-choice-thumb');
let hold = null; // { pointer, x, y, timer, open, centre, side }

function showSide(side) {
  hold.side = side;
  choice.dataset.side = side;
}

function openChoice() {
  hold.open = true;
  // Opens on the saved style; the thumb jumps there rather than sliding from last time.
  choiceThumb.style.transition = 'none';
  showSide(state.playStyle);
  void choiceThumb.offsetWidth;
  choiceThumb.style.transition = '';
  // Centred on the press, kept on screen; the halves split at the popover's centre.
  const halfW = choice.offsetWidth / 2 + HOLD.margin;
  const halfH = choice.offsetHeight / 2 + HOLD.margin;
  hold.centre = Math.min(Math.max(hold.x, halfW), innerWidth - halfW);
  choice.style.left = `${hold.centre}px`;
  choice.style.top = `${Math.min(Math.max(hold.y, halfH), innerHeight - halfH)}px`;
  choice.classList.add('is-open');
  // The progression may be tracking this pointer for a swipe; the hold owns it now.
  if (swipe.pointer === hold.pointer) swipe.pointer = null;
}

function closeChoice() {
  if (!hold) return;
  clearTimeout(hold.timer);
  if (hold.open) choice.classList.remove('is-open');
  hold = null;
}

document.addEventListener('pointerdown', event => {
  const button = event.target.closest?.('.play-button');
  if (!button || hold || !event.isPrimary || event.button !== 0) return;
  hold = {
    pointer: event.pointerId, x: event.clientX, y: event.clientY,
    timer: setTimeout(openChoice, HOLD.delay), open: false, centre: 0, side: null
  };
});

// Capture phase on window, so while the choice is open nothing else sees the pointer.
window.addEventListener('pointermove', event => {
  if (event.pointerId !== hold?.pointer) return;
  if (!hold.open) {
    if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > HOLD.slop) closeChoice();
    return;
  }
  event.stopPropagation();
  const dx = event.clientX - hold.centre;
  if (Math.abs(dx) < HOLD.dead) return; // near the centre: keep the side shown
  const side = dx < 0 ? 'chord' : 'notes';
  if (side !== hold.side) showSide(side);
}, true);

/** Releasing saves the side shown as the play style; it doesn't play. */
function endHold(event, cancelled) {
  if (event.pointerId !== hold?.pointer) return;
  const { open, side } = hold;
  closeChoice();
  if (!open) return; // released before the choice opened: an ordinary tap
  event.stopPropagation();
  swallowClick();
  if (cancelled || side === state.playStyle) return;
  state.playStyle = side;
  saveState();
}

window.addEventListener('pointerup', event => endHold(event, false), true);
window.addEventListener('pointercancel', event => endHold(event, true), true);

// While open, other fingers and clicks do nothing.
for (const type of ['pointerdown', 'click']) {
  window.addEventListener(type, event => {
    if (!hold?.open) return;
    event.stopPropagation();
    event.preventDefault();
  }, true);
}

// No long-press menu on speakers.
document.addEventListener('contextmenu', event => {
  if (hold || event.target.closest?.('.play-button')) event.preventDefault();
});

window.addEventListener('blur', closeChoice);

/* ---------- Views ---------- */

const app = $('app');
const views = { scales: $('scales-view'), progression: $('progression-view') };
const segmentOptions = [...document.querySelectorAll('.segmented-option')];

function renderView() {
  app.dataset.view = state.view;
  for (const option of segmentOptions) option.setAttribute('aria-pressed', String(option.dataset.view === state.view));
  for (const [name, view] of Object.entries(views)) view.inert = name !== state.view;
}

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  saveState();
  renderView();
}

for (const option of segmentOptions) option.addEventListener('click', () => setView(option.dataset.view));

/* ---------- Scales ---------- */

const updateScaleKeyboard = mountKeyboard($('scale-keyboard'));
const scalePlay = $('scale-play');
let scaleKeys = [];

function renderSteps(mode) {
  const intervals = mode.steps.map((step, index) => (mode.steps[index + 1] ?? 12) - step);
  const steps = $('steps');
  steps.setAttribute('aria-label', `Root; step pattern: ${intervals.map(i => (i === 1 ? 'half' : 'full')).join(', ')}`);
  steps.replaceChildren(el('span', 'step is-root'), ...intervals.map(i => el('span', `step is-${i === 1 ? 'half' : 'full'}`)));
}

function renderScale() {
  const mode = MODES[state.mode];
  const root = preferredRoot(ROOTS[state.root], mode);
  const notes = spellScale(root, mode).map((note, index) => ({
    ...note,
    key: root.pitch + mode.steps[index],
    isRoot: index === 0
  }));
  $('scale-root').textContent = root.name;
  const modeName = $('mode-name');
  modeName.textContent = mode.name;
  modeName.classList.toggle('is-highlight', Boolean(mode.highlight));
  renderSteps(mode);
  // Up the scale and back to the root an octave higher.
  scaleKeys = [...notes.map(note => note.key), root.pitch + 12];
  updateScaleKeyboard(notes, `${root.name} ${mode.name}`);
  document.title = `${root.name} ${mode.name} · Scales`;
}

function moveScale(which, amount) {
  if (which === 'root') state.root = (state.root + amount + ROOTS.length) % ROOTS.length;
  else state.mode = (state.mode + amount + MODES.length) % MODES.length;
  saveState();
  renderScale();
}

scalePlay.addEventListener('click', event => {
  event.stopPropagation(); // the rest of the view changes the scale
  tapPlay(scalePlay);
});

views.scales.addEventListener('click', event => {
  const bounds = views.scales.getBoundingClientRect();
  const vertical = (event.clientY - bounds.top) / bounds.height;
  if (vertical < 1 / 3) moveScale('mode', -1);
  else if (vertical > 2 / 3) moveScale('mode', 1);
  else moveScale('root', event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
});

const ARROWS = { ArrowLeft: ['root', -1], ArrowRight: ['root', 1], ArrowUp: ['mode', -1], ArrowDown: ['mode', 1] };

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (hold?.open) closeChoice();
    else if (intro.classList.contains('is-open')) closeIntro();
    else if (openSelect) closeSelect();
    else if (composer.classList.contains('is-open')) closeComposer();
    return;
  }
  if (state.view !== 'scales' || composer.classList.contains('is-open') || intro.classList.contains('is-open')) return;
  if (event.key === ' ' && event.target === document.body) {
    event.preventDefault();
    tapPlay(scalePlay);
    return;
  }
  if (!ARROWS[event.key]) return;
  event.preventDefault();
  moveScale(...ARROWS[event.key]);
});

/* ---------- Progression slot ---------- */

const pager = $('pager');
const slot = $('slot');
const progression = views.progression;

const pagerButtons = Array.from({ length: SLOT_COUNT }, (_, index) => {
  const button = el('button', 'pager-slot', String(index + 1));
  button.type = 'button';
  button.addEventListener('click', () => goToSlot(index));
  return button;
});
pager.append(...pagerButtons);

function renderPager() {
  pagerButtons.forEach((button, index) => {
    const count = state.slots[index].length;
    button.classList.toggle('has-chords', count > 0);
    button.setAttribute('aria-current', String(index === state.slot));
    button.setAttribute('aria-label', `Slot ${index + 1}, ${count} chord${count === 1 ? '' : 's'}`);
  });
}

function makeCard(chord) {
  const { name, notes } = describeChord(chord);
  const card = el('article', 'card');
  const remove = el('button', 'card-remove');
  remove.type = 'button';
  remove.dataset.remove = chord.id;
  remove.setAttribute('aria-label', `Remove ${name}`);
  remove.innerHTML = ICONS.close;
  const play = el('button', 'play-button card-play');
  play.type = 'button';
  play.dataset.play = notes.map(note => note.key).join(' ');
  play.setAttribute('aria-label', `Play ${name}`);
  play.innerHTML = ICONS.speaker;
  const keys = el('div', 'chord-keys');
  card.append(el('div', 'chord-title', name), keys, play, remove);
  mountKeyboard(keys)([...notes, ...keyNotes(chord)], name);
  return card;
}

function makeAddCard() {
  const add = el('button', 'add-card');
  add.type = 'button';
  add.dataset.add = '';
  add.setAttribute('aria-label', 'Add chord');
  add.innerHTML = ICONS.plus;
  return add;
}

const makeHint = () => el('p', 'slot-hint', `Add up to ${MAX_CHORDS} chords per progression slot.`);

/** What the slot should show, as keyed items so updates can animate per item. */
function slotItems() {
  const chords = currentChords();
  const items = chords.map(chord => ({ key: chord.id, make: () => makeCard(chord) }));
  if (chords.length < MAX_CHORDS) items.push({ key: 'add', make: makeAddCard });
  if (chords.length === 0) items.push({ key: 'hint', make: makeHint });
  return items;
}

function createItem({ key, make }) {
  const node = make();
  node.dataset.key = key;
  return node;
}

// Y-zoom and fade from the top edge. A negative bottom margin (the item's height plus
// the gap) pulls everything below up in step, so neighbours glide with it.
// Height isn't animated: border-box padding would stop it short of 0 and jump.
function zoomFrames(node) {
  const space = node.offsetHeight + (parseFloat(getComputedStyle(slot).rowGap) || 0);
  return [
    { marginBottom: `${-space}px`, transform: 'scaleY(0)', opacity: 0 },
    { marginBottom: '0px', transform: 'scaleY(1)', opacity: 1 }
  ];
}

function zoomIn(node, delay) {
  node.animate(zoomFrames(node), { duration: motion.ms('--zoom-ms'), delay, easing: motion.easeOut, fill: 'backwards' });
}

function zoomOut(node, delay) {
  node.classList.add('is-leaving');
  node.inert = true;
  const animation = node.animate(zoomFrames(node).reverse(), {
    duration: motion.ms('--zoom-ms'), delay, easing: motion.easeOut, fill: 'forwards'
  });
  animation.onfinish = () => node.remove();
}

/**
 * Syncs the slot's DOM with state. With `animate`, only items that appear or
 * disappear are touched (and zoomed); otherwise the slot is rebuilt.
 */
function renderSlot({ animate = false, delay = 0 } = {}) {
  renderPager();
  const items = slotItems();
  if (!animate) {
    slot.replaceChildren(...items.map(createItem));
    return;
  }

  const current = new Map([...slot.children]
    .filter(node => !node.classList.contains('is-leaving'))
    .map(node => [node.dataset.key, node]));
  const wanted = new Set(items.map(item => item.key));
  for (const [key, node] of current) if (!wanted.has(key)) zoomOut(node, delay);

  let previous = null;
  for (const item of items) {
    let node = current.get(item.key);
    if (!node) {
      node = createItem(item);
      slot.insertBefore(node, previous ? previous.nextSibling : slot.firstChild);
      zoomIn(node, delay);
    }
    previous = node;
  }
}

slot.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if ('add' in target.dataset) {
    openComposer(target);
  } else if ('play' in target.dataset) {
    tapPlay(target);
  } else if ('remove' in target.dataset) {
    const chords = currentChords();
    chords.splice(chords.findIndex(chord => chord.id === target.dataset.remove), 1);
    saveState();
    renderSlot({ animate: true });
  }
});

/* ---------- Slot switching: pager taps and horizontal swipes ---------- */

const SWIPE = { slop: 10, distance: .2, velocity: .4, resistance: .35 };
let slideAnimation = null;

const setSlotOffset = x => { slot.style.transform = x ? `translate3d(${x}px, 0, 0)` : ''; };

function settleSlot(from) {
  setSlotOffset(0);
  if (from) slot.animate([{ transform: `translate3d(${from}px, 0, 0)` }, { transform: 'none' }],
    { duration: motion.ms('--swipe-ms'), easing: motion.easeOut });
}

/** Slides the current slot out from `from` px and the target slot in from the opposite side. */
function goToSlot(index, from = 0) {
  if (index === state.slot || index < 0 || index >= SLOT_COUNT || slideAnimation) {
    settleSlot(from);
    return;
  }
  const direction = index > state.slot ? 1 : -1;
  const width = progression.clientWidth;
  const duration = motion.ms('--swipe-ms');
  setSlotOffset(0);
  slideAnimation = slot.animate(
    [{ transform: `translate3d(${from}px, 0, 0)` }, { transform: `translate3d(${-direction * width}px, 0, 0)` }],
    { duration: duration * .4, easing: motion.exit, fill: 'forwards' }
  );
  slideAnimation.onfinish = () => {
    state.slot = index;
    saveState();
    renderSlot();
    progression.scrollTop = 0;
    slot.animate([{ transform: `translate3d(${direction * width}px, 0, 0)` }, { transform: 'none' }],
      { duration, easing: motion.easeOut });
    slideAnimation.cancel();
    slideAnimation = null;
  };
}

const swipe = { pointer: null, startX: 0, startY: 0, lastX: 0, lastT: 0, velocity: 0, dragging: false };

progression.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || slideAnimation) return;
  Object.assign(swipe, {
    pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
    lastX: event.clientX, lastT: event.timeStamp, velocity: 0, dragging: false
  });
});

progression.addEventListener('pointermove', event => {
  if (event.pointerId !== swipe.pointer) return;
  const dx = event.clientX - swipe.startX;
  const dy = event.clientY - swipe.startY;
  if (!swipe.dragging) {
    if (Math.abs(dy) > SWIPE.slop && Math.abs(dy) > Math.abs(dx)) { swipe.pointer = null; return; }
    if (Math.abs(dx) < SWIPE.slop) return;
    swipe.dragging = true;
    progression.setPointerCapture(event.pointerId);
  }
  const elapsed = event.timeStamp - swipe.lastT;
  if (elapsed > 0) swipe.velocity = (event.clientX - swipe.lastX) / elapsed;
  swipe.lastX = event.clientX;
  swipe.lastT = event.timeStamp;
  const target = state.slot + (dx < 0 ? 1 : -1);
  setSlotOffset(target >= 0 && target < SLOT_COUNT ? dx : dx * SWIPE.resistance);
});

function endSwipe(event, cancelled) {
  if (event.pointerId !== swipe.pointer) return;
  swipe.pointer = null;
  if (!swipe.dragging) return;
  const offset = new DOMMatrixReadOnly(getComputedStyle(slot).transform).m41;
  const dx = event.clientX - swipe.startX;
  const flung = Math.abs(swipe.velocity) > SWIPE.velocity && Math.sign(swipe.velocity) === Math.sign(dx);
  const far = Math.abs(dx) > progression.clientWidth * SWIPE.distance;
  if (!cancelled && (flung || far)) goToSlot(state.slot + (dx < 0 ? 1 : -1), offset);
  else settleSlot(offset);
  swipe.dragging = false;
  swallowClick();
}

progression.addEventListener('pointerup', event => endSwipe(event, false));
progression.addEventListener('pointercancel', event => endSwipe(event, true));

/* ---------- Select (dropdown) ---------- */

let openSelect = null;

function closeSelect() {
  if (!openSelect) return;
  openSelect.classList.remove('is-open');
  openSelect.querySelector('.select-trigger').setAttribute('aria-expanded', 'false');
  openSelect = null;
}

function toggleSelect(select) {
  const wasOpen = select === openSelect;
  closeSelect();
  if (wasOpen) return;
  select.classList.add('is-open');
  select.querySelector('.select-trigger').setAttribute('aria-expanded', 'true');
  select.querySelector('.select-menu').scrollTop = 0;
  openSelect = select;
}

document.addEventListener('pointerdown', event => {
  if (openSelect && !openSelect.contains(event.target)) closeSelect();
});

/**
 * A labelled dropdown row. `options` are { value, content } where content is a
 * Node or string; the selected option shows in the trigger and is left out of the menu.
 */
function field({ label, options, value, onChange }) {
  const id = `field-${label.toLowerCase().replace(/\W/g, '')}`;
  const row = el('div', 'field');
  const labelNode = el('span', 'field-label', label);
  labelNode.id = id;

  const select = el('div', 'select');
  const trigger = el('button', 'select-trigger');
  trigger.type = 'button';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-labelledby', id);
  const current = options.find(option => option.value === value) ?? options[0];
  trigger.append(current.trigger ?? current.content);
  trigger.insertAdjacentHTML('beforeend', ICONS.arrow);
  trigger.addEventListener('click', () => toggleSelect(select));

  const menu = el('div', 'select-menu');
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-labelledby', id);
  for (const option of options) {
    if (option === current) continue;
    const item = el('button', 'select-option');
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.append(option.content);
    item.addEventListener('click', () => {
      closeSelect();
      onChange(option.value);
    });
    menu.append(item);
  }

  select.append(trigger, menu);
  row.append(labelNode, select);
  return row;
}

function numeral(text) {
  return el('span', 'numeral', text);
}

function chordDetail(chord) {
  const { name, spelled } = describeChord(chord);
  const detail = el('span', 'option-detail', `${name} - `);
  detail.append(el('span', '', spelled));
  return detail;
}

function variationLabel({ label, note }) {
  const node = el('span', 'variation-label', label);
  if (note) node.append(el('span', '', ` ${note}`));
  return node;
}

/** Menu row: label on the left, "Name - notes" on the right. */
function optionRow(left, chord) {
  const fragment = document.createDocumentFragment();
  fragment.append(left, chordDetail(chord));
  return fragment;
}

/* ---------- Composer ---------- */

const composer = $('composer');
const fields = $('fields');
const basedSwitch = $('based-switch');
const addButton = $('add-chord');
const updatePreview = mountKeyboard($('preview-keyboard'));
let composerOpener = null;

const baseChord = () => currentChords()[0] ?? null;

function draftChord() {
  const base = baseChord();
  if (draft.based && base) {
    const { variations } = degreesOf(base)[draft.degree];
    return (variations[draft.variation] ?? variations[0]).chord;
  }
  return { root: ROOTS[draft.root], quality: draft.quality, alteration: draft.alteration };
}

function setDraft(key, value) {
  draft[key] = value;
  renderComposer();
}

function renderFields(base) {
  if (draft.based && base) {
    const degrees = degreesOf(base);
    const { variations } = degrees[draft.degree];
    fields.replaceChildren(
      field({
        label: 'Degree',
        value: draft.degree,
        options: degrees.map((degree, index) => ({
          value: index,
          trigger: numeral(degree.numeral),
          content: optionRow(numeral(degree.numeral), degree.variations[0].chord)
        })),
        // Variations differ per degree, so a new degree starts from Diatonic.
        onChange: value => { draft.variation = 0; setDraft('degree', value); }
      }),
      field({
        label: 'Variation',
        value: Math.min(draft.variation, variations.length - 1),
        options: variations.map((variation, index) => ({
          value: index,
          trigger: variationLabel(variation),
          content: optionRow(variationLabel(variation), variation.chord)
        })),
        onChange: value => setDraft('variation', value)
      })
    );
    return;
  }
  fields.replaceChildren(
    field({
      label: 'Root',
      value: draft.root,
      options: ROOTS.map((root, index) => ({ value: index, content: root.name })),
      onChange: value => setDraft('root', value)
    }),
    field({
      label: 'Quality',
      value: draft.quality,
      options: QUALITIES.map(({ id }) => ({ value: id, content: id })),
      onChange: value => setDraft('quality', value)
    }),
    field({
      label: 'Alt.',
      value: draft.alteration,
      options: ALTERATIONS.map(({ id }) => ({ value: id, content: id })),
      onChange: value => setDraft('alteration', value)
    })
  );
}

function renderComposer() {
  const base = baseChord();
  const header = $('composer-base');
  if (base) {
    header.replaceChildren(chordName(base), ' ', el('span', '', 'as root'));
  } else {
    header.replaceChildren(el('span', '', 'First chord'));
  }
  basedSwitch.disabled = !base;
  basedSwitch.setAttribute('aria-checked', String(draft.based && Boolean(base)));

  closeSelect();
  renderFields(base);

  const { name, notes } = describeChord(draftChord());
  $('preview-title').textContent = name;
  updatePreview(notes, name);
  addButton.disabled = currentChords().length >= MAX_CHORDS;
}

function openComposer(opener) {
  composerOpener = opener;
  renderComposer();
  composer.inert = false;
  composer.classList.add('is-open');
  views.progression.inert = true;
}

function closeComposer() {
  closeSelect();
  if (!composer.classList.contains('is-open')) return;
  composer.classList.remove('is-open');
  composer.inert = true;
  renderView();
  composerOpener?.focus({ preventScroll: true });
  composerOpener = null;
}

basedSwitch.addEventListener('click', () => setDraft('based', !draft.based));
$('close-composer').addEventListener('click', closeComposer);

const composerPlay = $('composer-play');
composerPlay.addEventListener('click', () => tapPlay(composerPlay));

addButton.addEventListener('click', () => {
  const chords = currentChords();
  if (chords.length >= MAX_CHORDS) return;
  chords.push(withId(draftChord()));
  saveState();
  closeComposer();
  // Let the composer get mostly out of the way before the new card zooms in.
  renderSlot({ animate: true, delay: motion.ms('--pop-ms') * .6 });
});

/* ---------- Intro (shown until closed once; reopened from the help button) ---------- */

const intro = $('intro');

function openIntro() {
  intro.inert = false;
  intro.classList.add('is-open');
}

function closeIntro() {
  intro.classList.remove('is-open');
  intro.inert = true;
  state.introDismissed = true;
  saveState();
}

$('intro-close').addEventListener('click', closeIntro);
$('help').addEventListener('click', openIntro);
intro.addEventListener('click', event => {
  if (event.target === intro) closeIntro();
});

/* ---------- Start ---------- */

renderView();
renderScale();
renderSlot();

// Enable transitions only after the first paint so the restored view doesn't animate in.
app.classList.add('is-static');
requestAnimationFrame(() => requestAnimationFrame(() => {
  app.classList.remove('is-static');
  if (!state.introDismissed) openIntro();
}));

// Ask the browser not to evict saved progressions under storage pressure (notably iOS).
navigator.storage?.persist?.().catch(() => {});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
