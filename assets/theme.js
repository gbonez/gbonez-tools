// Theme: loaded synchronously in <head> so the right palette is set before first paint.
// Follows the OS setting until the visitor picks one with the toggle.
(function () {
  const KEY = 'gbonez_theme';
  const root = document.documentElement;
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }

  function current() {
    const s = saved();
    if (s === 'dark' || s === 'light') return s;
    return media && media.matches ? 'dark' : 'light';
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    const btn = document.querySelector('.theme-toggle');
    if (btn) {
      const dark = theme === 'dark';
      btn.textContent = dark ? 'Day' : 'Night';
      btn.setAttribute('aria-pressed', String(dark));
      btn.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
    }
  }

  apply(current());

  if (media && media.addEventListener) {
    media.addEventListener('change', () => { if (!saved()) apply(current()); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const top = document.querySelector('.top');
    if (!top) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode */ }
      apply(next);
    });

    // Keep the header a three-cell grid: clock and toggle share the last cell.
    const clock = top.querySelector('.clock');
    const tools = document.createElement('div');
    tools.className = 'tools';
    if (clock) {
      clock.replaceWith(tools);
      tools.append(clock, btn);
    } else {
      top.append(tools);
      tools.append(btn);
    }
    apply(root.getAttribute('data-theme') || current());
  });
})();
