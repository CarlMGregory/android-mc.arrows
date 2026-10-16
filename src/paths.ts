import { available, direction, phase, vectors, type Arrow, type Cell, type Game } from './engine';

export const UNIT = 100;
export const ARROW_COLORS = ['#314d73', '#633b70', '#286052', '#784128', '#773c50', '#4e5427', '#3d5060', '#554381'] as const;
export function arrowColor(seed: number, id: string): string {
  let hash = seed >>> 0;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  hash ^= hash >>> 16;
  return ARROW_COLORS[(hash >>> 0) % ARROW_COLORS.length];
}
export function center([x, y]: Cell): Cell { return [x * UNIT + UNIT / 2, y * UNIT + UNIT / 2]; }
export function polyline(points: readonly Cell[]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
}
export function arrowGeometry(arrow: Arrow): { body: string; head: string } {
  const [hx, hy] = center(arrow.path[0]);
  const [dx, dy] = vectors[direction(arrow)];
  const tipX = hx + dx * 25, tipY = hy + dy * 25;
  const backX = hx - dx * 7, backY = hy - dy * 7;
  return {
    body: polyline([...arrow.path].reverse().map(center)) + `L${tipX} ${tipY}`,
    head: `M${backX - dy * 22} ${backY + dx * 22}L${tipX} ${tipY}L${backX + dy * 22} ${backY - dx * 22}`,
  };
}

export function distanceToArrow(arrow: Arrow, [x, y]: Cell): number {
  const points = arrow.path.map(center);
  const [hx, hy] = points[0];
  const [dx, dy] = vectors[direction(arrow)];
  const tip: Cell = [hx + dx * 25, hy + dy * 25];
  const segments: (readonly [Cell, Cell])[] = [
    [tip, points[0]],
    [tip, [hx - dx * 7 - dy * 22, hy - dy * 7 + dx * 22]],
    [tip, [hx - dx * 7 + dy * 22, hy - dy * 7 - dx * 22]],
    ...points.slice(1).map((point, i) => [points[i], point] as const),
  ];
  return Math.min(...segments.map(([[ax, ay], [bx, by]]) => {
    const vx = bx - ax, vy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - ax - t * vx, y - ay - t * vy);
  }));
}

/** Finger-sized screen-space tolerance, independent of board density and zoom. */
export function pickArrow(game: Game, point: Cell, unitsPerPixel: number, preferFree = true): Arrow | undefined {
  if (phase(game) !== 'playing') return undefined;
  const nearby = game.arrows.map(arrow => ({ arrow, distance: distanceToArrow(arrow, point) }))
    .filter(candidate => candidate.distance <= 18 * unitsPerPixel + 6.5)
    .sort((a, b) => a.distance - b.distance);
  const safe = new Set(preferFree ? available(game).map(arrow => arrow.id) : []);
  return nearby.find(candidate => safe.has(candidate.arrow.id))?.arrow ?? nearby[0]?.arrow;
}

export function collision(arrow: Arrow, arrows: readonly Arrow[]): { blocker: Arrow; distance: number } | undefined {
  const [hx, hy] = arrow.path[0];
  const [dx, dy] = vectors[direction(arrow)];
  let nearest: { blocker: Arrow; distance: number } | undefined;
  for (const blocker of arrows) {
    if (blocker.id === arrow.id) continue;
    for (const [x, y] of blocker.path) {
      const ahead = (x - hx) * dx + (y - hy) * dy;
      const across = (x - hx) * dy - (y - hy) * dx;
      if (across !== 0 || ahead <= 0) continue;
      const distance = ahead * UNIT - 25 - 13;
      if (!nearest || distance < nearest.distance) nearest = { blocker, distance };
    }
  }
  return nearest;
}

export function exitGeometry(arrow: Arrow, width: number, height: number): {
  route: string; head: string; length: number; distance: number; dx: number; dy: number;
} {
  const [hx, hy] = center(arrow.path[0]);
  const [dx, dy] = vectors[direction(arrow)];
  const length = (arrow.path.length - 1) * UNIT + 25;
  const toEdge = dx > 0 ? width * UNIT - hx : dx < 0 ? hx : dy > 0 ? height * UNIT - hy : hy;
  const distance = length + toEdge + UNIT;
  const route = polyline([...arrow.path].reverse().map(center)) +
    `L${hx + dx * (distance + UNIT)} ${hy + dy * (distance + UNIT)}`;
  return { route, head: arrowGeometry(arrow).head, length, distance, dx, dy };
}
