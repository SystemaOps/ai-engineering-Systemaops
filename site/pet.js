/**
 * Study Pet — a local-only pixel focus companion.
 *
 * A small creature lives in the corner of every page. It runs focus
 * sessions (15/25/45 min), earns XP from focus minutes and completed
 * lessons, levels up through five evolution stages, and keeps a daily
 * study streak. Everything is stored in the user's browser; no network.
 *
 *   aifs:pet:v1 = {
 *     name: string,
 *     xp: number,
 *     streak: number,
 *     lastStudyDay: "YYYY-MM-DD" | null,
 *     sessionsCompleted: number,
 *     focusMinutes: number,
 *     lessonsSeen: number,            // completed-lesson count already rewarded
 *     session: { startedAt, endsAt, mins } | null,
 *     minimized: boolean
 *   }
 */
(function () {
  'use strict';

  var KEY = 'aifs:pet:v1';
  var XP_PER_FOCUS_MIN = 1;
  var XP_SESSION_BONUS = 15;
  var XP_PER_LESSON = 25;
  // Cumulative XP needed to *reach* each level (level = index + 1).
  var LEVELS = [0, 50, 130, 250, 450, 700, 1050, 1500, 2100, 2800];
  var LEVEL_STEP_AFTER = 800; // per level past the table
  // Evolution stage by level: 1 → egg, 2-3 → hatchling, 4-5 → kit,
  // 6-7 → scholar, 8+ → sage.
  var STAGE_NAMES = ['Egg', 'Hatchling', 'Kit', 'Scholar', 'Sage'];

  /* ── State ───────────────────────────────────────────────────────────── */

  function defaults() {
    return {
      name: 'Byte', xp: 0, streak: 0, lastStudyDay: null,
      sessionsCompleted: 0, focusMinutes: 0, lessonsSeen: -1,
      session: null, minimized: false
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return defaults();
      var d = defaults();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      return s;
    } catch (e) { return defaults(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  var state = load();
  var celebrateUntil = 0;
  var blinkUntil = 0;

  function levelFor(xp) {
    var lvl = 1;
    for (var i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i]) lvl = i + 1;
    if (xp >= LEVELS[LEVELS.length - 1]) {
      lvl = LEVELS.length + Math.floor((xp - LEVELS[LEVELS.length - 1]) / LEVEL_STEP_AFTER);
    }
    return lvl;
  }

  function levelFloor(lvl) {
    if (lvl <= LEVELS.length) return LEVELS[lvl - 1];
    return LEVELS[LEVELS.length - 1] + (lvl - LEVELS.length) * LEVEL_STEP_AFTER;
  }

  function stageFor(lvl) {
    if (lvl <= 1) return 0;
    if (lvl <= 3) return 1;
    if (lvl <= 5) return 2;
    if (lvl <= 7) return 3;
    return 4;
  }

  function dayKey(t) {
    var d = new Date(t || Date.now());
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }

  function touchStreak() {
    var today = dayKey();
    if (state.lastStudyDay === today) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    state.streak = (state.lastStudyDay === dayKey(y.getTime())) ? state.streak + 1 : 1;
    state.lastStudyDay = today;
  }

  function award(xp, reason) {
    var before = levelFor(state.xp);
    state.xp += xp;
    touchStreak();
    save();
    var after = levelFor(state.xp);
    celebrateUntil = Date.now() + 5000;
    toast('+' + xp + ' XP — ' + reason + (after > before ? ' · LEVEL UP! LVL ' + after : ''));
    render();
    scheduleTick();
  }

  /* ── Pixel sprite ────────────────────────────────────────────────────── */
  // 16×13 grid. Legend: o body · # outline · g gold · E eye · . empty

  var EGG = [
    '................',
    '......####......',
    '.....#oooo#.....',
    '....#oooooo#....',
    '....#oooooo#....',
    '...#oooooooo#...',
    '...#oogooooo#...',
    '...#ooooooog#...',
    '...#oooooooo#...',
    '....#oooooo#....',
    '.....######.....',
    '................',
    '................'
  ];

  var BLOB = [
    '................',
    '...#........#...',
    '..#g#......#g#..',
    '..#oo######oo#..',
    '.#oooooooooooo#.',
    '.#oooooooooooo#.',
    '.#oooooooooooo#.',
    '.#ooooooggoooo#.',
    '.#oooooooooooo#.',
    '..#oooooooooo#..',
    '...##########...',
    '................',
    '................'
  ];

  var COLORS = {
    'o': '#3BA3A1',
    '#': '#1A7F7F',
    'g': '#E8B831',
    'E': '#13201f'
  };

  function spritePixels(stage, mood) {
    var grid = (stage === 0 ? EGG : BLOB).map(function (r) { return r.split(''); });
    if (stage > 0) {
      // Eyes at columns 4 & 11, rows 5-6.
      var closed = (mood === 'sleeping') || (mood === 'idle' && Date.now() < blinkUntil);
      if (mood === 'celebrate') {
        // ^ ^ happy eyes
        [[3, 6], [5, 6], [4, 5], [10, 6], [12, 6], [11, 5]].forEach(function (p) {
          grid[p[1]][p[0]] = 'E';
        });
      } else if (closed) {
        grid[6][4] = 'E'; grid[6][11] = 'E';
      } else {
        grid[5][4] = 'E'; grid[6][4] = 'E';
        grid[5][11] = 'E'; grid[6][11] = 'E';
      }
      if (stage >= 2) { // collar
        for (var c = 4; c <= 11; c++) grid[9][c] = 'g';
      }
      if (stage >= 3) { // glasses
        [[3, 5], [3, 6], [5, 5], [5, 6], [10, 5], [10, 6], [12, 5], [12, 6],
         [6, 5], [7, 5], [8, 5], [9, 5]].forEach(function (p) {
          if (grid[p[1]][p[0]] === 'o') grid[p[1]][p[0]] = '#';
        });
      }
      if (stage >= 4) { // graduation cap + tassel
        for (var c2 = 4; c2 <= 11; c2++) grid[0][c2] = 'E';
        for (var c3 = 6; c3 <= 9; c3++) grid[1][c3] = 'E';
        grid[1][12] = 'g'; grid[2][12] = 'g';
      }
    }
    return grid;
  }

  function spriteSvg(stage, mood) {
    var grid = spritePixels(stage, mood);
    var rects = '';
    for (var y = 0; y < grid.length; y++) {
      for (var x = 0; x < grid[y].length; x++) {
        var ch = grid[y][x];
        if (ch === '.') continue;
        rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' +
          (COLORS[ch] || COLORS.o) + '"/>';
      }
    }
    return '<svg viewBox="0 0 16 13" shape-rendering="crispEdges" ' +
      'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + rects + '</svg>';
  }

  /* ── Mood ────────────────────────────────────────────────────────────── */

  function mood() {
    if (Date.now() < celebrateUntil) return 'celebrate';
    if (state.session) return 'focused';
    if (state.lastStudyDay !== dayKey()) return 'sleeping';
    return 'idle';
  }

  /* ── Styles ──────────────────────────────────────────────────────────── */

  var css = '' +
    '.pet-widget{position:fixed;right:18px;bottom:18px;z-index:150;font-family:var(--font-mono);}' +
    '.pet-toggle{display:block;width:64px;height:56px;padding:4px;cursor:pointer;border:1px solid var(--rule-soft);' +
      'background:var(--bg-surface);box-shadow:var(--shadow-hard);transition:transform .15s;}' +
    '.pet-toggle:hover{transform:translateY(-2px);}' +
    '.pet-toggle svg{width:100%;height:100%;display:block;}' +
    '.pet-widget.pet-celebrate .pet-toggle{animation:pet-bounce .5s ease 4;}' +
    '.pet-widget.pet-sleeping .pet-toggle::after{content:"z";position:absolute;top:-6px;right:6px;' +
      'color:var(--ink-mute);font-size:12px;animation:pet-zz 2.4s ease-in-out infinite;}' +
    '.pet-timer-chip{position:absolute;top:-12px;left:50%;transform:translateX(-50%);font-size:10px;' +
      'background:var(--blueprint);color:#fff;padding:1px 6px;white-space:nowrap;}' +
    '@keyframes pet-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}' +
    '@keyframes pet-zz{0%,100%{opacity:.2;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}}' +
    '.pet-panel{position:absolute;right:0;bottom:64px;width:248px;border:1px solid var(--rule);' +
      'background:var(--bg-surface);box-shadow:var(--shadow-hard-lg);padding:14px;display:none;}' +
    '.pet-widget.pet-open .pet-panel{display:block;}' +
    '.pet-row{display:flex;align-items:center;gap:10px;}' +
    '.pet-row svg{width:48px;height:42px;flex-shrink:0;}' +
    '.pet-name{font-size:.85rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink);}' +
    '.pet-sub{font-size:.68rem;color:var(--ink-soft);margin-top:2px;}' +
    '.pet-xpbar{height:6px;border:1px solid var(--rule-soft);margin-top:6px;background:var(--bg);}' +
    '.pet-xpbar i{display:block;height:100%;background:var(--blueprint);transition:width .3s;}' +
    '.pet-section{border-top:1px solid var(--rule-soft);margin-top:12px;padding-top:10px;}' +
    '.pet-label{font-size:.62rem;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-mute);margin-bottom:6px;}' +
    '.pet-btns{display:flex;gap:6px;}' +
    '.pet-btn{flex:1;font-family:var(--font-mono);font-size:.72rem;padding:6px 0;cursor:pointer;' +
      'border:1px solid var(--rule);background:var(--bg);color:var(--ink);}' +
    '.pet-btn:hover{background:var(--blueprint);color:#fff;border-color:var(--blueprint);}' +
    '.pet-countdown{font-family:var(--font-display);font-size:1.7rem;color:var(--blueprint);text-align:center;}' +
    '.pet-stats{font-size:.68rem;color:var(--ink-soft);line-height:1.7;}' +
    '.pet-links{display:flex;justify-content:space-between;margin-top:10px;}' +
    '.pet-links a{font-size:.62rem;color:var(--ink-mute);cursor:pointer;text-transform:uppercase;' +
      'letter-spacing:.06em;border-bottom:1px dotted var(--ink-mute);}' +
    '.pet-links a:hover{color:var(--blueprint);}' +
    '.pet-toast{position:fixed;right:18px;bottom:84px;z-index:151;background:var(--blueprint);color:#fff;' +
      'font-family:var(--font-mono);font-size:.72rem;padding:8px 12px;box-shadow:var(--shadow-hard);' +
      'opacity:0;transform:translateY(6px);transition:opacity .25s,transform .25s;pointer-events:none;}' +
    '.pet-toast.show{opacity:1;transform:translateY(0);}' +
    '.pet-widget.pet-min .pet-toggle{width:26px;height:26px;padding:2px;}' +
    '.pet-widget.pet-min .pet-panel{bottom:34px;}' +
    '@media (max-width:640px){.pet-widget{right:10px;bottom:10px;}.pet-panel{width:228px;}}' +
    '@media (prefers-reduced-motion:reduce){.pet-widget *{animation:none!important;transition:none!important;}}';

  /* ── DOM ─────────────────────────────────────────────────────────────── */

  var root, toggleBtn, panel, toastEl, toastTimer;

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 4000);
  }

  function fmt(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function render() {
    if (!root) return;
    var lvl = levelFor(state.xp);
    var stage = stageFor(lvl);
    var m = mood();

    root.className = 'pet-widget pet-' + m +
      (root.classList.contains('pet-open') ? ' pet-open' : '') +
      (state.minimized ? ' pet-min' : '');

    var chip = state.session ?
      '<span class="pet-timer-chip">' + fmt(state.session.endsAt - Date.now()) + '</span>' : '';
    toggleBtn.innerHTML = chip + spriteSvg(stage, m);
    toggleBtn.setAttribute('aria-label', state.name + ' the study pet' +
      (state.session ? ' — focus session running' : ''));

    var floor = levelFloor(lvl), next = levelFloor(lvl + 1);
    var pct = Math.min(100, Math.round(100 * (state.xp - floor) / (next - floor)));

    var focusHtml;
    if (state.session) {
      focusHtml =
        '<div class="pet-countdown">' + fmt(state.session.endsAt - Date.now()) + '</div>' +
        '<div class="pet-btns" style="margin-top:8px"><button class="pet-btn" data-pet-stop>STOP EARLY</button></div>';
    } else {
      focusHtml =
        '<div class="pet-btns">' +
        '<button class="pet-btn" data-pet-start="15">15 MIN</button>' +
        '<button class="pet-btn" data-pet-start="25">25 MIN</button>' +
        '<button class="pet-btn" data-pet-start="45">45 MIN</button>' +
        '</div>';
    }

    panel.innerHTML =
      '<div class="pet-row">' + spriteSvg(stage, m) +
      '<div style="flex:1">' +
      '<div class="pet-name">' + state.name + ' · LVL ' + lvl + '</div>' +
      '<div class="pet-sub">' + STAGE_NAMES[stage] + ' · ' + state.xp + ' XP</div>' +
      '<div class="pet-xpbar"><i style="width:' + pct + '%"></i></div>' +
      '</div></div>' +
      '<div class="pet-section"><div class="pet-label">Focus session</div>' + focusHtml + '</div>' +
      '<div class="pet-section pet-stats">' +
      'STREAK ' + state.streak + ' DAY' + (state.streak === 1 ? '' : 'S') +
      ' · ' + state.sessionsCompleted + ' SESSIONS · ' + state.focusMinutes + ' FOCUS MIN' +
      '</div>' +
      '<div class="pet-links"><a data-pet-rename>Rename</a>' +
      '<a data-pet-min>' + (state.minimized ? 'Expand' : 'Minimize') + '</a></div>';
  }

  /* ── Session logic ───────────────────────────────────────────────────── */

  function startSession(mins) {
    var now = Date.now();
    state.session = { startedAt: now, endsAt: now + mins * 60000, mins: mins };
    save();
    toast(state.name + ' is focusing with you — ' + mins + ' min');
    render();
    scheduleTick();
  }

  function completeSession() {
    var mins = state.session.mins;
    state.sessionsCompleted += 1;
    state.focusMinutes += mins;
    state.session = null;
    award(mins * XP_PER_FOCUS_MIN + XP_SESSION_BONUS, mins + ' min focus session');
  }

  function stopSession() {
    var elapsed = Math.floor((Date.now() - state.session.startedAt) / 60000);
    state.focusMinutes += elapsed;
    state.session = null;
    if (elapsed > 0) {
      award(elapsed * XP_PER_FOCUS_MIN, elapsed + ' focused min (stopped early)');
    } else {
      save(); render();
    }
  }

  var tickTimer = null;

  // The per-second heartbeat runs only while something is actually
  // animating (a session counting down, or a celebration). When the pet
  // is idle we tear the timer down entirely so the page can go quiet —
  // lighter on battery and lets capture/idle tooling settle.
  function needsTick() {
    return !!state.session || Date.now() < celebrateUntil;
  }

  function scheduleTick() {
    if (needsTick()) {
      if (!tickTimer) tickTimer = setInterval(tick, 1000);
    } else if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  function tick() {
    if (state.session && Date.now() >= state.session.endsAt) completeSession();
    else if (needsTick()) render();
    scheduleTick();
  }

  /* ── Lesson-completion rewards ───────────────────────────────────────── */

  function completedLessonCount() {
    try {
      var raw = localStorage.getItem('aifs:progress:v1');
      if (!raw) return 0;
      var p = JSON.parse(raw);
      var n = 0;
      for (var k in p.lessons) if (p.lessons[k] && p.lessons[k].completedAt) n++;
      return n;
    } catch (e) { return 0; }
  }

  function syncLessons() {
    var n = completedLessonCount();
    if (state.lessonsSeen < 0) {
      // First run: don't retroactively dump XP for old progress.
      state.lessonsSeen = n; save(); return;
    }
    if (n > state.lessonsSeen) {
      var gained = n - state.lessonsSeen;
      state.lessonsSeen = n;
      award(gained * XP_PER_LESSON, gained + ' lesson' + (gained === 1 ? '' : 's') + ' completed');
    } else if (n !== state.lessonsSeen) {
      state.lessonsSeen = n; save();
    }
  }

  /* ── Boot ────────────────────────────────────────────────────────────── */

  function boot() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.className = 'pet-widget';
    root.innerHTML = '<div class="pet-panel" role="dialog" aria-label="Study pet"></div>' +
      '<button class="pet-toggle" type="button"></button>';
    document.body.appendChild(root);
    panel = root.querySelector('.pet-panel');
    toggleBtn = root.querySelector('.pet-toggle');

    toastEl = document.createElement('div');
    toastEl.className = 'pet-toast';
    document.body.appendChild(toastEl);

    toggleBtn.addEventListener('click', function () {
      root.classList.toggle('pet-open');
      render();
    });

    panel.addEventListener('click', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-pet-start')) startSession(parseInt(t.getAttribute('data-pet-start'), 10));
      else if (t.hasAttribute('data-pet-stop')) stopSession();
      else if (t.hasAttribute('data-pet-rename')) {
        var n = prompt('Name your study pet:', state.name);
        if (n && n.trim()) { state.name = n.trim().slice(0, 16); save(); render(); }
      }
      else if (t.hasAttribute('data-pet-min')) {
        state.minimized = !state.minimized;
        root.classList.remove('pet-open');
        save(); render();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('pet-open')) {
        root.classList.remove('pet-open'); render();
      }
    });

    // A session that ended while the tab was closed still counts.
    if (state.session && Date.now() >= state.session.endsAt) completeSession();

    syncLessons();
    if (window.AIFSProgress && typeof window.AIFSProgress.onChange === 'function') {
      window.AIFSProgress.onChange(syncLessons);
    }
    window.addEventListener('storage', function (e) {
      if (e.key === 'aifs:progress:v1') syncLessons();
    });

    scheduleTick();
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
