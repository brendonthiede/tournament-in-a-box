import { DateTime } from '../api/DateTime';
import { EventParams } from '../api/EventParams';
import { TYPES } from '../api/SessionTypes';
import { Scheduler } from '../scheduling/Scheduler';

// Mulberry32 in place of Math.random so generated schedules are reproducible.
export function seedRandom(seed = 1) {
  let a = seed >>> 0;
  return jest.spyOn(Math, 'random').mockImplementation(() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
}

export function makeEvent({
  nTeams = 24,
  start = 8.5 * 60,
  end = 17 * 60,
  title = 'Test Event',
} = {}) {
  return new EventParams(
    '25.0.0',
    title,
    nTeams,
    new DateTime(start),
    new DateTime(end)
  );
}

// Mirrors App.generate(): retry until the schedule has no gaps.
export function generate(event, maxTries = 500) {
  const S = new Scheduler(event);
  let count = maxTries;
  do {
    S.buildAllTables();
    S.fillAllTables();
    S.evaluate();
  } while (event.errors > 0 && count-- > 0);
  return event;
}

export function scheduledEvent(opts, before = () => {}) {
  const E = makeEvent(opts);
  before(E);
  E.populateFLL();
  return generate(E);
}

export function nonBreakSessions(E) {
  return E.sessions.filter(s => s.type !== TYPES.BREAK);
}

// Invariants every finished schedule must satisfy.
export function assertValidSchedule(E) {
  expect(E.errors).toBe(0);

  nonBreakSessions(E).forEach(s => {
    const seen = s.schedule.reduce((acc, i) => acc.concat(i.teams), []);
    E.teams.forEach(t => {
      const expected = s.type === TYPES.JUDGING && t.excludeJudging ? 0 : 1;
      expect(seen.filter(id => id === t.id).length).toBe(expected);
    });
  });

  E.teams.forEach(t => {
    const items = t.schedule
      .filter(i => E.getSession(i.session_id).type !== TYPES.BREAK)
      .map(i => ({
        start: i.time.mins,
        end:
          i.time.mins +
          E.getSession(i.session_id).len +
          (i.extra ? E.extraTime : 0),
      }));
    items.forEach(a =>
      items.forEach(b => {
        if (a === b) return;
        expect(
          b.start >= a.end + E.minTravel || a.start >= b.end + E.minTravel
        ).toBe(true);
      })
    );
    t.schedule.forEach(i => expect(i.teams).toContain(t.id));
  });

  const breaks = E.sessions.filter(s => s.type === TYPES.BREAK);
  nonBreakSessions(E).forEach(s =>
    s.schedule.forEach(i =>
      breaks
        .filter(b => b.applies(s.id))
        .forEach(b => {
          const inside =
            i.time.mins >= b.actualStartTime.mins &&
            i.time.mins < b.actualEndTime.mins;
          expect(inside).toBe(false);
        })
    )
  );
}
