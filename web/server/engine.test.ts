import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import init, { Engine, AudioKernel } from '../public/engine/dojo.js';
await init({
  module_or_path: await readFile(new URL('../public/engine/dojo_bg.wasm', import.meta.url)),
});
function capture(engine: Engine, symbol: string, at = 1100) {
  engine.next_trial(Date.now());
  engine.marker(1, 0, 48000, 1000, 0);
  engine.marker(2, 0, 52800, 1100, 0);
  const result = JSON.parse(engine.answer(symbol, at));
  assert.equal(result.accepted, true);
  return JSON.parse(engine.close_trial(Date.now(), at + 500));
}
test('WASM uses injected clocks, native scores and replayable binary checkpoints', () => {
  const engine = new Engine();
  engine.bootstrap('KM', Date.now());
  engine.begin_session();
  engine.prepare(
    JSON.stringify({
      id: 'parity-block',
      mode: 'recognition',
      source: 'guided',
      now: Date.now(),
      at: 900,
      seed: 123,
    }),
  );
  const feedback = capture(engine, 'Z');
  assert.equal(feedback.correct, false);
  const result = JSON.parse(engine.finish(true, 2000));
  assert.equal(result.attempt, 0);
  assert.equal(result.targets, 1);
  assert.equal(result.source, 'guided');
  const server = new Engine();
  server.bootstrap('KM', Date.now());
  server.begin_session();
  const evaluated = JSON.parse(server.accept(engine.packet(), true));
  assert.deepEqual(evaluated, result);
  const restored = new Engine();
  restored.load(server.checkpoint());
  assert.equal(JSON.parse(restored.snapshot(Date.now())).introduced, 'KM');
  engine.free();
  server.free();
  restored.free();
});
test('assisted replay, unknown and expired captures stay distinct', () => {
  const engine = new Engine();
  engine.bootstrap('KM', Date.now());
  engine.prepare(
    JSON.stringify({
      id: 'replay',
      mode: 'recognition',
      source: 'guided',
      now: Date.now(),
      at: 0,
      seed: 42,
    }),
  );
  engine.next_trial(Date.now());
  engine.marker(1, 0, 0, 1000, 0);
  engine.marker(2, 0, 4800, 1100, 0);
  assert.equal(JSON.parse(engine.answer('replay', 1150)).replay, true);
  assert.equal(JSON.parse(engine.close_trial(Date.now(), 1700)).assisted, true);
  engine.disclose('K', Date.now());
  engine.next_trial(Date.now());
  engine.marker(1, 0, 0, 2000, 0);
  engine.marker(2, 0, 4800, 2100, 0);
  assert.equal(JSON.parse(engine.answer('unknown', 2200)).unknown, true);
  const f = JSON.parse(engine.close_trial(Date.now(), 2700));
  assert.equal(f.unknown, true);
  engine.next_trial(Date.now());
  engine.marker(1, 0, 0, 3000, 0);
  engine.marker(2, 0, 4800, 3100, 0);
  assert.equal(JSON.parse(engine.answer('K', 20000)).accepted, false);
  engine.free();
});
test('manual tool evidence never enters adaptive progress and interrupted copying can be saved', () => {
  const engine = new Engine();
  engine.prepare(
    JSON.stringify({
      id: 'tool',
      mode: 'copying',
      source: 'tool',
      text: 'KM',
      characters: 'KM',
      c: 20,
      e: 20,
      now: Date.now(),
      at: 0,
    }),
  );
  engine.marker(0, 0, 0, 0, 0);
  engine.marker(1, 0, 0, 0, 0);
  engine.edit('K', 100);
  engine.interrupt('test interruption');
  const result = JSON.parse(engine.finish(false, 150));
  assert.equal(result.interrupted, 'test interruption');
  assert.equal(JSON.parse(engine.progress(Date.now(), 30)).graphs[1].points.length, 0);
  assert.ok(engine.record().length > 0);
  engine.free();
});
test('uncompleted and placement-only sessions do not inflate the completed session count', () => {
  const engine = new Engine();
  engine.begin_session();
  engine.end_session();
  assert.equal(JSON.parse(engine.snapshot(Date.now())).sessions, 0);
  engine.free();
});
test('server rejects oversized and invalid records without losing a valid checkpoint', () => {
  const engine = new Engine();
  engine.bootstrap('KM', Date.now());
  const before = engine.checkpoint();
  assert.throws(() => engine.accept(new Uint8Array([1, 2, 3]), true));
  assert.deepEqual(engine.checkpoint(), before);
  assert.throws(() => engine.load(new Uint8Array(8 * 1024 * 1024 + 1)));
  engine.free();
});
