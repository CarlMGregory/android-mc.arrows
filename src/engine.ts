export type Direction = 'north' | 'east' | 'south' | 'west';
export type Cell = readonly [number, number];
export interface Arrow {
  readonly id: string;
  /** Ordered from head to tail, one orthogonally adjacent grid cell per point. */
  readonly path: readonly Cell[];
}
export interface Level {
  readonly number: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  readonly title: string;
  readonly arrows: readonly Arrow[];
}
export interface Game {
  readonly level: Level;
  readonly arrows: readonly Arrow[];
  readonly moves: readonly string[];
  readonly mistakes: number;
  readonly hints: number;
}
export const HEARTS = 3;
export const LEVEL_PAGE_SIZE = 24;
export const vectors: Record<Direction, readonly [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
export const directions = Object.keys(vectors) as Direction[];

export function cells(arrow: Arrow): readonly Cell[] {
  return arrow.path;
}

export function direction(arrow: Arrow): Direction {
  const [head, neck] = arrow.path;
  const dx = head[0] - neck[0];
  const dy = head[1] - neck[1];
  const result = directions.find(name => vectors[name][0] === dx && vectors[name][1] === dy);
  if (!result) throw new Error(`Arrow ${arrow.id} has no valid head direction.`);
  return result;
}

export function canExit(arrow: Arrow, arrows: readonly Arrow[], width: number, height = width): boolean {
  const occupied = new Set(arrows.filter(other => other.id !== arrow.id)
    .flatMap(other => cells(other).map(([x, y]) => `${x},${y}`)));
  const [dx, dy] = vectors[direction(arrow)];
  const [headX, headY] = arrow.path[0];
  for (let x = headX + dx, y = headY + dy; x >= 0 && y >= 0 && x < width && y < height; x += dx, y += dy) {
    if (occupied.has(`${x},${y}`)) return false;
  }
  return true;
}

export function available(game: Game): readonly Arrow[] {
  if (phase(game) !== 'playing') return [];
  // Share one occupancy map across all candidates on a dense board.
  const occupied = new Map<string, string>();
  for (const arrow of game.arrows) for (const [x, y] of arrow.path) occupied.set(`${x},${y}`, arrow.id);
  return game.arrows.filter(arrow => {
    const [dx, dy] = vectors[direction(arrow)];
    const [hx, hy] = arrow.path[0];
    for (let x = hx + dx, y = hy + dy; x >= 0 && y >= 0 && x < game.level.width && y < game.level.height; x += dx, y += dy) {
      const owner = occupied.get(`${x},${y}`);
      if (owner !== undefined && owner !== arrow.id) return false;
    }
    return true;
  });
}

export function phase(game: Game): 'playing' | 'won' | 'lost' {
  if (game.arrows.length === 0) return 'won';
  return game.mistakes >= HEARTS ? 'lost' : 'playing';
}

export function startGame(level: Level): Game {
  return { level, arrows: [...level.arrows], moves: [], mistakes: 0, hints: 0 };
}

export function tap(game: Game, id: string): { game: Game; outcome: 'removed' | 'blocked' | 'ignored' } {
  const arrow = game.arrows.find(item => item.id === id);
  if (phase(game) !== 'playing' || !arrow) return { game, outcome: 'ignored' };
  if (!canExit(arrow, game.arrows, game.level.width, game.level.height)) {
    return { game: { ...game, mistakes: game.mistakes + 1 }, outcome: 'blocked' };
  }
  return {
    game: { ...game, arrows: game.arrows.filter(item => item.id !== id), moves: [...game.moves, id] },
    outcome: 'removed',
  };
}

export function hint(game: Game): { game: Game; arrow?: Arrow } {
  const arrow = available(game)[0];
  return arrow ? { game: { ...game, hints: game.hints + 1 }, arrow } : { game };
}

function random(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

export function bends(arrow: Arrow): number {
  let count = 0;
  for (let i = 2; i < arrow.path.length; i++) {
    const [a, b, c] = [arrow.path[i - 2], arrow.path[i - 1], arrow.path[i]];
    if (b[0] - a[0] !== c[0] - b[0] || b[1] - a[1] !== c[1] - b[1]) count++;
  }
  return count;
}

/** Independently checks geometry and finds a complete blocker-free removal order. */
export function solution(level: Level): readonly string[] {
  const owners = new Map<string, string>();
  const ids = new Set<string>();
  if (!Number.isInteger(level.width) || !Number.isInteger(level.height) || level.width < 1 || level.height < 1) {
    throw new Error('Puzzle dimensions must be positive integers.');
  }
  for (const arrow of level.arrows) {
    if (ids.has(arrow.id) || arrow.path.length < 2) throw new Error(`Invalid arrow ${arrow.id}.`);
    ids.add(arrow.id);
    for (let i = 0; i < arrow.path.length; i++) {
      const [x, y] = arrow.path[i];
      const previous = arrow.path[i - 1];
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= level.width || y >= level.height ||
          (previous && Math.abs(x - previous[0]) + Math.abs(y - previous[1]) !== 1)) {
        throw new Error(`Arrow ${arrow.id} has an invalid path.`);
      }
      const key = `${x},${y}`;
      if (owners.has(key)) throw new Error(`Puzzle paths overlap at ${key}.`);
      owners.set(key, arrow.id);
    }
  }
  const blockers = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();
  const order: string[] = [];
  for (const arrow of level.arrows) {
    const required = new Set<string>();
    const [dx, dy] = vectors[direction(arrow)];
    const [hx, hy] = arrow.path[0];
    for (let x = hx + dx, y = hy + dy; x >= 0 && y >= 0 && x < level.width && y < level.height; x += dx, y += dy) {
      const owner = owners.get(`${x},${y}`);
      if (owner === arrow.id) throw new Error(`Arrow ${arrow.id} blocks its own exit.`);
      if (owner !== undefined) required.add(owner);
    }
    blockers.set(arrow.id, required);
    if (required.size === 0) order.push(arrow.id);
    for (const blocker of required) {
      if (!dependents.has(blocker)) dependents.set(blocker, new Set());
      dependents.get(blocker)!.add(arrow.id);
    }
  }
  for (let i = 0; i < order.length; i++) {
    for (const dependent of dependents.get(order[i]) ?? []) {
      const required = blockers.get(dependent)!;
      required.delete(order[i]);
      if (required.size === 0) order.push(dependent);
    }
  }
  if (order.length !== level.arrows.length) {
    const jammed = [...blockers].filter(([, required]) => required.size > 0).map(([id]) => id);
    throw new Error(`Puzzle is jammed: circular blockers among ${jammed.join(', ')}.`);
  }
  return order;
}

export function makeLevel(number: number, seed = newSeed()): Level {
  if (!Number.isSafeInteger(number) || number < 1) throw new RangeError('Level must be a positive safe integer');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Invalid puzzle seed');
  for (let variant = 0; variant < 16; variant++) {
    const level = generateLevel(number, seed, variant);
    const filled = level.arrows.reduce((sum, arrow) => sum + arrow.path.length, 0);
    const lengths = level.arrows.map(arrow => arrow.path.length);
    if (level.arrows.length >= 25 && filled >= level.width * level.height * 0.58 &&
        Math.max(...lengths) >= 25 && Math.max(...lengths) - Math.min(...lengths) >= 20 &&
        level.arrows.filter(arrow => bends(arrow) > 0).length >= level.arrows.length * 0.55 &&
        Math.max(...level.arrows.map(bends)) >= 5) {
      solution(level);
      return level;
    }
  }
  throw new Error(`Could not construct a sufficiently populated winding puzzle (seed ${seed}).`);
}

function generateLevel(number: number, seed: number, variant: number): Level {
  const rng = random((seed + Math.imul(variant, 0x9e3779b9)) >>> 0);
  const width = 20 + Math.floor(rng() * 21);
  const height = 24 + Math.floor(rng() * 27);
  const total = width * height;
  const occupied = new Uint8Array(total);
  const target = Math.floor(total * (0.78 + rng() * 0.14));
  const arrows: Arrow[] = [];
  let filled = 0;
  const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  const turnChance = 0.15 + rng() * 0.3;
  const longChance = 0.15 + rng() * 0.3;
  // Insert only arrows with a clear head ray; reverse insertion remains a solution.
  for (let attempt = 0; attempt < total * 80 && filled < target; attempt++) {
    const x = Math.floor(rng() * width);
    const y = Math.floor(rng() * height);
    if (occupied[y * width + x]) continue;
    const [dx, dy] = vectors[directions[Math.floor(rng() * directions.length)]];
    const ray = new Set<number>();
    let clear = true;
    for (let rx = x + dx, ry = y + dy; inside(rx, ry); rx += dx, ry += dy) {
      const index = ry * width + rx;
      if (occupied[index]) { clear = false; break; }
      ray.add(index);
    }
    if (!clear) continue;
    const path: Cell[] = [[x, y]];
    const used = new Set([y * width + x]);
    let stepX = -dx;
    let stepY = -dy;
    const desired = rng() < longChance ? 20 + Math.floor(rng() * 85) : 3 + Math.floor(rng() * 15);
    for (let i = 1; i < desired; i++) {
      const [px, py] = path[path.length - 1];
      const straight: Cell = [stepX, stepY];
      const left: Cell = [-stepY, stepX];
      const right: Cell = [stepY, -stepX];
      const turns = rng() < 0.5 ? [left, right] : [right, left];
      const options = i === 1 ? [straight]
        : rng() < turnChance ? [...turns, straight] : [straight, ...turns];
      const next = options.find(([sx, sy]) => {
        const nx = px + sx, ny = py + sy, index = ny * width + nx;
        return inside(nx, ny) && !occupied[index] && !used.has(index) && !ray.has(index);
      });
      if (!next) break;
      [stepX, stepY] = next;
      const cell: Cell = [px + stepX, py + stepY];
      path.push(cell);
      used.add(cell[1] * width + cell[0]);
    }
    if (path.length < 2) continue;
    arrows.push({ id: `a${arrows.length}`, path });
    for (const index of used) occupied[index] = 1;
    filled += path.length;
  }
  const titles = ['Winding ways', 'Open water', 'Gentle turns', 'Find the flow', 'Quiet crossing', 'Untangle'];
  return { number, seed, width, height, title: titles[(number - 1) % titles.length], arrows };
}
