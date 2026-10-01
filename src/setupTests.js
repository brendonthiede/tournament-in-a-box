// jsdom does not implement these; the app calls them from generate() and error paths.
window.alert = jest.fn();
window.scrollTo = jest.fn();
