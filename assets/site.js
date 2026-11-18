// Shared helpers: NYC clock and MTA line bullets.
(function () {
  const MTA_COLORS = {
    '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
    '4': '#00933C', '5': '#00933C', '6': '#00933C',
    '7': '#B933AD',
    'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
    'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
    'G': '#6CBE45',
    'J': '#996633', 'Z': '#996633',
    'L': '#A7A9AC',
    'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
    'S': '#808183', 'H': '#0039A6', 'T': '#00ADD0', 'SIR': '#0039A6'
  };
  const DARK_TEXT = new Set(['N', 'Q', 'R', 'W']);

  // Express variants (6X, 7X, FX) take their base line's colour.
  function baseLine(line) {
    return /^[0-9A-Z]X$/.test(line) ? line[0] : line;
  }

  window.mtaColor = function (line) {
    return MTA_COLORS[baseLine(String(line == null ? '' : line).toUpperCase())] || '#808183';
  };

  window.mtaTextColor = function (line) {
    return DARK_TEXT.has(baseLine(String(line == null ? '' : line).toUpperCase())) ? '#0b0b0b' : '#ffffff';
  };

  window.mtaBullet = function (line) {
    const label = String(line == null ? '' : line).replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!label) return '';
    const base = baseLine(label);
    const bg = MTA_COLORS[base] || '#808183';
    const fg = DARK_TEXT.has(base) ? '#0b0b0b' : '#ffffff';
    return `<span class="bullet" data-len="${label.length}" style="background:${bg};color:${fg}">${label}</span>`;
  };

  const clocks = document.querySelectorAll('[data-clock]');
  if (clocks.length) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const tick = () => {
      const text = `NYC ${fmt.format(new Date())}`;
      clocks.forEach(el => { el.textContent = text; });
    };
    tick();
    setInterval(tick, 1000);
  }
})();
