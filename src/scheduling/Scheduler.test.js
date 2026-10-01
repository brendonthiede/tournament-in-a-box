import { Scheduler } from './Scheduler';
import { TYPES } from '../api/SessionTypes';
import {
  seedRandom,
  makeEvent,
  generate,
  scheduledEvent,
  assertValidSchedule,
  nonBreakSessions,
} from '../test/helpers';

describe('Scheduler', () => {
  let rand;
  beforeEach(() => {
    rand = seedRandom(7);
  });
  afterEach(() => rand.mockRestore());

  it('produces a complete, conflict-free schedule for the default event', () => {
    const E = scheduledEvent();
    assertValidSchedule(E);
  });

  it.each([
    [9, 0],
    [15, 1],
    [24, 1],
    [36, 0],
  ])('schedules %i teams with %i practice rounds', (nTeams, nPracs) => {
    const E = scheduledEvent({ nTeams }, e => (e.nPracs = nPracs));
    assertValidSchedule(E);
  });

  it('reports unfilled slots when the day is too short', () => {
    // 36 teams with a practice round does not fit between 08:30 and 17:00.
    const E = scheduledEvent({ nTeams: 36 }, e => (e.nPracs = 1));
    expect(E.errors).toBeGreaterThan(0);
    // evaluate() counts blank slots plus team entries whose instance no longer lists them.
    const blanks = nonBreakSessions(E).reduce(
      (n, s) => n + s.schedule.reduce((m, i) => m + i.teams.length - i.teams.filter(Boolean).length, 0),
      0
    );
    const orphans = E.teams.reduce(
      (n, t) => n + t.schedule.filter(i => !i.teams.includes(t.id)).length,
      0
    );
    expect(E.errors).toBe(blanks + orphans);
  });

  it('chains match rounds end to end in order', () => {
    const E = scheduledEvent({ nTeams: 24 }, e => (e.nPracs = 1));
    const rounds = [
      ...E.getSessions(TYPES.MATCH_ROUND_PRACTICE),
      ...E.getSessions(TYPES.MATCH_ROUND),
    ];
    expect(rounds.map(r => r.name)).toEqual([
      'Practice Round 1',
      'Round 1',
      'Round 2',
      'Round 3',
    ]);
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i].actualStartTime.mins).toBeGreaterThanOrEqual(
        rounds[i - 1].actualEndTime.mins
      );
    }
    // Match numbering continues across rounds.
    const nums = rounds.reduce((a, r) => a.concat(r.schedule.map(i => i.num)), []);
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });

  it('keeps every session inside the event day', () => {
    const E = scheduledEvent();
    nonBreakSessions(E).forEach(s => {
      expect(s.actualStartTime.mins).toBeGreaterThanOrEqual(E.startTime.mins);
      expect(s.actualEndTime.mins).toBeLessThanOrEqual(E.endTime.mins);
      s.schedule.forEach(i => {
        expect(i.time.mins).toBeGreaterThanOrEqual(s.actualStartTime.mins);
        expect(i.time.mins + s.len).toBeLessThanOrEqual(s.actualEndTime.mins);
      });
    });
  });

  it('skips judging for excluded teams', () => {
    const E = scheduledEvent({}, e => {
      e.teams[0].excludeJudging = true;
    });
    assertValidSchedule(E);
    const judging = E.getSessions(TYPES.JUDGING)[0];
    const seen = judging.schedule.reduce((a, i) => a.concat(i.teams), []);
    expect(seen).not.toContain(E.teams[0].id);
    expect(seen.filter(Boolean)).toHaveLength(E.nTeams - 1);
  });

  it('only places extra-time teams into extended slots', () => {
    const E = scheduledEvent({}, e => {
      e.teams[0].extraTime = true;
      e.teams[1].extraTime = true;
    });
    assertValidSchedule(E);
    const ids = [E.teams[0].id, E.teams[1].id];
    nonBreakSessions(E).forEach(s =>
      s.schedule.forEach(i => {
        if (i.teams.some(t => ids.includes(t))) expect(i.extra).toBe(true);
      })
    );
  });

  it('respects a team\'s own availability window', () => {
    const E = scheduledEvent({}, e => {
      e.teams[0].startTime.mins = 11 * 60;
    });
    assertValidSchedule(E);
    E.teams[0].schedule
      .filter(i => E.getSession(i.session_id).type !== TYPES.BREAK)
      .forEach(i => expect(i.time.mins).toBeGreaterThanOrEqual(11 * 60));
  });

  it('schedules a two-day event around the night break', () => {
    const E = makeEvent({ end: 24 * 60 + 15 * 60 });
    E.nDays = 2;
    E.populateFLL();
    generate(E);
    assertValidSchedule(E);
    const names = E.sessions.map(s => s.name);
    expect(names).toEqual(expect.arrayContaining(['Night', 'Lunch 1', 'Lunch 2']));
    const night = E.sessions.find(s => s.name === 'Night');
    nonBreakSessions(E).forEach(s =>
      s.schedule.forEach(i => {
        const inNight =
          i.time.mins >= night.startTime.mins && i.time.mins < night.endTime.mins;
        expect(inNight).toBe(false);
      })
    );
  });

  it('supports pilot mode with two teams per table', () => {
    const E = scheduledEvent({}, e => {
      e.pilot = true;
      e.nTables = 2;
    });
    assertValidSchedule(E);
    E.getSessions(TYPES.MATCH_ROUND).forEach(r => {
      expect(r.nSims).toBe(2);
      r.schedule.forEach(i => expect(i.teams.length).toBeLessThanOrEqual(2));
    });
  });

  it('counts empty slots and orphaned team entries as errors', () => {
    const E = scheduledEvent();
    const S = new Scheduler(E);
    const round = E.getSessions(TYPES.MATCH_ROUND)[0];
    const victim = round.schedule[0].teams[0];
    round.schedule[0].teams[0] = null;
    S.evaluate();
    // One blank slot, plus the team whose entry no longer lists it.
    expect(round.errors).toBe(1);
    expect(E.errors).toBe(2);
    expect(E.getTeam(victim).schedule.map(i => i.session_id)).toContain(round.id);
  });

  it('empties previous results before rebuilding', () => {
    const E = scheduledEvent();
    const S = new Scheduler(E);
    S.empty();
    E.sessions.forEach(s => expect(s.schedule).toEqual([]));
    E.teams.forEach(t => expect(t.schedule).toEqual([]));
  });
});
