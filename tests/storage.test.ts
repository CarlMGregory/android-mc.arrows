import test from 'node:test';
import assert from 'node:assert/strict';
import { available, makeLevel, phase, startGame, tap, type Game } from '../src/engine';
import { freshProgress, loadProgress, restoreSession, SAVE_KEY, saveProgress, withGame, type StoragePort } from '../src/storage';

function memory(): StoragePort {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
}
function complete(game: Game): Game {
  while (phase(game) === 'playing') game = tap(game, available(game)[0].id).game;
  return game;
}
test('random seed and partially played attempt round trip without regenerating the board', () => {
  const store = memory();
  assert.deepEqual(loadProgress(store).progress, freshProgress());
  let game = startGame(makeLevel(1, 2654435761));
  const blocked = game.arrows.find(a => !available(game).some(b => b.id === a.id))!;
  game = tap(game, blocked.id).game;
  game = tap(game, available(game)[0].id).game;
  const progress = withGame(freshProgress(), game);
  assert.equal(progress.session?.seed, 2654435761);
  assert.equal(saveProgress(store, progress), undefined);
  const loaded = loadProgress(store);
  assert.equal(loaded.error, undefined);
  assert.deepEqual(restoreSession(loaded.progress.session!), game);
});
test('progress and stars survive replays and unlocking continues past level 24', () => {
  const game = complete(startGame(makeLevel(1, 42)));
  let progress = withGame(freshProgress(), game);
  progress = withGame(progress, game);
  assert.equal(progress.unlocked, 2);
  assert.equal(progress.unlocked - 1, 1);
  assert.deepEqual(progress.perfect, [1]);
  progress = withGame(progress, { ...game, mistakes: 2 });
  assert.deepEqual(progress.perfect, [1]);
  assert.equal(withGame(progress, { ...game, level: makeLevel(24, 42) }).unlocked, 25);
  assert.equal(withGame(progress, { ...game, level: makeLevel(10000, 42) }).unlocked, 10001);
});
test('corrupted or impossible saves report errors without overwriting', () => {
  const blocked = startGame(makeLevel(1, 42)).arrows.find(a => !available(startGame(makeLevel(1, 42))).some(b => b.id === a.id))!;
  for (const raw of [
    '{bad', '{}', JSON.stringify({ ...freshProgress(), version: 99 }),
    JSON.stringify({ ...freshProgress(), unlocked: 1.5 }),
    JSON.stringify({ ...freshProgress(), selected: 2 }),
    JSON.stringify({ ...freshProgress(), perfect: [1] }),
    JSON.stringify({ ...freshProgress(), version: 2, unlocked: 3, completed: [1] }),
    ...[
      { level: 1, seed: 42, moves: [blocked.id], mistakes: 0, hints: 0 },
      { level: 1, seed: 42, moves: ['missing'], mistakes: 0, hints: 0 },
      { level: 1, seed: -1, moves: [], mistakes: 0, hints: 0 },
      { level: 1, moves: [], mistakes: 0, hints: 0 },
      { level: 1, seed: 42, moves: [], mistakes: -1, hints: 0 },
    ].map(session => JSON.stringify({ ...freshProgress(), session })),
  ]) {
    const store = memory();
    store.setItem(SAVE_KEY, raw);
    const result = loadProgress(store);
    assert.ok(result.error, raw);
    assert.deepEqual(result.progress, freshProgress());
    assert.equal(store.getItem(SAVE_KEY), raw);
  }
});
test('v1 migration preserves progress and sound, discards old geometry with an explicit notice', () => {
  const store = memory();
  const old = { version: 1, unlocked: 3, selected: 2, completed: [1, 2], perfect: [1], sound: true,
    session: { level: 2, moves: ['a0'], mistakes: 1, hints: 2 } };
  const raw = JSON.stringify(old);
  store.setItem(SAVE_KEY, raw);
  const result = loadProgress(store);
  assert.equal(result.error, undefined);
  assert.match(result.notice!, /old straight-arrow attempt was replaced/);
  assert.deepEqual(result.progress, { version: 3, unlocked: 3, selected: 2, perfect: [1], sound: true, session: null });
  assert.equal(store.getItem(SAVE_KEY), raw);
});

test('a completed old finite campaign unlocks level 25 without discarding a seeded attempt', () => {
  const store = memory();
  const game = complete(startGame(makeLevel(24, 42)));
  const session = withGame(freshProgress(), game).session;
  store.setItem(SAVE_KEY, JSON.stringify({
    version: 2, unlocked: 24, selected: 24, completed: Array.from({ length: 24 }, (_, i) => i + 1),
    perfect: [1, 24], sound: false, session,
  }));
  const loaded = loadProgress(store);
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.progress.unlocked, 25);
  assert.deepEqual(loaded.progress.perfect, [1, 24]);
  assert.deepEqual(restoreSession(loaded.progress.session!), game);
});

test('high level progress uses a scalar frontier, not an array of every completed level', () => {
  const store = memory();
  const game = startGame(makeLevel(1000000, 42));
  const progress = withGame({ ...freshProgress(), unlocked: 1000000, selected: 1000000 }, game);
  assert.equal(saveProgress(store, progress), undefined);
  assert.ok(store.getItem(SAVE_KEY)!.length < 300);
  const loaded = loadProgress(store);
  assert.equal(loaded.error, undefined);
  assert.deepEqual(loaded.progress, progress);
});
test('denied reads and quota failures report storage errors', () => {
  const store: StoragePort = {
    getItem() { throw new Error('Storage denied'); },
    setItem() { throw new Error('Quota exceeded'); },
  };
  assert.match(loadProgress(store).error!, /Storage denied/);
  assert.match(saveProgress(store, freshProgress())!, /Quota exceeded/);
});
test('lost attempts and seed zero survive a reload without unlocking', () => {
  let game = startGame(makeLevel(1, 0));
  const blocked = game.arrows.find(a => !available(game).some(b => b.id === a.id))!;
  for (let i = 0; i < 3; i++) game = tap(game, blocked.id).game;
  const progress = withGame(freshProgress(), game);
  assert.equal(progress.unlocked, 1);
  assert.deepEqual(restoreSession(progress.session!), game);
  assert.throws(() => restoreSession({ ...withGame(freshProgress(), complete(startGame(game.level))).session!, mistakes: 3 }));
});
