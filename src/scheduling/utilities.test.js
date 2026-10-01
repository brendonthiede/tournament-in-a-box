import { cmpVersions, overlaps, hasDone, shuffle, freeze, thaw } from './utilities';
import { DateTime } from '../api/DateTime';
import { EventParams } from '../api/EventParams';
import SessionParams from '../api/SessionParams';
import { TeamParams } from '../api/TeamParams';
import { TYPES } from '../api/SessionTypes';
import Instance from './Instance';
import { PageFormat } from '../api/PageFormat';
import { seedRandom, scheduledEvent } from '../test/helpers';

describe('cmpVersions', () => {
  it('orders numeric segments and ignores trailing zeros', () => {
    expect(cmpVersions('25.0.0', '25.0')).toBe(0);
    expect(cmpVersions('25.1.0', '25.0.0')).toBeGreaterThan(0);
    expect(cmpVersions('24.9', '25')).toBeLessThan(0);
    expect(cmpVersions('1.2', '1.2.1')).toBeLessThan(0);
  });
});

describe('overlaps', () => {
  const span = (s, e) => ({
    actualStartTime: new DateTime(s),
    actualEndTime: new DateTime(e),
  });

  it('is false for back-to-back windows', () => {
    expect(overlaps(span(0, 60), span(60, 120))).toBe(false);
    expect(overlaps(span(60, 120), span(0, 60))).toBe(false);
  });

  it('is true for any intersection or shared edge', () => {
    expect(overlaps(span(0, 60), span(30, 90))).toBe(true);
    expect(overlaps(span(30, 90), span(0, 60))).toBe(true);
    expect(overlaps(span(0, 60), span(0, 10))).toBe(true);
    expect(overlaps(span(0, 60), span(50, 60))).toBe(true);
  });
});

describe('hasDone', () => {
  it('counts a team\'s instances for one session', () => {
    const team = { schedule: [{ session_id: 1 }, { session_id: 2 }, { session_id: 1 }] };
    expect(hasDone(team, 1)).toBe(2);
    expect(hasDone(team, 3)).toBe(0);
  });
});

describe('shuffle', () => {
  it('permutes in place without losing elements', () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(a);
    expect(out).toBe(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('freeze/thaw', () => {
  let rand;
  beforeEach(() => {
    rand = seedRandom(42);
  });
  afterEach(() => rand.mockRestore());

  it('passes plain values through untouched', () => {
    expect(JSON.parse(JSON.stringify({ a: [1, 'b', null] }, freeze), thaw)).toEqual({
      a: [1, 'b', null],
    });
  });

  it('restores every persisted class from a generated event', () => {
    const E = scheduledEvent();
    E.buildVolunteerSheet();
    E.pageFormat.footerText = 'custom footer';
    E.addLocalSponsor({ name: 'local', extension: 'png', data: 'data:image/png;base64,AA==' });

    const state = { display: 'Review', version: '25.0.0', eventParams: E };
    const out = JSON.parse(JSON.stringify(state, freeze), thaw);
    const F = out.eventParams;

    expect(out.display).toBe('Review');
    expect(F).toBeInstanceOf(EventParams);
    expect(F.version).toBe('25.0.0');
    expect(F.title).toBe(E.title);
    expect(F.nTeams).toBe(E.nTeams);
    expect(F.startTime).toBeInstanceOf(DateTime);
    expect(F.startTime.mins).toBe(E.startTime.mins);
    expect(F.pageFormat).toBeInstanceOf(PageFormat);
    expect(F.pageFormat.footerText).toBe('custom footer');
    expect(F.sponsors.local).toHaveLength(1);
    expect(F.volunteers).toEqual(E.volunteers);
    expect(F.errors).toBe(0);

    F.teams.forEach(t => expect(t).toBeInstanceOf(TeamParams));
    F.sessions.forEach(s => {
      expect(s).toBeInstanceOf(SessionParams);
      expect(Object.values(TYPES)).toContain(s.type);
      s.schedule.forEach(i => {
        expect(i).toBeInstanceOf(Instance);
        expect(i.time).toBeInstanceOf(DateTime);
      });
    });

    // Team schedules reference the same instances as session schedules.
    F.teams.forEach(t =>
      t.schedule.forEach(i => expect(i.teams).toContain(t.id))
    );
    expect(F.getIndivDataGrid()).toEqual(E.getIndivDataGrid());
    expect(F.getSessionDataGrid(F.getSessions(TYPES.JUDGING)[0].id)).toEqual(
      E.getSessionDataGrid(E.getSessions(TYPES.JUDGING)[0].id)
    );
  });

  it('only persists page-format logos when they were customised', () => {
    const p = new PageFormat();
    expect(PageFormat.freeze(p)._header).toBeUndefined();
    p.logoTopLeft = 'data:image/png;base64,AA==';
    const f = PageFormat.freeze(p);
    expect(f._logoTopLeft).toBe('data:image/png;base64,AA==');
    expect(PageFormat.thaw(f).logoTopLeft).toBe('data:image/png;base64,AA==');
  });
});
