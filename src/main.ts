import './style.css';
import { available, direction, HEARTS, hint, LEVEL_PAGE_SIZE, makeLevel, phase, startGame, tap, vectors, type Arrow } from './engine';
import { loadProgress, restoreSession, saveProgress, withGame, type StoragePort } from './storage';
import { playTone } from './audio';
import { arrowColor, arrowGeometry, center, collision, exitGeometry, pickArrow } from './paths';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing UI element: ${selector}`);
  return node;
}

const storage: StoragePort = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
const loaded = loadProgress(storage);
let progress = loaded.progress;
let game = progress.session ? restoreSession(progress.session) : startGame(makeLevel(progress.selected));
let busy = false;
const guidedIds = new Map<string, ReturnType<typeof setTimeout>>();
let hintedId: string | undefined;
let held = false;
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let pointerStart: readonly [number, number] | undefined;
let saveBlocked = Boolean(loaded.error);
let zoom = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
let pinch: { distance: number; zoom: number; anchorX: number; anchorY: number } | undefined;
let drag: { pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined;
let levelPage = 0;

element('#app').innerHTML = `
  <main class="shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Drift Arrows home"><img src="/icon.svg" alt="" /> <span>drift<span class="brand-light"> / arrows</span></span></a>
      <div class="top-actions">
        <button id="sound" class="icon-button" aria-label="Enable sound" aria-pressed="false"></button>
        <button id="help" class="icon-button" aria-label="How to play">?</button>
      </div>
    </header>
    <section class="game" aria-label="Arrow puzzle">
      <div class="level-line"><button id="levels" class="eyebrow">LEVEL <span id="level-number"></span> <span aria-hidden="true">⌄</span></button>
        <span class="offline"><span></span> a little offline calm</span></div>
      <div class="heading-line"><h1 id="level-title"></h1><div id="hearts" class="hearts"></div></div>
      <p id="subtitle" class="subtitle">Find a clear lane. Let a little go.</p>
      <div class="view-controls" aria-label="Board view">
        <span id="dimensions"></span>
      </div>
      <div class="board-wrap">
        <div id="board-viewport" class="board-viewport" tabindex="0" aria-label="Puzzle view. Pinch to zoom; swipe or drag to explore.">
          <div id="board" class="board" role="group" aria-label="Puzzle board. Tap any part of an arrow to release it.">
            <svg id="dots" class="dots" aria-hidden="true">
              <defs><pattern id="dot-grid" width="100" height="100" patternUnits="userSpaceOnUse">
                <circle id="guide-dot" cx="50" cy="50" r="12" />
              </pattern></defs>
              <rect width="100%" height="100%" fill="url(#dot-grid)" />
            </svg>
            <svg id="guides" class="guides" aria-hidden="true"></svg>
            <svg id="arrows" class="arrows" aria-label="Winding arrows"></svg>
            <svg id="flights" class="flights" aria-hidden="true"></svg>
          </div>
        </div>
        <div id="result" class="result" hidden>
          <span class="result-mark" aria-hidden="true"></span>
          <p class="eyebrow" id="result-label"></p><h2 id="result-title"></h2>
          <p id="result-copy"></p><button id="continue" class="primary"></button>
          <button id="replay" class="text-button">Play this level again</button>
        </div>
      </div>
      <div class="board-meta"><span id="remaining"></span><span id="completion"></span></div>
      <div class="progress-track" aria-hidden="true"><span id="progress-fill"></span></div>
      <div class="toolbar">
        <button id="restart" class="tool"><span class="tool-icon" aria-hidden="true">↺</span>Restart</button>
        <button id="hint" class="tool"><span class="tool-icon" aria-hidden="true">✧</span>Hint</button>
      </div>
      <p id="message" class="message" role="status" aria-live="polite"></p>
    </section>
    <hr class="footer-divider" />
    <footer><button id="love-trigger" type="button">One</button> arrow at a time. <span>No rush.</span>
      <a class="repo-link" href="https://github.com/8YdUwVC8CZMa/mc.arrows" target="_blank" rel="noopener noreferrer">Source on GitHub</a>
    </footer>
    <aside id="storage-warning" class="storage-warning" role="alert" hidden>
      <p></p><button id="storage-retry" class="text-button">Try saving again</button>
    </aside>
  </main>
  <dialog id="love-dialog" aria-label="Photo surprise">
    <img class="surprise-photo" src="/surprise.jpg" alt="A man in an orange shirt holding a cup at a table." />
  </dialog>
  <dialog id="help-dialog" aria-labelledby="help-title">
    <div class="dialog-heading"><span class="eyebrow">A MOMENT TO UNWIND</span><button class="close icon-button" aria-label="Close help">×</button></div>
    <h2 id="help-title">Make a little room.</h2>
    <p>Tap on or near a winding path. The nearest nearby arrow with a clear exit lane flows off the board, its tail following the bends.</p>
    <p>If no nearby arrow can exit, the nearest one flows forward, hits its blocker and bounces back. A blocked tap costs one of your three hearts. Lose all three and retry the level.</p>
    <p>Long-press an arrow to reveal only its lane for two seconds. Reveal as many as you like; each lane disappears automatically or when an arrow exits or hits a blocker. Green lanes are clear; red lanes are blocked. With a keyboard, focus an arrow and press G. <strong>Hint</strong> highlights one safe arrow, with no limit or penalty.</p>
    <p><strong>Pinch with two fingers</strong> to zoom in or out, from half the fitted size to 4x. Zoom out beyond the whole puzzle for extra space around it. Swipe with one finger or drag with a mouse to explore when zoomed in. Each level visit creates a random board with different dimensions, arrow counts and path lengths. Restart and resume keep your current puzzle.</p>
    <p>A perfect run means clearing a board without losing a heart. Use Tab and Enter to play with a keyboard. Progress stays on this device.</p>
    <button class="primary close">Find my flow</button>
  </dialog>
  <dialog id="levels-dialog" aria-labelledby="levels-title">
    <div class="dialog-heading"><span class="eyebrow">YOUR JOURNEY</span><button class="close icon-button" aria-label="Close levels">×</button></div>
    <h2 id="levels-title">A little further.</h2>
    <p>Endless levels, fresh random puzzles on each visit.<br />A star marks a perfect run.</p>
    <div id="level-grid" class="level-grid"></div>
    <div class="level-pager"><button id="previous-levels" class="text-button">Previous levels</button><span id="level-range"></span><button id="next-levels" class="text-button">Next levels</button></div>
    <form id="level-jump">
      <label for="level-destination">Go to unlocked level</label>
      <div><input id="level-destination" type="number" min="1" step="1" required /><button class="primary" type="submit">Go</button><button id="newest-level" class="text-button" type="button">Newest unlocked</button></div>
    </form>
  </dialog>
  <dialog id="restart-dialog" aria-labelledby="restart-title">
    <h2 id="restart-title">A fresh perspective?</h2>
    <p>Replay the same winding puzzle with fresh hearts. Your completed levels and perfect runs stay saved.</p>
    <button id="confirm-restart" class="primary">Restart level</button>
    <button class="text-button close">Keep playing</button>
  </dialog>`;

const board = element('#board');
const viewport = element('#board-viewport');
const arrowLayer = document.querySelector<SVGSVGElement>('#arrows')!;
const guides = document.querySelector<SVGSVGElement>('#guides')!;
const result = element('#result');
const message = element('#message');
const loveDialog = element<HTMLDialogElement>('#love-dialog');
let loveTimer: ReturnType<typeof setTimeout> | undefined;
function dismissLove(): void {
  clearTimeout(loveTimer);
  loveDialog.close();
}
element('#love-trigger').addEventListener('click', () => {
  loveDialog.showModal();
  loveTimer = setTimeout(dismissLove, 3000);
});
loveDialog.addEventListener('click', dismissLove);
loveDialog.addEventListener('close', () => { clearTimeout(loveTimer); });

function announce(text: string): void { message.textContent = text; }
function warning(text: string): void {
  const panel = element('#storage-warning');
  panel.hidden = false;
  panel.querySelector('p')!.textContent = `${text} You can still play; progress may be temporary.`;
}
function persist(): void {
  progress = withGame(progress, game);
  if (saveBlocked) return;
  const error = saveProgress(storage, progress);
  if (error) { saveBlocked = true; warning(error); }
}
function sound(kind: 'slide' | 'blocked' | 'win'): void {
  if (!progress.sound) return;
  void playTone(kind).catch(error => {
    progress.sound = false;
    persist();
    renderSound();
    announce(`Sound unavailable: ${error instanceof Error ? error.message : String(error)}`);
  });
}
function renderSound(): void {
  const button = element<HTMLButtonElement>('#sound');
  button.innerHTML = progress.sound
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3q5 4 0 8m3-11q8 7 0 14"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Zm5 4 5 6m0-6-5 6"/></svg>';
  button.setAttribute('aria-label', progress.sound ? 'Mute sound' : 'Enable sound');
  button.setAttribute('aria-pressed', String(progress.sound));
}
function renderGuidance(): void {
  guides.replaceChildren();
  const safeIds = new Set(available(game).map(arrow => arrow.id));
  for (const arrow of game.arrows) {
    const enabled = guidedIds.has(arrow.id);
    const safe = safeIds.has(arrow.id);
    const button = arrowLayer.querySelector<SVGElement>(`[data-arrow-id="${arrow.id}"]`);
    button?.classList.toggle('safe', enabled && safe);
    button?.classList.toggle('hinted', hintedId === arrow.id);
    if (!enabled) continue;
    const [dx, dy] = vectors[direction(arrow)];
    const [hx, hy] = center(arrow.path[0]);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(hx));
    line.setAttribute('y1', String(hy));
    line.setAttribute('x2', String(dx ? (dx > 0 ? game.level.width * 100 : 0) : hx));
    line.setAttribute('y2', String(dy ? (dy > 0 ? game.level.height * 100 : 0) : hy));
    line.setAttribute('class', safe ? 'clear-lane' : 'blocked-lane');
    line.dataset.arrowId = arrow.id;
    guides.append(line);
  }
}
function revealGuidance(arrow: Arrow): void {
  clearTimeout(guidedIds.get(arrow.id));
  guidedIds.set(arrow.id, setTimeout(() => {
    guidedIds.delete(arrow.id);
    renderGuidance();
  }, 2000));
  renderGuidance();
  announce(`Guidance for arrow ${arrow.id}, pointing ${direction(arrow)}. ${
    available(game).some(candidate => candidate.id === arrow.id) ? 'Its lane is clear.' : 'Its lane is blocked.'}`);
}
function clearGuidance(): void {
  for (const timer of guidedIds.values()) clearTimeout(timer);
  guidedIds.clear();
}
function arrowButton(arrow: Arrow): SVGGElement {
  const button = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  button.setAttribute('class', `arrow ${direction(arrow)}`);
  button.dataset.arrowId = arrow.id;
  button.style.setProperty('--arrow-color', arrowColor(game.level.seed, arrow.id));
  const [x, y] = arrow.path[0];
  button.setAttribute('aria-label', `Arrow ${arrow.id}, ${direction(arrow)}, ${arrow.path.length} cells, head row ${y + 1}, column ${x + 1}`);
  button.setAttribute('role', 'button');
  const disabled = phase(game) !== 'playing' || busy;
  button.setAttribute('tabindex', disabled ? '-1' : '0');
  button.setAttribute('aria-disabled', String(disabled));
  const geometry = arrowGeometry(arrow);
  const [hx, hy] = center(arrow.path[0]);
  button.innerHTML = `<path class="arrow-ink" d="${geometry.body}${geometry.head}" />
    <path class="arrow-hit" d="${geometry.body}${geometry.head}" />
    <circle class="arrow-anchor" cx="${hx}" cy="${hy}" r="15" />`;
  button.addEventListener('keydown', event => {
    if (event.key.toLowerCase() === 'g' && !busy && phase(game) === 'playing') {
      event.preventDefault();
      revealGuidance(arrow);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      held = false;
      void activate(arrow, true);
    }
  });
  button.addEventListener('focus', () => {
    button.querySelector('.arrow-anchor')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  return button;
}
function layoutBoard(): void {
  const cell = Math.min(viewport.clientWidth / game.level.width, viewport.clientHeight / game.level.height);
  board.style.width = `${cell * game.level.width * zoom}px`;
  board.style.height = `${cell * game.level.height * zoom}px`;
  board.style.marginTop = `${Math.max(0, (viewport.clientHeight - cell * game.level.height * zoom) / 2)}px`;
  document.querySelector('#guide-dot')!.setAttribute('r', String(Math.max(7, 120 / cell)));
  viewport.dataset.zoomed = String(zoom > 1);
}
function render(deferLoss = false): void {
  board.dataset.seed = String(game.level.seed);
  element('#level-number').textContent = String(game.level.number).padStart(2, '0');
  element('#level-title').textContent = game.level.title;
  element('#subtitle').textContent = 'Follow the bends. Find an open lane at the head.';
  element('#hearts').innerHTML = Array.from({ length: HEARTS }, (_, i) =>
    `<svg class="${i >= HEARTS - game.mistakes ? 'empty' : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20 3.8 12A5 5 0 0 1 12 5.5 5 5 0 0 1 20.2 12Z"/></svg>`).join('');
  element('#hearts').setAttribute('aria-label', `${HEARTS - game.mistakes} of ${HEARTS} hearts remaining`);
  const count = game.arrows.length;
  const percentage = Math.round((1 - count / game.level.arrows.length) * 100);
  element('#remaining').textContent = `${count} arrow${count !== 1 ? 's' : ''} to release`;
  element('#completion').textContent = `${percentage}% clear`;
  element('#progress-fill').style.width = `${percentage}%`;
  element('#dimensions').textContent = `${game.level.width} × ${game.level.height} · ${game.level.arrows.length} winding arrows`;
  viewport.style.aspectRatio = `${game.level.width} / ${game.level.height}`;
  for (const layer of [arrowLayer, guides, document.querySelector<SVGSVGElement>('#flights')!,
    document.querySelector<SVGSVGElement>('#dots')!]) {
    layer.setAttribute('viewBox', `0 0 ${game.level.width * 100} ${game.level.height * 100}`);
  }
  arrowLayer.replaceChildren(...game.arrows.map(arrowButton));
  layoutBoard();
  const status = deferLoss && phase(game) === 'lost' ? 'playing' : phase(game);
  board.classList.toggle('finished', status !== 'playing');
  result.hidden = status === 'playing';
  element<HTMLButtonElement>('#hint').disabled = busy || status !== 'playing';
  element<HTMLButtonElement>('#restart').disabled = busy;
  if (status !== 'playing') {
    const won = status === 'won';
    element('#result-label').textContent = won ? (game.mistakes === 0 ? 'PERFECT RUN' : 'BOARD CLEARED') : 'TAKE A BREATH';
    element('#result-title').textContent = won ? 'A little lighter.' : 'A new way through.';
    element('#result-copy').textContent = won
      ? 'A clear board. A fresh puzzle is waiting. Take the next small step.'
      : 'Three hearts, a fresh start. Look for an open lane before you tap.';
    element('#result .result-mark').textContent = won ? '✧' : '↺';
    element('#continue').textContent = won ? 'Next level' : 'Try again';
    element('#replay').hidden = !won;
  }
  renderGuidance();
  renderSound();
}
async function activate(arrow: Arrow, keyboard = false): Promise<void> {
  if (busy) return;
  const impact = collision(arrow, game.arrows);
  const response = tap(game, arrow.id);
  if (response.outcome === 'ignored') return;
  hintedId = undefined;
  clearGuidance();
  game = response.game;
  persist();
  busy = true;
  if (response.outcome === 'blocked') {
    if (!impact) throw new Error('Blocked arrow has no collision target.');
    await animateArrow(arrow, impact);
    busy = false;
    sound('blocked');
    render();
    const button = arrowLayer.querySelector<SVGElement>(`[data-arrow-id="${arrow.id}"]`);
    button?.classList.add('bump');
    if (keyboard) button?.focus({ preventScroll: true });
    announce(phase(game) === 'lost' ? 'No hearts left. Try the level again.' : 'That lane is blocked. One heart lost.');
    if (phase(game) === 'lost') element('#continue').focus({ preventScroll: true });
    return;
  }
  sound('slide');
  await animateArrow(arrow);
  busy = false;
  render();
  if (phase(game) === 'won') {
    sound('win');
    announce(game.mistakes === 0 ? 'Perfect run! Board cleared without losing a heart.' : 'Board cleared!');
    element('#continue').focus({ preventScroll: true });
  } else {
    announce('');
    // Pointer play keeps its pan position; keyboard play needs a new focus target.
    if (keyboard) arrowLayer.querySelector<SVGElement>('[role="button"]')?.focus({ preventScroll: true });
  }
}

async function animateArrow(arrow: Arrow, impact?: NonNullable<ReturnType<typeof collision>>): Promise<void> {
  // Keep the last-heart collision visible until the returning arrow has settled.
  render(Boolean(impact));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const geometry = exitGeometry(arrow, game.level.width, game.level.height);
    const original = arrowLayer.querySelector<SVGElement>(`[data-arrow-id="${arrow.id}"]`);
    if (original) original.style.visibility = 'hidden';
    const flight = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    flight.setAttribute('class', `arrow flight ${direction(arrow)}${impact ? ' collision' : ''}`);
    flight.dataset.arrowId = arrow.id;
    flight.style.setProperty('--arrow-color', arrowColor(game.level.seed, arrow.id));
    flight.innerHTML = `<path class="arrow-ink flight-body" d="${geometry.route}"
      stroke-dasharray="${geometry.length} ${geometry.distance + geometry.length + 100}" />
      <path class="arrow-ink flight-head" d="${geometry.head}" />`;
    element('#flights').append(flight);
    const travel = impact?.distance ?? geometry.distance;
    const duration = impact ? Math.min(1000, 400 + travel / 10) : Math.min(1000, 300 + travel / 12);
    let contacted = false;
    const started = performance.now();
    await new Promise<void>(resolve => {
      function frame(now: number): void {
        const t = Math.min(1, (now - started) / duration);
        const distance = impact
          ? travel * (t < 0.55 ? (t / 0.55) ** 2 : (1 - (t - 0.55) / 0.45) ** 2)
          : travel * t * t;
        if (impact && t >= 0.55 && !contacted) {
          contacted = true;
          arrowLayer.querySelector(`[data-arrow-id="${impact.blocker.id}"]`)?.classList.add('bump');
        }
        flight.querySelector('.flight-body')!.setAttribute('stroke-dashoffset', String(-distance));
        flight.querySelector('.flight-head')!.setAttribute('transform', `translate(${geometry.dx * distance} ${geometry.dy * distance})`);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
    flight.remove();
  }
}
function changeLevel(number: number, keepPuzzle = false): void {
  game = startGame(keepPuzzle ? game.level : makeLevel(number));
  hintedId = undefined;
  clearGuidance();
  zoom = 1;
  viewport.scrollTo(0, 0);
  persist();
  render();
  announce(keepPuzzle ? 'Same puzzle, fresh hearts. Follow the bends.' : 'A new random puzzle. Zoom in to explore the winding paths.');
}
function renderLevelPage(): void {
  const grid = element('#level-grid');
  grid.replaceChildren();
  const first = levelPage * LEVEL_PAGE_SIZE + 1;
  for (let slot = 0; slot < LEVEL_PAGE_SIZE; slot++) {
    const n = first + slot;
    if (!Number.isSafeInteger(n)) break;
    const button = document.createElement('button');
    button.className = 'level-choice';
    button.textContent = `${n}${progress.perfect.includes(n) ? ' ★' : n < progress.unlocked ? ' ✓' : ''}`;
    button.disabled = n > progress.unlocked;
    button.setAttribute('aria-label', `Level ${n}${n > progress.unlocked ? ', locked' : progress.perfect.includes(n) ? ', perfect' : n < progress.unlocked ? ', complete' : ''}`);
    if (n === game.level.number) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => {
      element<HTMLDialogElement>('#levels-dialog').close();
      changeLevel(n);
    });
    grid.append(button);
  }
  element('#level-range').textContent = `${first}–${first + LEVEL_PAGE_SIZE - 1}`;
  element<HTMLButtonElement>('#previous-levels').disabled = levelPage === 0;
  element<HTMLButtonElement>('#next-levels').disabled = (levelPage + 1) * LEVEL_PAGE_SIZE >= progress.unlocked;
}
function showLevels(): void {
  levelPage = Math.floor((game.level.number - 1) / LEVEL_PAGE_SIZE);
  renderLevelPage();
  const destination = element<HTMLInputElement>('#level-destination');
  destination.max = String(progress.unlocked);
  destination.value = String(game.level.number);
  element<HTMLDialogElement>('#levels-dialog').showModal();
}
element('#previous-levels').addEventListener('click', () => { levelPage--; renderLevelPage(); });
element('#next-levels').addEventListener('click', () => { levelPage++; renderLevelPage(); });
element('#newest-level').addEventListener('click', () => {
  levelPage = Math.floor((progress.unlocked - 1) / LEVEL_PAGE_SIZE);
  renderLevelPage();
  element<HTMLInputElement>('#level-destination').value = String(progress.unlocked);
});
element('#level-jump').addEventListener('submit', event => {
  event.preventDefault();
  const destination = element<HTMLInputElement>('#level-destination');
  const number = destination.valueAsNumber;
  if (!Number.isSafeInteger(number) || number < 1 || number > progress.unlocked) {
    destination.setCustomValidity('Choose an unlocked whole-number level.');
    destination.reportValidity();
    return;
  }
  element<HTMLDialogElement>('#levels-dialog').close();
  changeLevel(number);
});
element('#level-destination').addEventListener('input', event => { (event.target as HTMLInputElement).setCustomValidity(''); });
element('#levels').addEventListener('click', () => { if (!busy) showLevels(); });
element('#help').addEventListener('click', () => element<HTMLDialogElement>('#help-dialog').showModal());
element('.brand').addEventListener('click', event => { event.preventDefault(); if (!busy) showLevels(); });
document.querySelectorAll<HTMLButtonElement>('.close').forEach(button =>
  button.addEventListener('click', () => button.closest('dialog')?.close()));
element('#restart').addEventListener('click', () => element<HTMLDialogElement>('#restart-dialog').showModal());
element('#confirm-restart').addEventListener('click', () => {
  element<HTMLDialogElement>('#restart-dialog').close();
  changeLevel(game.level.number, true);
});
element('#replay').addEventListener('click', () => changeLevel(game.level.number, true));
element('#continue').addEventListener('click', () => {
  if (busy) return;
  changeLevel(game.level.number + (phase(game) === 'won' ? 1 : 0), phase(game) === 'lost');
});
element('#hint').addEventListener('click', () => {
  const response = hint(game);
  game = response.game;
  hintedId = response.arrow?.id;
  persist();
  renderGuidance();
  if (response.arrow) {
    arrowLayer.querySelector(`[data-arrow-id="${response.arrow.id}"] .arrow-anchor`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  announce(response.arrow ? `Highlighted arrow points ${direction(response.arrow)}. Its lane is clear.` : 'No hint needed.');
});
function arrowAt(clientX: number, clientY: number, preferFree = true): Arrow | undefined {
  const rect = board.getBoundingClientRect();
  const unitsPerPixel = game.level.width * 100 / rect.width;
  return pickArrow(game, [(clientX - rect.left) * unitsPerPixel,
    (clientY - rect.top) * unitsPerPixel], unitsPerPixel, preferFree);
}
board.addEventListener('contextmenu', event => event.preventDefault());
board.addEventListener('click', event => {
  if (held || busy || pinch) return;
  const arrow = arrowAt(event.clientX, event.clientY);
  if (arrow) void activate(arrow);
});
board.addEventListener('pointerdown', event => {
  if (busy || pinch || phase(game) !== 'playing' || event.button !== 0) return;
  held = false;
  clearTimeout(holdTimer);
  pointerStart = [event.clientX, event.clientY];
  const arrow = arrowAt(event.clientX, event.clientY, false);
  if (!arrow) return;
  holdTimer = setTimeout(() => {
    held = true;
    revealGuidance(arrow);
  }, 450);
});
function releaseHold(): void {
  clearTimeout(holdTimer);
  pointerStart = undefined;
}
board.addEventListener('pointermove', event => {
  if (pointerStart && Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 12) {
    held = true;
    releaseHold();
  }
});
window.addEventListener('pointerup', releaseHold);
window.addEventListener('pointercancel', () => { held = true; releaseHold(); });
window.addEventListener('blur', releaseHold);
board.addEventListener('keydown', () => { held = false; });
function touchPair(touches: TouchList): { x: number; y: number; distance: number } {
  const [a, b] = [touches[0], touches[1]];
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2,
    distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
}
viewport.addEventListener('touchstart', event => {
  if (event.touches.length < 2) return;
  event.preventDefault();
  held = true;
  releaseHold();
  const pair = touchPair(event.touches);
  const rect = board.getBoundingClientRect();
  pinch = { distance: Math.max(1, pair.distance), zoom,
    anchorX: (pair.x - rect.left) / rect.width, anchorY: (pair.y - rect.top) / rect.height };
}, { passive: false });
viewport.addEventListener('touchmove', event => {
  if (!pinch || event.touches.length < 2) return;
  event.preventDefault();
  const pair = touchPair(event.touches);
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinch.zoom * pair.distance / pinch.distance));
  layoutBoard();
  const rect = board.getBoundingClientRect();
  viewport.scrollLeft += rect.left + pinch.anchorX * rect.width - pair.x;
  viewport.scrollTop += rect.top + pinch.anchorY * rect.height - pair.y;
}, { passive: false });
function finishPinch(event: TouchEvent): void {
  if (event.touches.length < 2 && pinch) {
    pinch = undefined;
    held = true;
    releaseHold();
  }
}
viewport.addEventListener('touchend', finishPinch);
viewport.addEventListener('touchcancel', finishPinch);
viewport.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || zoom <= 1) return;
  drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
    left: viewport.scrollLeft, top: viewport.scrollTop, moved: false };
});
window.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) <= 5) return;
  drag.moved = true;
  held = true;
  releaseHold();
  viewport.classList.add('dragging');
  if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
  viewport.scrollLeft = drag.left - dx;
  viewport.scrollTop = drag.top - dy;
  event.preventDefault();
});
function finishDrag(): void {
  if (drag && viewport.hasPointerCapture(drag.pointerId)) viewport.releasePointerCapture(drag.pointerId);
  drag = undefined;
  viewport.classList.remove('dragging');
}
window.addEventListener('pointerup', finishDrag);
window.addEventListener('pointercancel', finishDrag);
window.addEventListener('blur', finishDrag);
new ResizeObserver(layoutBoard).observe(viewport);
element('#sound').addEventListener('click', () => {
  progress.sound = !progress.sound;
  persist();
  renderSound();
  if (progress.sound) sound('slide');
});
element('#storage-retry').addEventListener('click', () => {
  saveBlocked = false;
  persist();
  if (!saveBlocked) {
    element('#storage-warning').hidden = true;
    announce('Progress is saved on this device.');
  }
});
render();
announce(loaded.notice ?? 'Fresh winding paths. Tap on or near an arrow; pinch to zoom and swipe to explore.');
if (loaded.error) warning(`${loaded.error} Existing saved data has not been overwritten.`);
else persist();
