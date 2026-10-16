import test from 'node:test';
import assert from 'node:assert/strict';
import { available, bends, canExit, cells, direction, directions, HEARTS, hint, makeLevel, phase, solution, startGame, tap, vectors, type Arrow, type Cell, type Level } from '../src/engine';
import { ARROW_COLORS, arrowColor, arrowGeometry, collision, distanceToArrow, exitGeometry, pickArrow } from '../src/paths';

export function fixture(): Level {
  return {
    number: 1, seed: 1, width: 8, height: 7, title: 'Test crossing',
    arrows: [
      { id: 'a', path: [[1, 3], [0, 3], [0, 4], [1, 4], [2, 4]] },
      { id: 'b', path: [[4, 1], [4, 2], [4, 3], [5, 3], [5, 4]] },
      { id: 'c', path: [[5, 0], [4, 0], [3, 0], [3, 1]] },
    ],
  };
}

test('forgiving taps prefer nearby free strokes, otherwise the nearest blocked stroke', () => {
  const game = startGame(fixture());
  const point: Cell = [150, 350];
  assert.equal(distanceToArrow(game.arrows[0], point), 0);
  assert.equal(pickArrow(game, point, 1)?.id, 'a');
  // At fit scale, the nearby free arrow wins even over an exact blocked hit.
  assert.equal(pickArrow(game, point, 20)?.id, 'c');
  assert.equal(pickArrow(game, point, 20, false)?.id, 'a');
  assert.equal(pickArrow(game, [-1000, -1000], 1), undefined);
  const free = game.arrows[2];
  assert.equal(pickArrow(game, [550, 66], 1)?.id, free.id);
  assert.equal(pickArrow(game, [550, -10], 1), undefined);
  assert.equal(pickArrow({ ...game, mistakes: HEARTS }, point, 1), undefined);
});

test('collision travel stops at the nearest blocking body in every direction', () => {
  for (const name of directions) {
    const [dx, dy] = vectors[name];
    const arrow: Arrow = { id: 'subject', path: [[3, 3], [3 - dx, 3 - dy]] };
    const near: Arrow = { id: 'near', path: [[3 + dx * 2, 3 + dy * 2], [3 + dx * 2 + dy, 3 + dy * 2 - dx]] };
    const far: Arrow = { id: 'far', path: [[3 + dx * 3, 3 + dy * 3], [3 + dx * 3 + dy, 3 + dy * 3 - dx]] };
    assert.deepEqual(collision(arrow, [arrow, far, near]), { blocker: near, distance: 162 });
    assert.equal(collision(arrow, [arrow]), undefined);
  }
});

test('seeded arrow colors are varied, repeatable and high contrast on the board', () => {
  const luminance = (hex: string): number => {
    const rgb = hex.match(/[0-9a-f]{2}/gi)!.map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const color of ARROW_COLORS) assert.ok((luminance('#fbfaf5') + 0.05) / (luminance(color) + 0.05) >= 4.5);
  const colors = Array.from({ length: 100 }, (_, i) => arrowColor(42, `a${i}`));
  assert.ok(new Set(colors).size >= 6);
  assert.deepEqual(colors, Array.from({ length: 100 }, (_, i) => arrowColor(42, `a${i}`)));
  assert.notDeepEqual(colors, Array.from({ length: 100 }, (_, i) => arrowColor(43, `a${i}`)));
});

test('all four exit rays include intervening cells and exclude cells behind', () => {
  for (const name of directions) {
    const [dx, dy] = vectors[name];
    const arrow: Arrow = { id: 'subject', path: [[3, 3], [3 - dx, 3 - dy]] };
    const ahead: Cell = [3 + dx * 3, 3 + dy * 3];
    const blocker: Arrow = { id: 'blocker', path: [ahead, [ahead[0] + dy, ahead[1] - dx]] };
    assert.equal(direction(arrow), name);
    assert.equal(canExit(arrow, [arrow], 7), true);
    assert.equal(canExit(arrow, [arrow, blocker], 7), false);
    const behind: Arrow = { id: 'behind', path: [[3 - dx * 2, 3 - dy * 2], [3 - dx * 3, 3 - dy * 3]] };
    assert.equal(canExit(arrow, [arrow, behind], 7), true);
  }
});

test('any part of a winding body blocks a head ray, not its bounding rectangle', () => {
  const level = fixture();
  assert.equal(canExit(level.arrows[0], level.arrows, level.width, level.height), false);
  assert.equal(canExit(level.arrows[1], level.arrows, level.width, level.height), false);
  assert.equal(canExit(level.arrows[2], level.arrows, level.width, level.height), true);
  const bent: Arrow = { id: 'bent', path: [[4, 1], [5, 1], [5, 2], [5, 3]] };
  const throughGap: Arrow = { id: 'gap', path: [[4, 2], [3, 2]] };
  assert.equal(canExit(throughGap, [bent, throughGap], 8, 7), false);
  const emptyColumn: Arrow = { id: 'column', path: [[4, 2], [4, 3]] };
  assert.equal(canExit(emptyColumn, [bent, emptyColumn], 8, 7), false);
  const clear: Arrow = { id: 'clear', path: [[3, 2], [2, 2]] };
  assert.equal(canExit(clear, [clear, { id: 'u', path: [[5, 4], [5, 3], [5, 2], [4, 2], [4, 3], [4, 4]] }], 8, 7), false);
  const inGap: Arrow = { id: 'inside', path: [[4, 3], [3, 3]] };
  assert.equal(canExit(inGap, [inGap, { id: 'u', path: [[5, 1], [4, 1], [3, 1], [3, 2]] }], 8, 7), true);
});

test('rectangular boards use the correct vertical edge', () => {
  const arrow: Arrow = { id: 'a', path: [[1, 2], [1, 1]] };
  const blocker: Arrow = { id: 'b', path: [[1, 7], [2, 7]] };
  assert.equal(canExit(arrow, [arrow, blocker], 4, 9), false);
  assert.equal(canExit(arrow, [arrow, blocker], 4, 6), true);
});

test('blocked taps cost hearts; terminal and unknown taps are immutable', () => {
  let game = startGame(fixture());
  const initial = game;
  assert.equal(tap(game, 'missing').game, initial);
  for (let i = 1; i <= HEARTS; i++) {
    const result = tap(game, 'a');
    assert.equal(result.outcome, 'blocked');
    game = result.game;
    assert.equal(game.arrows.length, 3);
    assert.equal(game.mistakes, i);
  }
  assert.equal(phase(game), 'lost');
  assert.equal(tap(game, 'c').game, game);
  assert.equal(hint(game).arrow, undefined);
  assert.deepEqual(available(game), []);
  assert.equal(initial.mistakes, 0);
});

test('winding dependencies, hints and perfect completion work', () => {
  let game = startGame(fixture());
  const result = hint(game);
  assert.equal(result.arrow?.id, 'c');
  game = result.game;
  assert.equal(game.hints, 1);
  assert.equal(game.mistakes, 0);
  for (const id of ['c', 'b', 'a']) {
    const result = tap(game, id);
    assert.equal(result.outcome, 'removed');
    game = result.game;
  }
  assert.equal(phase(game), 'won');
  assert.equal(tap(game, 'a').game, game);
  assert.equal(hint(game).arrow, undefined);
});

test('250 seeded boards are dense, winding, non-intersecting and solvable', () => {
  const counts = new Set<number>(), widths = new Set<number>(), heights = new Set<number>();
  let maxCount = 0, longest = 0;
  for (let i = 0; i < 250; i++) {
    const seed = Math.imul(i + 1, 2654435761) >>> 0;
    const level = makeLevel(i + 1, seed);
    assert.deepEqual(makeLevel(level.number, seed), level);
    assert.ok(level.width >= 20 && level.width <= 40);
    assert.ok(level.height >= 24 && level.height <= 50);
    assert.ok(level.arrows.length >= 20, `Too few arrows: seed ${seed}`);
    assert.ok(level.arrows.length > available(startGame(level)).length, `No dependencies: seed ${seed}`);
    assert.equal(new Set(level.arrows.map(a => a.id)).size, level.arrows.length);
    const occupied = new Set<string>();
    for (const arrow of level.arrows) {
      assert.ok(arrow.path.length >= 2);
      let previous: Cell | undefined;
      for (const [x, y] of cells(arrow)) {
        assert.ok(x >= 0 && x < level.width && y >= 0 && y < level.height);
        const key = `${x},${y}`;
        assert.equal(occupied.has(key), false, `Overlap/self-intersection: seed ${seed}`);
        if (previous) assert.equal(Math.abs(x - previous[0]) + Math.abs(y - previous[1]), 1);
        previous = [x, y];
        occupied.add(key);
      }
      // The head never exits through its own winding tail.
      const [dx, dy] = vectors[direction(arrow)];
      const [hx, hy] = arrow.path[0];
      assert.equal(arrow.path.slice(1).some(([x, y]) =>
        (dx !== 0 ? y === hy && (x - hx) * dx > 0 : x === hx && (y - hy) * dy > 0)), false);
    }
    assert.ok(occupied.size / (level.width * level.height) >= 0.5, `Too sparse: seed ${seed}`);
    const lengths = level.arrows.map(a => a.path.length);
    assert.ok(Math.max(...lengths) >= 20, `No long paths: seed ${seed}`);
    assert.ok(Math.max(...lengths) - Math.min(...lengths) >= 15);
    assert.ok(level.arrows.filter(a => bends(a) > 0).length / level.arrows.length >= 0.5);
    assert.ok(Math.max(...level.arrows.map(bends)) >= 5);
    let game = startGame(level);
    for (const arrow of [...level.arrows].reverse()) {
      assert.equal(canExit(arrow, game.arrows, level.width, level.height), true, `Reverse solution: seed ${seed}`);
      game = tap(game, arrow.id).game;
    }
    assert.equal(phase(game), 'won');
    game = startGame(level);
    while (phase(game) === 'playing') {
      const next = available(game)[0];
      assert.ok(next, `Greedy deadlock: seed ${seed}`);
      game = tap(game, next.id).game;
    }
    assert.equal(phase(game), 'won');
    counts.add(level.arrows.length); widths.add(level.width); heights.add(level.height);
    maxCount = Math.max(maxCount, level.arrows.length);
    longest = Math.max(longest, ...lengths);
  }
  assert.ok(counts.size >= 40);
  assert.equal(widths.size, 21);
  assert.equal(heights.size, 27);
  assert.ok(maxCount >= 100);
  assert.ok(longest >= 80);
});

test('random visits are new but an explicit seed reconstructs precisely, including seed zero', () => {
  const a = makeLevel(1), b = makeLevel(1);
  assert.notEqual(a.seed, b.seed);
  assert.notDeepEqual(a.arrows, b.arrows);
  assert.deepEqual(makeLevel(1, a.seed), a);
  assert.deepEqual(makeLevel(1, 0), makeLevel(1, 0));
  for (const value of [0, -1, NaN, Infinity, 2.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => makeLevel(value), RangeError);
  for (const value of [-1, NaN, 1.5, 4294967296]) assert.throws(() => makeLevel(1, value), RangeError);
});

test('generation continues well beyond the former campaign with no final level', () => {
  for (const number of [24, 25, 26, 100, 975, 10000, 1000000, 1000000000000]) {
    const level = makeLevel(number, 42);
    assert.equal(level.number, number);
    assert.equal(solution(level).length, level.arrows.length);
    assert.deepEqual(level.arrows, makeLevel(1, 42).arrows);
  }
});

test('rendering follows every bend; exit animation extends the tail-to-head route, not a rigid translation', () => {
  const arrow = fixture().arrows[0];
  assert.equal(arrowGeometry(arrow).body, 'M250 450L150 450L50 450L50 350L150 350L175 350');
  const geometry = exitGeometry(arrow, 8, 7);
  assert.ok(geometry.route.startsWith('M250 450L150 450L50 450L50 350L150 350L'));
  assert.equal(geometry.length, 425);
  assert.ok(geometry.distance > geometry.length + 650);
  assert.deepEqual([geometry.dx, geometry.dy], [1, 0]);
  for (const name of directions) {
    const [dx, dy] = vectors[name];
    const a: Arrow = { id: name, path: [[3, 3], [3 - dx, 3 - dy]] };
    assert.deepEqual([exitGeometry(a, 8, 7).dx, exitGeometry(a, 8, 7).dy], [dx, dy]);
  }
});

test('independent validator rejects mutual jams, winding-body jams and longer blocker cycles', () => {
  const level = fixture();
  const mutual: Arrow[] = [
    { id: 'left', path: [[1, 1], [0, 1]] },
    { id: 'right', path: [[3, 1], [4, 1]] },
  ];
  const winding: Arrow[] = [
    { id: 'a', path: [[1, 1], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3]] },
    { id: 'b', path: [[3, 1], [3, 0], [4, 0], [4, 1], [4, 2]] },
  ];
  const cycle: Arrow[] = [
    { id: 'east', path: [[1, 1], [0, 1]] },
    { id: 'south', path: [[3, 1], [3, 0]] },
    { id: 'west', path: [[3, 3], [4, 3]] },
    { id: 'north', path: [[1, 3], [1, 4]] },
  ];
  for (const arrows of [mutual, winding, cycle]) {
    assert.equal(available(startGame({ ...level, arrows })).length, 0);
    assert.throws(() => solution({ ...level, arrows }), /jammed: circular blockers/);
  }
  const free: Arrow = { id: 'free', path: [[7, 6], [6, 6]] };
  assert.throws(() => solution({ ...level, arrows: [...mutual, free] }), /jammed/);
  const selfBlocked: Arrow = { id: 'self', path: [[1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1]] };
  assert.throws(() => solution({ ...level, arrows: [selfBlocked] }), /blocks its own exit/);
});

test('validator rejects broken geometry and returns a working complete solution', () => {
  const level = fixture();
  for (const arrows of [
    [...level.arrows, level.arrows[0]],
    [{ id: 'short', path: [[1, 1]] }],
    [{ id: 'diagonal', path: [[1, 1], [2, 2]] }],
    [{ id: 'outside', path: [[-1, 1], [0, 1]] }],
    [{ id: 'overlap', path: [[1, 1], [0, 1], [0, 2], [1, 2], [1, 1]] }],
  ] satisfies Arrow[][]) assert.throws(() => solution({ ...level, arrows }));
  let game = startGame(level);
  for (const id of solution(level)) {
    const result = tap(game, id);
    assert.equal(result.outcome, 'removed');
    game = result.game;
  }
  assert.equal(phase(game), 'won');
});

test('every legal choice preserves solvability; no player ordering can create a jam', () => {
  function explore(game: ReturnType<typeof startGame>): void {
    if (phase(game) === 'won') return;
    const safe = available(game);
    assert.ok(safe.length > 0, 'A legal move sequence created a jam.');
    for (const arrow of safe) {
      const next = tap(game, arrow.id).game;
      assert.equal(solution({ ...next.level, arrows: next.arrows }).length, next.arrows.length);
      explore(next);
    }
  }
  explore(startGame(fixture()));
  for (let seed = 0; seed < 64; seed++) {
    let game = startGame(makeLevel(1, Math.imul(seed + 1, 2246822519) >>> 0));
    let step = seed;
    while (phase(game) === 'playing') {
      const choices = available(game);
      assert.ok(choices.length > 0, `Jammed after legal choices, seed ${seed}`);
      const chosen = choices[(step++ * 17) % choices.length];
      game = tap(game, chosen.id).game;
      assert.equal(solution({ ...game.level, arrows: game.arrows }).length, game.arrows.length);
    }
    assert.equal(phase(game), 'won');
    assert.equal(game.mistakes, 0);
  }
});
