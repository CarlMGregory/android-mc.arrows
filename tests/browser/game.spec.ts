import { test, expect, type Page } from '@playwright/test';
import { available, bends, makeLevel, phase, startGame, tap, type Arrow, type Game } from '../../src/engine';
import { arrowColor, center, collision, distanceToArrow, pickArrow } from '../../src/paths';

const fixedSeed = 2654435761;
test.beforeEach(async ({ page }) => {
  await page.addInitScript(seed => {
    if (localStorage.getItem('drift-arrows-v1') === null) {
      localStorage.setItem('drift-arrows-v1', JSON.stringify({
        version: 3, unlocked: 1, selected: 1, perfect: [], sound: false,
        session: { level: 1, seed, moves: [], mistakes: 0, hints: 0 },
      }));
    }
  }, fixedSeed);
});

async function current(page: Page): Promise<Game> {
  const seed = Number(await page.locator('#board').getAttribute('data-seed'));
  const number = Number(await page.locator('#level-number').textContent());
  const ids = await page.locator('#arrows [data-arrow-id]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-arrow-id')));
  const game = startGame(makeLevel(number, seed));
  return { ...game, arrows: game.arrows.filter(a => ids.includes(a.id)) };
}
async function pinchZoom(page: Page, factor: number): Promise<void> {
  await page.locator('#board-viewport').scrollIntoViewIfNeeded();
  const box = (await page.locator('#board-viewport').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const from = factor >= 1 ? 20 : 80;
  const client = await page.context().newCDPSession(page);
  const touches = (radius: number) => [{ x: x - radius, y, id: 0 }, { x: x + radius, y, id: 1 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(from) });
  for (let i = 1; i <= 6; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: touches(from * (1 + (factor - 1) * i / 6)) });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await client.detach();
}
async function clickHead(page: Page, arrow: Arrow, touch = false): Promise<void> {
  const group = page.locator(`[data-arrow-id="${arrow.id}"]`);
  await expect(group).toHaveAttribute('aria-disabled', 'false');
  const anchor = group.locator('.arrow-anchor');
  await anchor.scrollIntoViewIfNeeded();
  const box = (await anchor.boundingBox())!;
  if (touch) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function solve(page: Page): Promise<void> {
  let game = await current(page);
  while (phase(game) === 'playing') {
    const arrow = available(game)[0];
    await page.locator(`[data-arrow-id="${arrow.id}"]`).press('Enter');
    game = tap(game, arrow.id).game;
  }
}
function blocked(game: Game): Arrow {
  const safe = new Set(available(game).map(a => a.id));
  return game.arrows.find(a => !safe.has(a.id))!;
}

test('dense winding puzzle, free hints, win, progression and reload', async ({ page }) => {
  const errors: string[] = [], external: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:5173')) external.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Winding ways' })).toBeVisible();
  const initial = await current(page);
  expect(initial.arrows.length).toBeGreaterThanOrEqual(25);
  expect(Math.max(...initial.arrows.map(a => a.path.length))).toBeGreaterThanOrEqual(25);
  expect(initial.arrows.filter(a => bends(a) > 0).length).toBeGreaterThan(initial.arrows.length / 2);
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(page.locator(`[data-arrow-id="${available(initial)[0].id}"]`)).toHaveClass(/hinted/);
  await solve(page);
  await expect(page.getByText('PERFECT RUN', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next level' }).click();
  await expect(page.locator('#level-number')).toHaveText('02');
  const second = await current(page);
  await clickHead(page, available(second)[0]);
  await page.reload();
  await expect(page.locator('#board')).toHaveAttribute('data-seed', String(second.level.seed));
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(second.arrows.length - 1);
  await page.locator('#levels').click();
  await expect(page.getByRole('button', { name: 'Level 1, perfect', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Level 3, locked', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('blocked taps, loss and retry preserve the same puzzle', async ({ page }) => {
  await page.goto('/');
  const initial = await current(page);
  for (let i = 0; i < 3; i++) await page.locator(`[data-arrow-id="${blocked(initial).id}"]`).press('Enter');
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '0 of 3 hearts remaining');
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
  expect((await current(page)).level).toEqual(initial.level);
  await page.locator(`[data-arrow-id="${blocked(initial).id}"]`).press('Enter');
  await solve(page);
  await expect(page.getByText('BOARD CLEARED', { exact: true })).toBeVisible();
});

test('long-press reveals individual lighter lanes and clears on moves', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.clock.pauseAt(new Date());
  const game = await current(page);
  await expect(page.getByRole('button', { name: 'Guidance', exact: true })).toHaveCount(0);
  const selected = [blocked(game), available(game)[0]];
  for (const [index, arrow] of selected.entries()) {
    const anchor = page.locator(`#arrows [data-arrow-id="${arrow.id}"] .arrow-anchor`);
    await anchor.scrollIntoViewIfNeeded();
    const box = (await anchor.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.clock.runFor(450);
    await expect(page.locator('#guides line')).toHaveCount(index + 1);
    await page.mouse.up();
    await expect(page.locator(`#guides line[data-arrow-id="${arrow.id}"]`)).toHaveCount(1);
  }
  await expect(page.locator('#guides .blocked-lane')).toHaveCount(1);
  await expect(page.locator('#guides .clear-lane')).toHaveCount(1);
  const laneStyles = await page.locator('#guides line').evaluateAll(lines => lines.map(line => {
    const style = getComputedStyle(line);
    return { width: style.strokeWidth, opacity: style.opacity, effect: style.vectorEffect, color: style.stroke };
  }));
  expect(laneStyles.every(style => style.width === '2px' && style.opacity === '0.55' &&
    style.effect === 'non-scaling-stroke')).toBe(true);
  expect(laneStyles.map(style => style.color).sort()).toEqual(['rgb(163, 62, 53)', 'rgb(23, 114, 84)']);
  await pinchZoom(page, 1.75);
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  await expect(page.locator('#guides line')).toHaveCount(2);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
  await page.locator(`#arrows [data-arrow-id="${selected[0].id}"]`).press('Enter');
  await expect(page.locator('#guides line')).toHaveCount(0);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '2 of 3 hearts remaining');
  await page.locator(`#arrows [data-arrow-id="${selected[0].id}"]`).press('g');
  await page.locator(`#arrows [data-arrow-id="${selected[0].id}"]`).press('g');
  await page.locator(`#arrows [data-arrow-id="${selected[1].id}"]`).press('g');
  await expect(page.locator('#guides line')).toHaveCount(2);
  await page.locator(`#arrows [data-arrow-id="${available(game)[0].id}"]`).press('Space');
  await expect(page.locator('#guides line')).toHaveCount(0);
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length - 1);
});

test('guidance expires independently after two seconds and repeating renews only that arrow', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.clock.pauseAt(new Date());
  const game = await current(page);
  const [first, second] = game.arrows;
  const reveal = (arrow: Arrow) => page.locator(`#arrows [data-arrow-id="${arrow.id}"]`).press('g');
  await reveal(first);
  await page.clock.runFor(1000);
  await reveal(second);
  await page.clock.runFor(500);
  await reveal(first);
  await page.clock.runFor(1499);
  await expect(page.locator('#guides line')).toHaveCount(2);
  await page.clock.runFor(1);
  await expect(page.locator(`#guides [data-arrow-id="${second.id}"]`)).toHaveCount(0);
  await expect(page.locator(`#guides [data-arrow-id="${first.id}"]`)).toHaveCount(1);
  await page.clock.runFor(500);
  await expect(page.locator('#guides line')).toHaveCount(0);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length);
});

test('restart/resume keep the seed; selecting a level creates a fresh puzzle', async ({ page }) => {
  await page.goto('/');
  const initial = await current(page);
  await clickHead(page, available(initial)[0]);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click();
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(initial.arrows.length - 1);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('button', { name: 'Restart level', exact: true }).click();
  expect(await current(page)).toEqual(initial);
  await page.reload();
  expect(await current(page)).toEqual(initial);
  await page.locator('#levels').click();
  await page.getByRole('button', { name: 'Level 1', exact: true }).click();
  expect((await current(page)).level.seed).not.toEqual(initial.level.seed);
  await page.reload();
  expect((await current(page)).level.seed).not.toEqual(initial.level.seed);
});

test('corrupt save remains untouched until saving is explicitly retried', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('drift-arrows-v1', '{bad'); });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Progress could not be loaded');
  const safe = available(await current(page))[0];
  await clickHead(page, safe);
  expect(await page.evaluate(() => localStorage.getItem('drift-arrows-v1'))).toBe('{bad');
  await page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await expect(page.getByRole('alert')).toBeHidden();
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('drift-arrows-v1')!));
  expect(save.session.moves).toEqual([safe.id]);
});

test('denied storage is disclosed, without disabling play', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Storage denied');
  await solve(page);
  await expect(page.getByText('PERFECT RUN', { exact: true })).toBeVisible();
});

test('progression continues through level 24 and beyond without a finale', async ({ page }) => {
  test.setTimeout(300000);
  await page.goto('/');
  for (let number = 1; number <= 26; number++) {
    await solve(page);
    await expect(page.getByRole('button', { name: 'Next level' })).toBeVisible();
    await page.getByRole('button', { name: 'Next level' }).click();
  }
  await expect(page.locator('#level-number')).toHaveText('27');
  await page.locator('#levels').click();
  await expect(page.getByRole('button', { name: 'Level 26, perfect', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Previous levels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Level 24, perfect', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Next levels', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Level 27', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Level 28, locked', exact: true })).toBeDisabled();
});

test('very high levels resume and picker paging stays bounded with direct navigation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('drift-arrows-v1', JSON.stringify({
      version: 3, unlocked: 1000000, selected: 1000000, perfect: [24, 999999], sound: false,
      session: { level: 1000000, seed: 42, moves: [], mistakes: 0, hints: 0 },
    }));
  });
  await page.goto('/');
  await expect(page.locator('#level-number')).toHaveText('1000000');
  await page.locator('#levels').click();
  await expect(page.locator('#level-grid button')).toHaveCount(24);
  await expect(page.getByRole('button', { name: 'Level 1000000', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Previous levels', exact: true }).click();
  await expect(page.locator('#level-grid button')).toHaveCount(24);
  await page.getByRole('button', { name: 'Newest unlocked', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Level 1000000', exact: true })).toBeVisible();
  await page.getByLabel('Go to unlocked level').fill('975');
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.locator('#level-number')).toHaveText('975');
  await page.locator('#levels').click();
  await expect(page.getByRole('button', { name: 'Level 975, complete', exact: true })).toBeEnabled();
});

test('zoom and scroll work on small and landscape screens without overflowing the page', async ({ page }) => {
  for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('#zoom-in, #zoom-out, #zoom-fit')).toHaveCount(0);
    await expect(page.locator('#message')).toContainText('pinch to zoom');
    await expect(page.locator('#message')).not.toContainText('use +');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const before = (await page.locator('#board').boundingBox())!;
    await pinchZoom(page, 2.75);
    const after = (await page.locator('#board').boundingBox())!;
    expect(after.width / before.width).toBeCloseTo(2.75, 1);
    await page.locator('#board-viewport').evaluate(view => { view.scrollLeft = 150; view.scrollTop = 150; });
    expect(await page.locator('#board-viewport').evaluate(view => view.scrollTop)).toBeGreaterThan(0);
    await clickHead(page, available(await current(page))[0]);
    await pinchZoom(page, 1 / 2.75);
    expect((await page.locator('#board').boundingBox())!.width).toBeCloseTo(before.width, 0);
    await page.getByRole('button', { name: 'How to play' }).click();
    await expect(page.getByRole('heading', { name: 'Make a little room.' })).toBeVisible();
    await page.getByRole('button', { name: 'Find my flow' }).click();
  }
});

test('arrows have varied dark colors that survive reload and exit animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const game = await current(page);
  const readColors = () => page.locator('#arrows .arrow').evaluateAll(nodes =>
    nodes.map(node => (node as SVGElement).style.getPropertyValue('--arrow-color')));
  const colors = await readColors();
  expect(new Set(colors).size).toBeGreaterThanOrEqual(6);
  expect(colors).toEqual(game.arrows.map(arrow => arrowColor(game.level.seed, arrow.id)));
  await page.reload();
  expect(await readColors()).toEqual(colors);
  const arrow = available(game)[0];
  await page.locator(`#arrows [data-arrow-id="${arrow.id}"]`).press('Enter');
  await expect(page.locator('#flights .flight')).toHaveCount(1);
  expect(await page.locator('#flights .flight').evaluate(node =>
    (node as SVGElement).style.getPropertyValue('--arrow-color'))).toBe(arrowColor(game.level.seed, arrow.id));
  await expect(page.locator('#flights .flight')).toHaveCount(0);
});

test('hinted arrow blinks until a move and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const game = await current(page);
  await page.getByRole('button', { name: 'Hint', exact: true }).click();
  const ink = page.locator('#arrows .hinted .arrow-ink');
  await expect(ink).toHaveCount(1);
  expect(await ink.evaluate(node => getComputedStyle(node).animationName)).toBe('hint-pulse');
  const opacity = await ink.evaluate(async node => {
    const animation = node.getAnimations()[0];
    animation.pause();
    animation.currentTime = 600;
    await new Promise(requestAnimationFrame);
    return Number(getComputedStyle(node).opacity);
  });
  expect(opacity).toBeCloseTo(0.25, 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await ink.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  await page.locator(`#arrows [data-arrow-id="${available(game)[0].id}"]`).press('Enter');
  await expect(page.locator('#arrows .hinted')).toHaveCount(0);
});

test('footer links to the project repository', async ({ page, context }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: 'Source on GitHub' });
  await expect(link).toHaveAttribute('href', 'https://github.com/8YdUwVC8CZMa/mc.arrows');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('.footer-divider')).toBeVisible();
  await expect(page.locator('.toolbar #restart')).toBeVisible();
  await expect(page.locator('.toolbar #hint')).toBeVisible();
  expect(await page.locator('.footer-divider').evaluate(line => {
    const toolbar = document.querySelector('.toolbar')!.getBoundingClientRect();
    const footer = document.querySelector('footer')!.getBoundingClientRect();
    const divider = line.getBoundingClientRect();
    return divider.top >= toolbar.bottom && divider.bottom <= footer.top;
  })).toBe(true);
  const game = await current(page);
  await page.locator(`#arrows [data-arrow-id="${available(game)[0].id}"]`).press('Enter');
  await expect(page.locator('#message')).toBeEmpty();
  await context.route('https://github.com/8YdUwVC8CZMa/mc.arrows', route =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Repository</title>' }));
  const popup = page.waitForEvent('popup');
  await link.click();
  const repository = await popup;
  await expect(repository).toHaveURL('https://github.com/8YdUwVC8CZMa/mc.arrows');
  await repository.close();
});

test.describe('touch interaction', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('two-finger pinch zooms in and out around the midpoint without activating arrows', async ({ page, context }) => {
    await page.goto('/');
    const game = await current(page);
    await page.locator('#board-viewport').scrollIntoViewIfNeeded();
    const client = await context.newCDPSession(page);
    const width = async (): Promise<number> => (await page.locator('#board').boundingBox())!.width;
    const initialWidth = await width();
    const anchor = async (): Promise<{ x: number; y: number }> => page.locator('#board').evaluate(board => {
      const rect = board.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const initialAnchor = await anchor();
    async function pinch(from: number, to: number): Promise<void> {
      await page.locator('#board-viewport').scrollIntoViewIfNeeded();
      const viewport = (await page.locator('#board-viewport').boundingBox())!;
      const x = viewport.x + viewport.width / 2, y = viewport.y + viewport.height / 2;
      const touches = (radius: number): { x: number; y: number; id: number }[] =>
        [{ x: x - radius, y, id: 0 }, { x: x + radius, y, id: 1 }];
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(from) });
      for (let i = 1; i <= 6; i++) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(from + (to - from) * i / 6) });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await pinch(30, 60);
    expect(await width()).toBeCloseTo(initialWidth * 2, 0);
    expect(Math.abs((await anchor()).x - initialAnchor.x)).toBeLessThan(1.5);
    expect(Math.abs((await anchor()).y - initialAnchor.y)).toBeLessThan(1.5);
    await pinch(60, 45);
    expect(await width()).toBeCloseTo(initialWidth * 1.5, 0);
    await pinch(60, 70);
    expect(await width()).toBeCloseTo(initialWidth * 1.75, 0);
    await page.locator('#board-viewport').scrollIntoViewIfNeeded();
    await pinch(50, 10);
    expect(await width()).toBeCloseTo(initialWidth * 0.5, 0);
    const boardBox = (await page.locator('#board').boundingBox())!;
    const viewBox = (await page.locator('#board-viewport').boundingBox())!;
    expect(Math.abs(boardBox.x + boardBox.width / 2 - viewBox.x - viewBox.width / 2)).toBeLessThan(2);
    expect(Math.abs(boardBox.y + boardBox.height / 2 - viewBox.y - viewBox.height / 2)).toBeLessThan(2);
    expect(boardBox.height).toBeLessThan(viewBox.height * 0.55);
    await pinch(5, 70);
    expect(await width()).toBeCloseTo(initialWidth * 4, 0);
    await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
    await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length);
    await expect(page.locator('#guides line')).toHaveCount(0);
    await clickHead(page, available(game)[0], true);
    await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length - 1);
    await client.detach();
  });
  test('touch releases an arrow and sound preference persists', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Enable sound', exact: true }).tap();
    const initial = await current(page);
    await clickHead(page, available(initial)[0], true);
    await expect(page.locator('#arrows [role="button"]')).toHaveCount(initial.arrows.length - 1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Mute sound', exact: true })).toBeVisible();
    await expect(page.locator('#arrows [role="button"]')).toHaveCount(initial.arrows.length - 1);
  });
  test('a touch pan scrolls the zoomed board without removing arrows or costing hearts', async ({ page, context }) => {
    await page.goto('/');
    const game = await current(page);
    await pinchZoom(page, 2.75);
    await page.locator('#board-viewport').evaluate(view => { view.scrollTop = 0; view.scrollLeft = 0; });
    await page.locator('#board-viewport').scrollIntoViewIfNeeded();
    const box = (await page.locator('#board-viewport').boundingBox())!;
    const client = await context.newCDPSession(page);
    const x = box.x + box.width / 2, y = box.y + box.height * 0.7;
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 5; i++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 8, y: y - i * 22 }] });
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => page.locator('#board-viewport').evaluate(view => view.scrollTop)).toBeGreaterThan(0);
    await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length);
    await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
    await client.detach();
  });
});

test('only the winding stroke is hit-testable; empty bounding-box space cannot steal taps', async ({ page }) => {
  await page.goto('/');
  await pinchZoom(page, 1.75);
  const game = await current(page);
  const safe = available(game)[0];
  await clickHead(page, safe);
  await expect(page.locator(`[data-arrow-id="${safe.id}"]`)).toHaveCount(0);
  const checks = await page.locator('#arrows').evaluate(svg => {
    const matrix = (svg as SVGSVGElement).getScreenCTM()!;
    const view = document.querySelector('#board-viewport')!.getBoundingClientRect();
    let checked = 0;
    for (const anchor of svg.querySelectorAll<SVGCircleElement>('.arrow-anchor')) {
      const point = new DOMPoint(anchor.cx.baseVal.value, anchor.cy.baseVal.value).matrixTransform(matrix);
      if (point.x <= view.left || point.x >= view.right || point.y <= view.top || point.y >= view.bottom) continue;
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit?.closest('[data-arrow-id]') !== anchor.parentElement) throw new Error('A winding path stole another arrow head hit.');
      checked++;
    }
    return checked;
  });
  expect(checks).toBeGreaterThan(3);
});

test('mouse dragging a zoomed board pans it without tapping or losing hearts', async ({ page }) => {
  await page.goto('/');
  const game = await current(page);
  await pinchZoom(page, 2.75);
  await page.locator('#board-viewport').scrollIntoViewIfNeeded();
  const box = (await page.locator('#board-viewport').boundingBox())!;
  const before = await page.locator('#board-viewport').evaluate(view => ({ left: view.scrollLeft, top: view.scrollTop }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 - 80, { steps: 6 });
  await page.mouse.up();
  const after = await page.locator('#board-viewport').evaluate(view => ({ left: view.scrollLeft, top: view.scrollTop }));
  expect(after.left).toBeGreaterThan(before.left + 50);
  expect(after.top).toBeGreaterThan(before.top + 70);
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
  await clickHead(page, available(game)[0]);
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length - 1);
});

test('a winding tail can be tapped, not only the arrowhead', async ({ page }) => {
  await page.goto('/');
  const game = await current(page);
  const safe = available(game).find(arrow => bends(arrow) > 0)!;
  await page.locator('#board-viewport').scrollIntoViewIfNeeded();
  const point = await page.locator(`[data-arrow-id="${safe.id}"] .arrow-hit`).evaluate(node => {
    const path = node as SVGPathElement;
    const screen = path.getPointAtLength(0).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(`[data-arrow-id="${safe.id}"]`)).toHaveCount(0);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
});

test.describe('forgiving phone taps', () => {
  test.use({ hasTouch: true, isMobile: true, deviceScaleFactor: 3 });

  test('touch long-press guidance survives release without tapping or losing hearts', async ({ page }) => {
    await page.goto('/');
    const game = await current(page);
    const arrow = blocked(game);
    const anchor = page.locator(`#arrows [data-arrow-id="${arrow.id}"] .arrow-anchor`);
    await anchor.scrollIntoViewIfNeeded();
    const box = (await anchor.boundingBox())!;
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart',
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await expect(page.locator(`#guides line[data-arrow-id="${arrow.id}"]`)).toHaveCount(1);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('#guides line')).toHaveCount(1);
    await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length);
    await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
    await client.detach();
  });

  test('guide dots are visibly painted on a high-density phone at fit and zoomed sizes', async ({ page }) => {
    await page.goto('/');
    await page.locator('#board-viewport').scrollIntoViewIfNeeded();
    const game = await current(page);
    let fitRadius = 0;
    for (const zoomed of [false, true]) {
      if (zoomed) await pinchZoom(page, 1.75);
      const rect = (await page.locator('#board').boundingBox())!;
      const view = (await page.locator('#board-viewport').boundingBox())!;
      const scale = rect.width / (game.level.width * 100);
      const points = Array.from({ length: game.level.height }, (_, y) =>
        Array.from({ length: game.level.width }, (_, x) => center([x, y]))).flat();
      const point = points.find(point => {
        const x = rect.x + point[0] * scale, y = rect.y + point[1] * scale;
        return x > view.x + 20 && x < view.x + view.width - 20 &&
          y > view.y + 20 && y < view.y + view.height - 20 &&
          game.arrows.every(arrow => distanceToArrow(arrow, point) > 30);
      })!;
      expect(point).toBeTruthy();
      const radius = Number(await page.locator('#guide-dot').getAttribute('r')) * scale;
      expect(radius).toBeGreaterThanOrEqual(1.19);
      if (zoomed) expect(radius / fitRadius).toBeCloseTo(1.75, 1);
      else fitRadius = radius;
      const image = await page.locator('#board-viewport').screenshot({ scale: 'css' });
      const pixel = await page.evaluate(async ({ png, x, y }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        return [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      }, { png: image.toString('base64'), x: rect.x + point[0] * scale - view.x,
        y: rect.y + point[1] * scale - view.y });
      expect(pixel[0]).toBeLessThan(200);
      expect(pixel[1]).toBeLessThan(205);
      expect(pixel[2]).toBeLessThan(190);
    }
  });

  test('a tap in empty space near a free stroke releases it without losing a heart', async ({ page }) => {
    await page.goto('/');
    await page.locator('#board').scrollIntoViewIfNeeded();
    const game = await current(page);
    const rect = (await page.locator('#board').boundingBox())!;
    const scale = game.level.width * 100 / rect.width;
    const candidates = available(game).flatMap(arrow => arrow.path.flatMap(cell => {
      const [x, y] = center(cell);
      return [[x + 40, y], [x, y + 40], [x - 40, y], [x, y - 40]] as const;
    }));
    const point = candidates.find(point =>
      game.arrows.every(arrow => distanceToArrow(arrow, point) > 24) &&
      pickArrow(game, point, scale) !== undefined)!;
    expect(point).toBeTruthy();
    const selected = pickArrow(game, point, scale)!;
    expect(available(game).some(arrow => arrow.id === selected.id)).toBeTruthy();
    await page.touchscreen.tap(rect.x + point[0] / scale, rect.y + point[1] / scale);
    await expect(page.locator(`#arrows [data-arrow-id="${selected.id}"]`)).toHaveCount(0);
    await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
  });

  test('when no nearby arrow is free, a phone tap flows to the blocker and bounces back', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await pinchZoom(page, 4);
    const game = await current(page);
    const safe = new Set(available(game).map(arrow => arrow.id));
    const blockedArrow = game.arrows.find(arrow => {
      const contact = collision(arrow, game.arrows);
      return !safe.has(arrow.id) && contact && contact.distance > 100;
    })!;
    await page.locator(`#arrows [data-arrow-id="${blockedArrow.id}"] .arrow-anchor`).scrollIntoViewIfNeeded();
    const rect = (await page.locator('#board').boundingBox())!;
    const view = (await page.locator('#board-viewport').boundingBox())!;
    const scale = game.level.width * 100 / rect.width;
    let target: { x: number; y: number; arrow: Arrow } | undefined;
    for (let y = view.y + 10; y < view.y + view.height - 10 && !target; y += 6) {
      for (let x = view.x + 10; x < view.x + view.width - 10; x += 6) {
        const arrow = pickArrow(game, [(x - rect.x) * scale, (y - rect.y) * scale], scale);
        if (arrow && !safe.has(arrow.id) && collision(arrow, game.arrows)!.distance > 100) {
          target = { x, y, arrow };
          break;
        }
      }
    }
    expect(target).toBeTruthy();
    const impact = collision(target!.arrow, game.arrows)!;
    await page.touchscreen.tap(target!.x, target!.y);
    const flight = page.locator('#flights .flight-body');
    await expect(flight).toHaveCount(1);
    await expect(page.locator('#hint')).toBeDisabled();
    const offsets = await flight.evaluate(node => new Promise<number[]>(resolve => {
      const samples: number[] = [];
      function sample(): void {
        if (!node.isConnected) { resolve(samples); return; }
        samples.push(-Number(node.getAttribute('stroke-dashoffset') ?? 0));
        requestAnimationFrame(sample);
      }
      sample();
    }));
    expect(Math.max(...offsets)).toBeGreaterThan(impact.distance * 0.85);
    expect(Math.max(...offsets)).toBeLessThanOrEqual(impact.distance);
    expect(offsets.at(-1)!).toBeLessThan(impact.distance * 0.15);
    await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length);
    await expect(page.locator(`#arrows [data-arrow-id="${target!.arrow.id}"]`)).toBeVisible();
    await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '2 of 3 hearts remaining');
  });
});

test('snake exit follows its route while duplicate inputs are locked out', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const game = await current(page), safe = available(game)[0];
  await page.locator(`[data-arrow-id="${safe.id}"]`).press('Enter');
  await expect(page.locator('#flights .flight-body')).toHaveCount(1);
  expect(await page.locator('#flights .flight-body').getAttribute('stroke-dasharray')).toBeTruthy();
  const remaining = page.locator('#arrows [role="button"]').first();
  await expect(remaining).toHaveAttribute('aria-disabled', 'true');
  await remaining.dispatchEvent('click');
  await expect(page.locator('#flights .flight-body')).toHaveCount(0);
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(game.arrows.length - 1);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
});

test('bundled winding gameplay works after connectivity is lost', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('#arrows [role="button"]').first()).toBeVisible();
  await context.setOffline(true);
  await solve(page);
  await page.getByRole('button', { name: 'Next level' }).click();
  const next = await current(page);
  await clickHead(page, available(next)[0]);
  await expect(page.locator('#arrows [role="button"]')).toHaveCount(next.arrows.length - 1);
});

test('One opens the photo surprise, which dismisses on click or after three seconds without changing play', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const initial = await current(page);
  await pinchZoom(page, 1.75);
  const zoomedWidth = (await page.locator('#board').boundingBox())!.width;
  await page.getByRole('button', { name: 'One', exact: true }).click();
  const surprise = page.getByRole('dialog', { name: 'Photo surprise' });
  await expect(surprise).toBeVisible();
  const photo = surprise.locator('img');
  await expect(photo).toBeVisible();
  expect(await photo.evaluate(node => node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0)).toBe(true);
  await expect(photo).toHaveAttribute('src', '/surprise.jpg');
  await expect(page.locator('.love-hearts')).toHaveCount(0);
  expect(await surprise.evaluate(node => getComputedStyle(node, '::backdrop').backdropFilter)).toBe('blur(10px)');
  const photoBox = (await photo.boundingBox())!;
  expect(photoBox.width).toBeLessThanOrEqual(390);
  expect(photoBox.height).toBeLessThanOrEqual(844);
  await page.mouse.click(10, 10);
  await expect(surprise).not.toBeVisible();
  expect((await page.locator('#board').boundingBox())!.width).toBeCloseTo(zoomedWidth, 0);
  expect(await current(page)).toEqual(initial);
  await expect(page.locator('#hearts')).toHaveAttribute('aria-label', '3 of 3 hearts remaining');
  await page.getByRole('button', { name: 'One', exact: true }).click();
  await page.waitForTimeout(2200);
  await expect(surprise).toBeVisible();
  await expect(surprise).not.toBeVisible({ timeout: 1500 });
  expect(await current(page)).toEqual(initial);
});

test('old saves retain milestones and stars with an explicit migration notice', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('drift-arrows-v1', JSON.stringify({
      version: 1, unlocked: 2, selected: 1, completed: [1], perfect: [1], sound: false,
      session: { level: 1, moves: ['c'], mistakes: 1, hints: 0 },
    }));
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('old straight-arrow attempt was replaced');
  await page.locator('#levels').click();
  await expect(page.getByRole('button', { name: 'Level 1, perfect', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Level 2', exact: true })).toBeEnabled();
});
