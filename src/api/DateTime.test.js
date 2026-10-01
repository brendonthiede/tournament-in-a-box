import { DateTime } from './DateTime';
import { freeze, thaw } from '../scheduling/utilities';

describe('DateTime', () => {
  it('formats minutes as zero-padded HH:MM', () => {
    expect(new DateTime(8.5 * 60).displayTime()).toBe('08:30');
    expect(new DateTime(17 * 60 + 5).time).toBe('17:05');
    expect(new DateTime(0).justTime()).toBe('00:00');
  });

  it('shows -- for an unset time', () => {
    expect(new DateTime(null).displayTime()).toBe('--:--');
  });

  it('prefixes the day label only for multi-day events', () => {
    const days = ['Sat', 'Sun'];
    const d = new DateTime(24 * 60 + 60, days);
    expect(d.displayTime()).toBe('Sun 01:00');
    expect(d.justDay()).toBe('Sun');
    expect(d.justTime()).toBe('01:00');
    expect(d.dayIdx).toBe(1);
    expect(d.day).toBe('Sun');
    expect(new DateTime(60, ['Day 1']).displayTime()).toBe('01:00');
  });

  it('keeps the day when the time is set from HH:MM', () => {
    const d = new DateTime(24 * 60 + 30, ['A', 'B']);
    d.time = '09:15';
    expect(d.mins).toBe(24 * 60 + 9 * 60 + 15);
  });

  it('keeps the time when the day is changed', () => {
    const d = new DateTime(24 * 60 + 30, ['A', 'B']);
    d.day = 'A';
    expect(d.mins).toBe(30);
    d.day = 'Nope';
    expect(d.mins).toBe(30);
  });

  it('clones with an offset and shares the days array', () => {
    const days = ['A'];
    const d = new DateTime(100, days);
    const c = d.clone(15);
    expect(c).not.toBe(d);
    expect(c.mins).toBe(115);
    expect(c.days).toBe(days);
  });

  it('survives a freeze/thaw round trip', () => {
    const d = new DateTime(615, ['A', 'B']);
    const out = JSON.parse(JSON.stringify(d, freeze), thaw);
    expect(out).toBeInstanceOf(DateTime);
    expect(out.mins).toBe(615);
    expect(out.days).toEqual(['A', 'B']);
  });
});
