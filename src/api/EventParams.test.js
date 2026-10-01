import { EventParams } from './EventParams';
import { TYPES } from './SessionTypes';
import { DateTime } from './DateTime';
import SessionParams from './SessionParams';
import Instance from '../scheduling/Instance';
import { overlaps } from '../scheduling/utilities';
import PreComputedImages from '../resources/images.json';
import Volunteers from '../templates/volunteers.json';
import { seedRandom, makeEvent, scheduledEvent, nonBreakSessions } from '../test/helpers';

describe('EventParams', () => {
  let rand;
  beforeEach(() => {
    rand = seedRandom(3);
  });
  afterEach(() => rand.mockRestore());

  describe('construction', () => {
    it('creates numbered teams with unique ids and the national sponsors', () => {
      const E = makeEvent({ nTeams: 12 });
      expect(E.nTeams).toBe(12);
      expect(E.teams.map(t => t.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(new Set(E.teams.map(t => t.id)).size).toBe(12);
      expect(E.teams[0].name).toBe('Team 1');
      expect(E.sessions).toEqual([]);
      expect(E.days).toEqual(['Day 1']);
      expect(E.sponsors.national).toHaveLength(PreComputedImages.nationalSponsors.length);
      expect(E.errors).toBe(Infinity);
    });

    it('grows and shrinks the team list through nTeams', () => {
      const E = makeEvent({ nTeams: 4 });
      E.nTeams = 6;
      expect(E.teams.map(t => t.number)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(E.teams.map(t => t.id)).size).toBe(6);
      E.nTeams = 2;
      expect(E.teams.map(t => t.number)).toEqual([1, 2]);
    });

    it('propagates day labels to every stored time', () => {
      const E = makeEvent();
      E.populateFLL();
      E.nDays = 2;
      expect(E.days).toEqual(['Day 1', 'Day 2']);
      expect(E.startTime.days).toBe(E.days);
      E.sessions.forEach(s => expect(s.startTime.days).toBe(E.days));
      E.teams.forEach(t => expect(t.startTime.days).toBe(E.days));
    });
  });

  describe('populateFLL', () => {
    it('builds the default FLL day', () => {
      const E = makeEvent({ nTeams: 24, start: 8.5 * 60, end: 17 * 60 });
      E.populateFLL();
      expect(E.sessions.map(s => s.name)).toEqual([
        'Opening Ceremony',
        'Round 1',
        'Round 2',
        'Round 3',
        'Judging',
        'Lunch',
        'Closing Ceremony',
      ]);
      const [opening, , , , judging, lunch, closing] = E.sessions;
      expect(opening.type).toBe(TYPES.BREAK);
      expect(opening.universal).toBe(true);
      expect(opening.startTime.mins).toBe(8.5 * 60);
      expect(opening.endTime.mins).toBe(9 * 60);
      expect(lunch.universal).toBe(true);
      expect(lunch.endTime.mins - lunch.startTime.mins).toBe(30);
      expect(closing.endTime.mins).toBe(17 * 60);
      expect(closing.endTime.mins - closing.startTime.mins).toBe(60);
      expect(judging.nLocs).toBe(6);
      expect(E.nJudges).toBe(6);
      E.getSessions(TYPES.MATCH_ROUND).forEach(r => {
        expect(r.nLocs).toBe(4);
        expect(r.nSims).toBe(2);
      });
      expect(E.pageFormat).not.toBeNull();
    });

    it('adds practice rounds and extra days', () => {
      const E = makeEvent({ end: 24 * 60 + 16 * 60 });
      E.nDays = 3;
      E.nPracs = 2;
      E.populateFLL();
      const names = E.sessions.map(s => s.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'Practice Round 1',
          'Practice Round 2',
          'Night 1',
          'Night 2',
          'Lunch 1',
          'Lunch 2',
          'Lunch 3',
        ])
      );
      E.sessions
        .filter(s => s.name.startsWith('Night'))
        .forEach(n => expect(n.noPractice).toBe(true));
    });

    it('picks the award list closest to 40% of the teams', () => {
      const E = makeEvent({ nTeams: 24 });
      E.populateFLL();
      expect(E.awardStyleIdx).toBe(2);
      expect(E.awards).toHaveLength(10);
      const small = makeEvent({ nTeams: 6 });
      small.populateFLL();
      expect(small.awardStyleIdx).toBe(0);
    });

    it('parses pasted team lists in CSV or TSV form', () => {
      const E = makeEvent({ nTeams: 4 });
      E.tempNames = ['101,Alpha,School A,5', '102\tBeta\tSchool B', '103,Gamma', 'Delta'].join('\n');
      E.populateFLL();
      const byNum = Object.fromEntries(E.teams.map(t => [String(t.number), t]));
      expect(byNum['101'].name).toBe('Alpha');
      expect(byNum['101'].affiliation).toBe('School A');
      expect(byNum['101'].pitNum).toBe('5');
      expect(byNum['102'].name).toBe('Beta');
      expect(byNum['102'].affiliation).toBe('School B');
      expect(byNum['103'].name).toBe('Gamma');
      expect(byNum['4'].name).toBe('Delta');
    });

    it('keeps existing values for blank fields', () => {
      const E = makeEvent({ nTeams: 1 });
      E.tempNames = ',,,';
      E.populateFLL();
      expect(E.teams[0].name).toBe('Team 1');
      expect(E.teams[0].number).toBe(1);
    });
  });

  describe('timeInc', () => {
    it('pushes past breaks that apply to the session', () => {
      const E = makeEvent();
      const lunch = new SessionParams(1, TYPES.BREAK, 'Lunch', 1, new DateTime(720), new DateTime(750));
      lunch.appliesTo = [5];
      E.sessions.push(lunch);
      expect(E.timeInc(new DateTime(710), 20, 5)).toBe(750);
      expect(E.timeInc(new DateTime(710), 20, 6)).toBe(730);
      expect(E.timeInc(new DateTime(710), 20)).toBe(750);
      expect(E.timeInc(new DateTime(690), 20, 5)).toBe(710);
      expect(E.timeInc(new DateTime(750), 20, 5)).toBe(770);
    });

    it('only honours no-practice breaks in timeIncPrac', () => {
      const E = makeEvent();
      const night = new SessionParams(1, TYPES.BREAK, 'Night', 1, new DateTime(1000), new DateTime(1500), true);
      const lunch = new SessionParams(2, TYPES.BREAK, 'Lunch', 1, new DateTime(720), new DateTime(750));
      E.sessions.push(night, lunch);
      expect(E.timeIncPrac(new DateTime(710), 20)).toBe(730);
      expect(E.timeIncPrac(new DateTime(990), 20)).toBe(1500);
    });
  });

  describe('canDo', () => {
    function setup() {
      const E = makeEvent({ nTeams: 2 });
      const a = new SessionParams(1, TYPES.JUDGING, 'J', 1, new DateTime(540), new DateTime(900));
      const b = new SessionParams(2, TYPES.MATCH_ROUND, 'R', 4, new DateTime(540), new DateTime(900));
      a.len = 30;
      b.len = 4;
      E.sessions.push(a, b);
      const team = E.teams[0];
      const booked = new Instance(1, 1, new DateTime(540), [team.id], 0);
      team.schedule.push(booked);
      return { E, team, booked };
    }

    it('requires travel time between commitments', () => {
      const { E, team } = setup();
      const at = m => new Instance(2, 1, new DateTime(m), [null, null], 0);
      expect(E.canDo(team, at(540 + 30 + 9))).toBe(false);
      expect(E.canDo(team, at(540 + 30 + 10))).toBe(true);
      expect(E.canDo(team, at(540 - 4 - 9))).toBe(false);
      expect(E.canDo(team, at(540 - 4 - 10))).toBe(true);
      expect(E.canDo(team, at(540))).toBe(false);
    });

    it('ignores the excluded session when asked', () => {
      const { E, team } = setup();
      expect(E.canDo(team, new Instance(2, 1, new DateTime(545), [null], 0), 1)).toBe(true);
    });

    it('rejects slots outside the team\'s own window', () => {
      const { E, team } = setup();
      team.startTime.mins = 600;
      team.endTime.mins = 700;
      const at = m => new Instance(2, 1, new DateTime(m), [null], 0);
      expect(E.canDo(team, at(590))).toBe(false);
      expect(E.canDo(team, at(600))).toBe(true);
      expect(E.canDo(team, at(690))).toBe(false);
    });

    it('rejects judging for excluded teams and normal slots for extra-time teams', () => {
      const { E, team } = setup();
      team.schedule = [];
      team.excludeJudging = true;
      expect(E.canDo(team, new Instance(1, 1, new DateTime(700), [null], 0))).toBe(false);
      expect(E.canDo(team, new Instance(2, 1, new DateTime(700), [null], 0))).toBe(true);
      team.excludeJudging = false;
      team.extraTime = true;
      const slot = new Instance(2, 1, new DateTime(700), [null], 0);
      expect(E.canDo(team, slot)).toBe(false);
      slot.extra = true;
      expect(E.canDo(team, slot)).toBe(true);
    });
  });

  describe('on a generated schedule', () => {
    it('swaps two teams within a session when both can make it', () => {
      const E = scheduledEvent();
      const round = E.getSessions(TYPES.MATCH_ROUND)[0];
      const a = round.schedule[0].teams[0];
      const b = round.schedule[round.schedule.length - 1].teams[0];
      const before = {
        a: E.getTeam(a).schedule.find(i => i.session_id === round.id),
        b: E.getTeam(b).schedule.find(i => i.session_id === round.id),
      };
      const canA = E.canDo(E.getTeam(a), before.b, round.id);
      const canB = E.canDo(E.getTeam(b), before.a, round.id);
      const result = E.swapTeams(round.id, a, b);
      if (canA && canB) {
        expect(result).toBeNull();
        expect(before.a.teams).toContain(b);
        expect(before.b.teams).toContain(a);
        expect(E.getTeam(a).schedule).toContain(before.b);
        expect(E.getTeam(b).schedule).toContain(before.a);
      } else {
        expect(typeof result).toBe('string');
        expect(before.a.teams).toContain(a);
      }
    });

    it('reports the minimum gap between a team\'s commitments', () => {
      const E = scheduledEvent();
      E.teams.forEach(t => {
        expect(E.minTravelTime(t)).toBeGreaterThanOrEqual(E.minTravel);
      });
    });

    it('lays out a session grid with breaks inline', () => {
      const E = scheduledEvent();
      const lunch = E.sessions.find(s => s.name === 'Lunch');
      // Pick a session that runs across lunch so the break shows up as a row.
      const judging = nonBreakSessions(E).find(s => overlaps(lunch, s));
      expect(judging).toBeTruthy();
      const grid = E.getSessionDataGrid(judging.id);
      expect(grid[0].map(c => c.value)).toEqual(['#', 'Time', ...judging.locations]);
      const breakRows = grid.slice(1).filter(r => r[2].colSpan === judging.nLocs);
      const teamRows = grid.slice(1).filter(r => r[2].colSpan !== judging.nLocs);
      expect(teamRows).toHaveLength(judging.schedule.length);
      expect(breakRows.map(r => r[2].value)).toContain('Lunch');
      teamRows.forEach(r => expect(r).toHaveLength(2 + judging.nLocs));
      const pdfGrid = E.getSessionDataGrid(judging.id, true);
      const cell = pdfGrid.slice(1).find(r => r[2].colSpan !== judging.nLocs)[2];
      expect(cell.value).toMatch(/^\d+\nTeam \d+$/);
    });

    it('lays out one row per team in the individual grid', () => {
      const E = scheduledEvent();
      const grid = E.getIndivDataGrid();
      expect(grid).toHaveLength(E.nTeams + 2);
      expect(grid[0][0]).toEqual({ value: 'Team', colSpan: 2 });
      expect(grid[0].slice(1, -1).map(c => c.value)).toEqual(
        nonBreakSessions(E).sort((a, b) => a.id - b.id).map(s => s.name)
      );
      const width = 2 + 3 * nonBreakSessions(E).length + 1;
      grid.slice(2).forEach(r => expect(r).toHaveLength(width));
      const compact = E.getIndivDataGrid(true);
      compact.slice(2).forEach(r => expect(r).toHaveLength(2 + 2 * nonBreakSessions(E).length + 1));
    });

    it('builds a volunteer sheet sized from judges and tables', () => {
      const E = scheduledEvent();
      E.buildVolunteerSheet();
      expect(E.volunteers).toHaveLength(Volunteers.roles.length);
      const judge = E.volunteers.find(v => v.name === 'Judge');
      expect(judge.staff).toHaveLength(3 * E.nJudges);
      const ref = E.volunteers.find(v => v.name === 'Referee');
      expect(ref.staff).toHaveLength(E.nTables);

      ref.staff[0] = 'Alice';
      E.nTables = 6;
      E.buildVolunteerSheet();
      expect(ref.staff).toHaveLength(6);
      expect(ref.staff[0]).toBe('Alice');
      E.nTables = 1;
      E.buildVolunteerSheet();
      expect(ref.staff).toEqual(['Alice']);
    });

    it('looks up teams and sessions by id', () => {
      const E = scheduledEvent();
      expect(E.getTeam(E.teams[3].id)).toBe(E.teams[3]);
      expect(E.getTeam(-1)).toBeNull();
      expect(E.getSession(E.sessions[2].id)).toBe(E.sessions[2]);
      expect(E.getSession(-1)).toBeNull();
      expect(E.getSessions(TYPES.MATCH_ROUND)).toHaveLength(3);
    });

    it('syncs table names across match rounds', () => {
      const E = scheduledEvent({}, e => (e.nPracs = 1));
      const r1 = E.getSessions(TYPES.MATCH_ROUND)[0];
      r1.locations = ['A', 'B', 'C', 'D'];
      E.syncLocs(r1);
      [...E.getSessions(TYPES.MATCH_ROUND), ...E.getSessions(TYPES.MATCH_ROUND_PRACTICE)].forEach(r =>
        expect(r.locations).toEqual(['A', 'B', 'C', 'D'])
      );
      expect(E.getSessions(TYPES.JUDGING)[0].locations[0]).toBe('Room 1');
    });
  });
});
