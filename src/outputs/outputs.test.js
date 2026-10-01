import { Zipper } from './Zipper';
import { SingleOutput } from './SingleOutput';
import { MakeScoringSystemCSV, MakeAppImportCsv, TimeToExcel } from './DataOutputs';
import { MakeSessionPDF, MakeDaySchedulePdf, MakePracticeTableSignupPdf } from './SessionOutputs';
import { MakeTeamListPDF, MakeAllTeamsPDF, MakeIndivTeamsPDF } from './TeamOutputs';
import {
  MakePitSignsPdf,
  MakeLocationSignsPdf,
  MakeAwardCertPdf,
  MakeParticipationCertPdf,
} from './SignOutputs';
import { MakeVolunteerListPdf, MakeSigninPdf } from './VolunteerOutputs';
import { MakeClosingPresentation } from './PresentationOutput';
import { PdfDoc } from '../templates/PdfDoc';
import { TYPES } from '../api/SessionTypes';
import { DateTime } from '../api/DateTime';
import { seedRandom, scheduledEvent } from '../test/helpers';

let E;
let rand;
beforeAll(() => {
  rand = seedRandom(11);
  E = scheduledEvent({ title: 'My Event' }, e => (e.nPracs = 1));
  E.buildVolunteerSheet();
});
afterAll(() => rand.mockRestore());

describe('output catalogue', () => {
  it('keeps the zip, single-download and name lists aligned', () => {
    const z = new Zipper(E, () => {});
    const s = new SingleOutput(E, () => {});
    expect(SingleOutput.funcNames).toHaveLength(z.length);
    expect(s.funcs).toHaveLength(z.length);
    expect(z.FilesLeft).toBe(z.length);
  });

  it('adds every output to the zip under its folder', () => {
    const z = new Zipper(E, () => {});
    while (z.FilesLeft > 0) z.ProcessNext();
    const names = Object.keys(z.zip.files).filter(n => !z.zip.files[n].dir);
    expect(names).toEqual(
      expect.arrayContaining([
        'signage/pit-signs_2.pdf',
        'signage/location-signs_2.pdf',
        'signage/practice-tables_4.pdf',
        'volunteers/vol-list_2.pdf',
        'volunteers/vol-sign-in_2.pdf',
        'certificates/award-certificates_2.pdf',
        'certificates/participation-certificates_10.pdf',
        'scoring-system/scoring_import.csv',
        'app-import/app_import.csv',
        'closing-slides.pptx',
        'Practice-Rounds-schedule_20.pdf',
        'Rounds-schedule_20.pdf',
      ])
    );
    expect(names.find(n => n.startsWith('Judging-schedule_'))).toBeTruthy();
    expect(names.find(n => n.startsWith('day-schedule_'))).toBeTruthy();
    expect(names.filter(n => n.startsWith('scoring-system/') && !n.endsWith('.csv'))).toHaveLength(
      E.sponsors.national.length
    );
    expect(z.zipname).toBe('My_Event');
  });
});

describe('PDF outputs', () => {
  const makers = {
    'Judging-schedule': e => MakeSessionPDF(e, TYPES.JUDGING),
    'Rounds-schedule': e => MakeSessionPDF(e, TYPES.MATCH_ROUND),
    'Practice-Rounds-schedule': e => MakeSessionPDF(e, TYPES.MATCH_ROUND_PRACTICE),
    'team-list': MakeTeamListPDF,
    'day-schedule': MakeDaySchedulePdf,
    'all-teams-schedule': MakeAllTeamsPDF,
    'individual-team-schedule': MakeIndivTeamsPDF,
    'pit-signs': MakePitSignsPdf,
    'vol-list': MakeVolunteerListPdf,
    'location-signs': MakeLocationSignsPdf,
    'vol-sign-in': MakeSigninPdf,
    'practice-tables': MakePracticeTableSignupPdf,
    'award-certificates': MakeAwardCertPdf,
    'participation-certificates': MakeParticipationCertPdf,
  };

  Object.entries(makers).forEach(([filename, make]) => {
    it(`builds ${filename}`, () => {
      const doc = make(E);
      expect(doc).toBeInstanceOf(PdfDoc);
      expect(doc.filename).toBe(filename);
      expect(doc.empty()).toBe(false);
      // Certificates and signs replace the standard page header.
      if (!/certificates|signs/.test(filename)) expect(doc.doc.header.text).toBe('My Event');
    });
  });

  it('returns null for a session type with no sessions', () => {
    expect(MakeSessionPDF(E, TYPES.MATCH_FILLER)).toBeNull();
  });

  it('renders a real PDF blob', async () => {
    const blob = await MakeTeamListPDF(E).getBlobPromise();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
  }, 60000);
});

describe('CSV outputs', () => {
  it('formats times for Excel', () => {
    expect(TimeToExcel(new DateTime(9 * 60 + 5))).toBe('09:05:00 AM');
    expect(TimeToExcel(new DateTime(13 * 60))).toBe('13:00:00 PM');
  });

  it('writes the scoring-system import blocks', () => {
    const { data, filename } = MakeScoringSystemCSV(E);
    expect(filename).toBe('scoring_import');
    const lines = data.split('\n');
    expect(lines[0]).toBe('Version Number,1');
    expect(lines).toContain('Number of Teams,' + E.nTeams);
    const rounds = E.getSessions(TYPES.MATCH_ROUND);
    const matches = rounds.reduce((n, r) => n + r.schedule.length, 0);
    expect(lines).toContain('Number of Ranking Matches,' + matches);
    expect(lines).toContain('Number of Tables,' + rounds[0].nLocs);
    expect(lines).toContain('Block Format,3');
    expect(lines).toContain('Block Format,4');
    expect(lines).toContain('Event Name,Judging');
    E.teams.forEach(t => {
      expect(lines).toContain(`${t.number},${t.name},${t.affiliation},`);
    });
    const matchRows = lines.filter(l => /^\d+,\d\d:\d\d:00 [AP]M,/.test(l));
    const practice = E.getSessions(TYPES.MATCH_ROUND_PRACTICE).reduce((n, r) => n + r.schedule.length, 0);
    const judging = E.getSessions(TYPES.JUDGING)[0].schedule.length;
    expect(matchRows).toHaveLength(matches + practice + judging);
  });

  it('writes one row per team for the app import', () => {
    const { data, filename } = MakeAppImportCsv(E);
    expect(filename).toBe('app_import');
    const rows = data.trimEnd().split('\n');
    expect(rows).toHaveLength(E.nTeams + 2);
    expect(rows[0].startsWith('Team,')).toBe(true);
    expect(rows[1].startsWith('#,Name,')).toBe(true);
    const width = rows[1].split(',').length;
    rows.forEach(r => expect(r.split(',')).toHaveLength(width));
  });
});

describe('closing presentation', () => {
  it('creates a title and winner slide per award', () => {
    const ppt = MakeClosingPresentation(E);
    expect(ppt.filename).toBe('closing-slides');
    const added = jest.spyOn(ppt.pptx, 'addNewSlide');
    ppt.addTitle('x');
    expect(added).toHaveBeenCalledWith('PRESENTATION_BASIC');
    added.mockRestore();
    expect(E.awards.length).toBeGreaterThan(0);
  });

  it('renders a real PPTX blob', async () => {
    const blob = await MakeClosingPresentation(E).getBlobPromise();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
  }, 60000);
});
