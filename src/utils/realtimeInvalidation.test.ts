import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-ignore TS5097
import { createCoalescer, matchesTarget, planInvalidations } from './realtimeInvalidation.ts';

/** A manual clock so the coalescer can be tested without real timers. */
function fakeTimers() {
  let now = 0;
  let nextHandle = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        const handle = nextHandle++;
        pending.set(handle, { at: now + ms, fn });
        return handle;
      },
      clear: (handle: unknown) => {
        pending.delete(handle as number);
      },
    },
    advance(ms: number) {
      now += ms;
      for (const [handle, entry] of [...pending.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (entry.at <= now && pending.has(handle)) {
          pending.delete(handle);
          entry.fn();
        }
      }
    },
  };
}

describe('createCoalescer', () => {
  it('collapses a burst for one id into a single run', () => {
    const clock = fakeTimers();
    const c = createCoalescer(clock.timers);
    let runs = 0;
    for (let i = 0; i < 20; i += 1) c.schedule('feed', () => { runs += 1; }, 1000);
    assert.equal(c.pendingCount(), 1);
    clock.advance(999);
    assert.equal(runs, 0);
    clock.advance(1);
    assert.equal(runs, 1);
    assert.equal(c.pendingCount(), 0);
  });

  it('does not push the run back when more events keep arriving (bounded latency)', () => {
    const clock = fakeTimers();
    const c = createCoalescer(clock.timers);
    let runs = 0;
    c.schedule('feed', () => { runs += 1; }, 1000);
    clock.advance(600);
    c.schedule('feed', () => { runs += 1; }, 1000);
    clock.advance(400);
    assert.equal(runs, 1);
  });

  it('keeps different ids independent and allows a new window after a run', () => {
    const clock = fakeTimers();
    const c = createCoalescer(clock.timers);
    const ran: string[] = [];
    c.schedule('a', () => ran.push('a'), 100);
    c.schedule('b', () => ran.push('b'), 300);
    clock.advance(100);
    assert.deepEqual(ran, ['a']);
    c.schedule('a', () => ran.push('a2'), 100);
    clock.advance(200);
    assert.deepEqual(ran, ['a', 'a2', 'b']);
  });

  it('runs nothing while paused and each id once on resume', () => {
    const clock = fakeTimers();
    const c = createCoalescer(clock.timers);
    const ran: string[] = [];
    c.schedule('waiting', () => ran.push('waiting'), 500);
    c.setPaused(true);
    c.schedule('a', () => ran.push('a'), 10);
    c.schedule('a', () => ran.push('a'), 10);
    c.schedule('b', () => ran.push('b'), 10);
    clock.advance(10_000);
    assert.deepEqual(ran, []);
    assert.equal(c.pendingCount(), 3);
    c.setPaused(false);
    assert.deepEqual(ran.sort(), ['a', 'b', 'waiting']);
    assert.equal(c.pendingCount(), 0);
  });

  it('flush runs what is waiting now and cancel drops it', () => {
    const clock = fakeTimers();
    const c = createCoalescer(clock.timers);
    let runs = 0;
    c.schedule('a', () => { runs += 1; }, 5000);
    c.flush();
    assert.equal(runs, 1);
    c.schedule('b', () => { runs += 1; }, 5000);
    c.cancel();
    clock.advance(10_000);
    assert.equal(runs, 1);
  });
});

describe('matchesTarget', () => {
  it('matches by key prefix', () => {
    assert.equal(matchesTarget(['messages', 'c1', 20], { key: ['messages', 'c1'] }), true);
    assert.equal(matchesTarget(['messages', 'c2', 20], { key: ['messages', 'c1'] }), false);
    assert.equal(matchesTarget(['messages'], { key: ['messages', 'c1'] }), false);
  });

  it('skips excluded sub keys', () => {
    const target = { key: ['events'], skipSubKeys: ['detail'] };
    assert.equal(matchesTarget(['events', 'student', 'ABC'], target), true);
    assert.equal(matchesTarget(['events', 'detail', 'e1'], target), false);
    assert.equal(matchesTarget(['events'], target), true);
  });
});

describe('planInvalidations', () => {
  const ids = (plans: { id: string }[]) => plans.map((p) => p.id);

  it('a comment on post X touches that post only, never the feed', () => {
    const plans = planInvalidations('post_comments', { post_id: 'X', id: 'c1' }, null);
    assert.deepEqual(ids(plans), ['post-comments:X', 'comments:X', 'post:X']);
    assert.ok(!plans.some((p: any) => p.target.key[0] === 'feed'));
  });

  it('falls back to the comment keys when the post id is unknown (delete without old row)', () => {
    const plans = planInvalidations('post_comments', {}, { id: 'c1' });
    assert.deepEqual(ids(plans), ['post-comments', 'comments']);
  });

  it('an RSVP refreshes the event detail quickly and the list slowly', () => {
    const plans = planInvalidations('event_attendees', { event_id: 'e1' }, null);
    const detail: any = plans.find((p: any) => p.id === 'events:detail:e1');
    const list: any = plans.find((p: any) => p.id === 'events:list');
    assert.ok(detail && list);
    assert.ok(list.delayMs > detail.delayMs);
    assert.deepEqual(detail.target.key, ['events', 'detail', 'e1']);
    assert.ok(list.target.skipSubKeys.includes('detail'));
  });

  it('chat messages target the one thread and share the conversation list window', () => {
    const plans = planInvalidations('chat_messages', { channel_id: 'ch1' }, null);
    assert.deepEqual(ids(plans), ['messages:ch1', 'conversations', 'unread-counts']);
    const deleted = planInvalidations('chat_messages', {}, { channel_id: 'ch2' });
    assert.equal(deleted[0].id, 'messages:ch2');
    assert.equal(planInvalidations('chat_messages', {}, {})[0].id, 'messages');
  });

  it('notifications also refresh the shared unread counts', () => {
    assert.ok(ids(planInvalidations('notifications', { id: 'n1' }, null)).includes('unread-counts'));
  });

  it('ignores tables it does not know', () => {
    assert.deepEqual(planInvalidations('profiles', {}, {}), []);
  });
});
