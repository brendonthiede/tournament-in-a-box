import SessionParams from './SessionParams';
import { TYPES, SessionType } from './SessionTypes';
import { DateTime } from './DateTime';
import { freeze, thaw } from '../scheduling/utilities';

const at = m => new DateTime(m);

describe('SessionParams', () => {
  it('names locations from the type default', () => {
    const s = new SessionParams(7, TYPES.JUDGING, null, 3, at(540), at(600));
    expect(s.name).toBe('Judging 7');
    expect(s.locations).toEqual(['Room 1', 'Room 2', 'Room 3']);
    expect(s.nLocs).toBe(3);
    expect(s.nSims).toBe(3);
  });

  it('grows and shrinks locations through nLocs', () => {
    const s = new SessionParams(1, TYPES.MATCH_ROUND, 'R', 4, at(0), at(60));
    s.nSims = 2;
    s.nLocs = 6;
    expect(s.locations).toEqual([
      'Table 1',
      'Table 2',
      'Table 3',
      'Table 4',
      'Table 5',
      'Table 6',
    ]);
    expect(s.nSims).toBe(2);
    s.nLocs = 2;
    expect(s.locations).toEqual(['Table 1', 'Table 2']);
  });

  it('keeps nSims equal to nLocs for judging', () => {
    const s = new SessionParams(1, TYPES.JUDGING, 'J', 4, at(0), at(60));
    s.nLocs = 6;
    expect(s.nSims).toBe(6);
  });

  it('treats breaks as zero-length blocks spanning their window', () => {
    const b = new SessionParams(2, TYPES.BREAK, 'Lunch', 1, at(720), at(750));
    expect(b.len).toBe(0);
    expect(b.buf).toBe(30);
    expect(b.actualStartTime).toBe(b.startTime);
    expect(b.actualEndTime).toBe(b.endTime);
  });

  it('applies to everything when universal, otherwise to listed ids', () => {
    const b = new SessionParams(2, TYPES.BREAK, 'Lunch', 1, at(720), at(750));
    expect(b.applies(5)).toBe(false);
    b.appliesTo = [5];
    expect(b.applies(5)).toBe(true);
    expect(b.applies(6)).toBe(false);
    b.universal = true;
    expect(b.applies(6)).toBe(true);
  });

  it('ignores negative overlap', () => {
    const s = new SessionParams(1, TYPES.MATCH_ROUND, 'R', 4, at(0), at(60));
    s.overlap = 5;
    s.overlap = -1;
    expect(s.overlap).toBe(5);
  });

  it('round-trips through freeze/thaw with its type singleton', () => {
    const s = new SessionParams(9, TYPES.MATCH_ROUND, 'Round 1', 4, at(540), at(900));
    s.nSims = 2;
    s.len = 4;
    s.buf = 3;
    s.overlap = 1;
    s.extraTimeFirst = true;
    s.appliesTo = [1, 2];
    const out = JSON.parse(JSON.stringify(s, freeze), thaw);
    expect(out).toBeInstanceOf(SessionParams);
    expect(out.type).toBe(TYPES.MATCH_ROUND);
    expect(out.id).toBe(9);
    expect(out.name).toBe('Round 1');
    expect(out.locations).toEqual(s.locations);
    expect(out.nSims).toBe(2);
    expect(out.len).toBe(4);
    expect(out.buf).toBe(3);
    expect(out.overlap).toBe(1);
    expect(out.extraTimeFirst).toBe(true);
    expect(out.appliesTo).toEqual([1, 2]);
    expect(out.startTime).toBeInstanceOf(DateTime);
    expect(out.startTime.mins).toBe(540);
    expect(out.endTime.mins).toBe(900);
  });

  it('defaults overlap and end time when thawing older saves', () => {
    const o = SessionParams.freeze(
      new SessionParams(3, TYPES.JUDGING, 'J', 2, at(600), at(null))
    );
    delete o._overlap;
    o._actualEndTime = at(null);
    const out = SessionParams.thaw(o);
    expect(out.overlap).toBe(0);
    expect(out.endTime.mins).toBe(630);

    o._actualEndTime = at(700);
    expect(SessionParams.thaw(o).endTime.mins).toBe(700);
  });
});

describe('SessionType', () => {
  it('thaws back to the shared singleton by name', () => {
    expect(SessionType.thaw({ _name: 'Breaks' })).toBe(TYPES.BREAK);
    expect(SessionType.thaw({ _name: 'nope' })).toBeNull();
  });
});
