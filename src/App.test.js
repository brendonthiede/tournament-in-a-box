import React from 'react';
import ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import App from './App';
import { EventParams } from './api/EventParams';
import { freeze } from './scheduling/utilities';
import { seedRandom } from './test/helpers';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function buttonByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find(
    b => b.textContent.trim() === text
  );
}

describe('App', () => {
  let div;
  let app;
  let rand;

  beforeEach(() => {
    rand = seedRandom(5);
    div = document.createElement('div');
    document.body.appendChild(div);
    act(() => {
      app = ReactDOM.render(<App />, div);
    });
  });

  afterEach(() => {
    ReactDOM.unmountComponentAtNode(div);
    div.remove();
    rand.mockRestore();
  });

  it('starts on the basic setup screen', () => {
    expect(div.textContent).toContain('Basic setup');
    expect(buttonByText(div, 'Generate')).toBeTruthy();
    expect(buttonByText(div, 'Customise')).toBeTruthy();
    expect(app.state.display).toBe('Initialise');
  });

  it('generates a schedule and lands on the review screen', async () => {
    act(() => {
      Simulate.click(buttonByText(div, 'Generate'));
    });
    expect(app.state.processing).toBe(true);
    await sleep(200);
    expect(app.state.display).toBe('Review');
    expect(app.state.processing).toBe(false);
    expect(app.state.eventParams.errors).toBe(0);
    expect(app.state.eventParams.volunteers.length).toBeGreaterThan(0);
    expect(buttonByText(div, 'Change parameters')).toBeTruthy();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('moves between customise and review', async () => {
    act(() => {
      Simulate.click(buttonByText(div, 'Customise'));
    });
    expect(app.state.display).toBe('Customise');
    expect(app.state.eventParams.sessions.length).toBeGreaterThan(0);
    expect(buttonByText(div, 'Run Schedule Generation')).toBeTruthy();

    act(() => {
      Simulate.click(buttonByText(div, 'Run Schedule Generation'));
    });
    await sleep(200);
    expect(app.state.display).toBe('Review');

    act(() => {
      Simulate.click(buttonByText(div, 'Change parameters'));
    });
    expect(app.state.display).toBe('Customise');
  });

  it('saves into a zip and reloads a saved schedule', async () => {
    act(() => {
      Simulate.click(buttonByText(div, 'Generate'));
    });
    await sleep(200);
    const zip = { file: jest.fn() };
    app.onSave(null, zip);
    expect(zip.file).toHaveBeenCalledWith('2025_FLL_Competition.schedule', expect.any(Blob));

    const json = JSON.stringify(app.state, freeze);
    act(() => {
      ReactDOM.unmountComponentAtNode(div);
      app = ReactDOM.render(<App />, div);
    });
    expect(app.state.display).toBe('Initialise');
    act(() => {
      app.onLoad(json);
    });
    expect(app.state.display).toBe('Review');
    expect(app.state.eventParams).toBeInstanceOf(EventParams);
    expect(app.state.eventParams.errors).toBe(0);
    expect(buttonByText(div, 'Change parameters')).toBeTruthy();
  });

  it('applies PDF settings to the event', () => {
    app.state.eventParams.populateFLL();
    app.updatePDFSettings({
      titleFontSize: 30,
      baseFontSize: 10,
      footerText: 'hi',
      logoTopLeft: 'a',
      logoTopRight: 'b',
      logoBotLeft: 'c',
      logoBotRight: 'd',
    });
    const E = app.state.eventParams;
    expect(E.titleFontSize).toBe(30);
    expect(E.footerText).toBe('hi');
    expect(E.logoBotRight).toBe('d');
  });
});
