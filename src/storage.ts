import { HEARTS, makeLevel, startGame, tap, type Game } from './engine';

export interface Progress {
  version: 3;
  unlocked: number;
  selected: number;
  perfect: number[];
  sound: boolean;
  session: { level: number; seed: number; moves: string[]; mistakes: number; hints: number } | null;
}
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const SAVE_KEY = 'drift-arrows-v1';
export function freshProgress(): Progress {
  return { version: 3, unlocked: 1, selected: 1, perfect: [], sound: false, session: null };
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
function levelList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(n => integer(n, 1, Number.MAX_SAFE_INTEGER)) && new Set(value).size === value.length;
}

export function restoreSession(session: NonNullable<Progress['session']>): Game {
  let game = startGame(makeLevel(session.level, session.seed));
  for (const id of session.moves) {
    const result = tap(game, id);
    if (result.outcome !== 'removed') throw new Error('Saved moves do not match this level.');
    game = result.game;
  }
  if (game.arrows.length === 0 && session.mistakes >= HEARTS) throw new Error('Saved attempt has conflicting outcomes.');
  return { ...game, mistakes: session.mistakes, hints: session.hints };
}

function parseProgress(value: unknown): Progress {
  if (!record(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3) ||
    !integer(value.unlocked, 1, Number.MAX_SAFE_INTEGER) || !integer(value.selected, 1, value.unlocked) ||
    !levelList(value.perfect) || typeof value.sound !== 'boolean') {
    throw new Error('Saved progress has an unsupported or invalid format.');
  }
  let unlocked = value.unlocked;
  if (value.version < 3) {
    const completed = value.completed;
    if (!levelList(completed) || completed.some(n => n > unlocked)) throw new Error('Saved level progress is inconsistent.');
    const sorted = [...completed].sort((a, b) => a - b);
    if (sorted.length < unlocked - 1 || sorted.some((n, i) => n !== i + 1)) {
      throw new Error('Saved level progress is inconsistent.');
    }
    // The old finite campaign could save level 24 as complete without unlocking 25.
    if (sorted.length === unlocked) unlocked++;
  }
  if (!Number.isSafeInteger(unlocked) || value.perfect.some(n => n >= unlocked)) {
    throw new Error('Saved level progress is inconsistent.');
  }
  let session: Progress['session'] = null;
  // Old straight-arrow attempts cannot be replayed on the new generator.
  if (value.version >= 2 && value.session !== null) {
    const s = value.session;
    if (!record(s) || s.level !== value.selected || !integer(s.level, 1, value.unlocked) ||
        !integer(s.seed, 0, 0xffffffff) || !Array.isArray(s.moves) || !s.moves.every(id => typeof id === 'string') ||
        !integer(s.mistakes, 0, HEARTS) || !integer(s.hints, 0, Number.MAX_SAFE_INTEGER)) {
      throw new Error('Saved attempt is invalid.');
    }
    session = { level: s.level, seed: s.seed, moves: s.moves, mistakes: s.mistakes, hints: s.hints };
    restoreSession(session);
  }
  return { version: 3, unlocked, selected: value.selected,
    perfect: value.perfect, sound: value.sound, session };
}

export function loadProgress(storage: StoragePort): { progress: Progress; error?: string; notice?: string } {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return { progress: freshProgress() };
    const parsed: unknown = JSON.parse(raw);
    const progress = parseProgress(parsed);
    const migrated = record(parsed) && parsed.version === 1;
    return { progress, notice: migrated
      ? 'New winding puzzles are here. Completed levels and stars were kept; the old straight-arrow attempt was replaced.'
      : undefined };
  } catch (error) {
    return { progress: freshProgress(), error: `Progress could not be loaded. ${error instanceof Error ? error.message : String(error)}` };
  }
}

export function saveProgress(storage: StoragePort, progress: Progress): string | undefined {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(progress));
    return undefined;
  } catch (error) {
    return `Progress could not be saved. ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function withGame(progress: Progress, game: Game): Progress {
  const won = game.arrows.length === 0;
  return {
    ...progress,
    selected: game.level.number,
    unlocked: won ? Math.max(progress.unlocked, game.level.number + 1) : progress.unlocked,
    perfect: won && game.mistakes === 0
      ? [...new Set([...progress.perfect, game.level.number])].sort((a, b) => a - b) : progress.perfect,
    session: { level: game.level.number, seed: game.level.seed, moves: [...game.moves], mistakes: game.mistakes, hints: game.hints },
  };
}
