#!/usr/bin/env node
/**
 * Build script for AI Engineering from SystemaOps website.
 * Parses README.md, ROADMAP.md, and glossary/terms.md from the repo root
 * and generates data.js with all phase/lesson/glossary data.
 *
 * Run: node site/build.js
 * Called automatically by GitHub Actions on every push.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');
const ROADMAP_PATH = path.join(REPO_ROOT, 'ROADMAP.md');
const GLOSSARY_PATH = path.join(REPO_ROOT, 'glossary', 'terms.md');
const OUTPUT_PATH = path.join(__dirname, 'data.js');

const GITHUB_BASE = 'https://github.com/SystemaOps/ai-engineering-Systemaops/tree/main/';

// Lessons readable without a purchase. One per altitude of the curriculum
// so prospective buyers can sample the quality at every level. Lessons not
// in this set render as a locked preview (see lesson.html).
const FREE_PREVIEW = new Set([
  'phases/00-setup-and-tooling/01-dev-environment',
  'phases/01-math-foundations/01-linear-algebra-intuition',
  'phases/03-deep-learning-core/03-backpropagation',
  'phases/14-agent-engineering/01-the-agent-loop',
]);

// ─── Parse ROADMAP.md for lesson statuses ────────────────────────────
function parseRoadmap(content) {
  const statuses = {}; // { "Phase 0": { phaseStatus, lessons: { "Dev Environment": "complete" } } }
  let currentPhase = null;
  let currentPhaseStatus = null;

  for (const line of content.split(/\r?\n/)) {
    // Match phase headers like: ## Phase 0: Setup & Tooling — ✅
    const phaseMatch = line.match(/^##\s+Phase\s+(\d+).*?—\s*(✅|🚧|⬚)/);
    if (phaseMatch) {
      const phaseId = parseInt(phaseMatch[1]);
      const statusEmoji = phaseMatch[2];
      currentPhaseStatus = statusEmoji === '✅' ? 'complete' : statusEmoji === '🚧' ? 'in-progress' : 'planned';
      currentPhase = `Phase ${phaseId}`;
      statuses[currentPhase] = { phaseStatus: currentPhaseStatus, lessons: {} };
      continue;
    }

    // Match lesson rows like: | 01 | Dev Environment | ✅ |
    if (currentPhase) {
      const lessonMatch = line.match(/^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(✅|🚧|⬚)\s*\|/);
      if (lessonMatch) {
        const lessonName = lessonMatch[1].trim();
        const statusEmoji = lessonMatch[2];
        const status = statusEmoji === '✅' ? 'complete' : statusEmoji === '🚧' ? 'in-progress' : 'planned';
        statuses[currentPhase].lessons[lessonName] = status;
      }
    }
  }

  return statuses;
}

// ─── Parse README.md for phases and lessons ──────────────────────────
function parseReadme(content, roadmapStatuses) {
  const phases = [];

  // Split into phase blocks
  // Phase 0 is in a <table> block, phases 1-19 are in <details> blocks
  // We'll parse line by line to extract phase headers and lesson tables

  const lines = content.split(/\r?\n/);
  let currentPhase = null;
  let inLessonTable = false;
  let isCapstoneTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match Phase header - multiple formats supported:
    // Old: ### Phase 0: Setup & Tooling `12 lessons`
    // Old: <summary><strong>Phase 1: Math Foundations</strong> <code>22 lessons</code> ... <em>Description</em></summary>
    // New: ### ![](https://img.shields.io/badge/Phase_0-Setup_&_Tooling-95A5A6?style=for-the-badge) `12 lessons`
    // New: <summary><b>🟣 Phase 1 — Math Foundations</b> &nbsp;<code>22 lessons</code>&nbsp; <em>Description</em></summary>
    const phaseHeaderMatch =
      line.match(/###\s+Phase\s+(\d+):\s+(.+?)\s*`(\d+)\s+lessons?`/) ||
      line.match(/###\s+!\[\]\([^)]*?Phase[_\s]+(\d+)[-_]([^?)]+?)-[A-F0-9]{6}[^)]*\)\s*`(\d+)\s+lessons?`/i);
    const detailsHeaderMatch =
      line.match(/<summary><strong>Phase\s+(\d+):\s+(.+?)<\/strong>\s*<code>(\d+)\s+(?:lessons?|projects?)<\/code>.*?<em>(.*?)<\/em>/) ||
      line.match(/<summary>\s*<b>\s*(?:[^\w\s]+\s+)?Phase\s+(\d+)\s*[—\-:]\s*(.+?)<\/b>.*?<code>(\d+)\s+(?:lessons?|projects?)<\/code>.*?<em>(.*?)<\/em>/);

    if (phaseHeaderMatch) {
      const [, idStr, rawName] = phaseHeaderMatch;
      const id = parseInt(idStr);
      const name = rawName.replace(/_/g, ' ').trim();
      // Look for the description on the next line (blockquote)
      let desc = '';
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (lines[j].startsWith('>')) {
          desc = lines[j].replace(/^>\s*/, '').trim();
          break;
        }
      }
      const roadmapKey = `Phase ${id}`;
      const phaseStatus = roadmapStatuses[roadmapKey]?.phaseStatus || 'planned';
      currentPhase = { id, name: name.trim(), status: phaseStatus, desc, lessons: [] };
      phases.push(currentPhase);
      inLessonTable = false;
      continue;
    }

    if (detailsHeaderMatch) {
      const [, idStr, name, , desc] = detailsHeaderMatch;
      const id = parseInt(idStr);
      const roadmapKey = `Phase ${id}`;
      const phaseStatus = roadmapStatuses[roadmapKey]?.phaseStatus || 'planned';
      currentPhase = { id, name: name.trim(), status: phaseStatus, desc: desc?.trim() || '', lessons: [] };
      phases.push(currentPhase);
      inLessonTable = false;
      continue;
    }

    // Detect start of lesson table
    if (currentPhase && line.match(/^\|\s*#\s*\|\s*Lesson/)) {
      inLessonTable = true;
      isCapstoneTable = false;
      continue;
    }

    // Skip table separator
    if (inLessonTable && line.match(/^\|[\s:|-]+\|$/)) {
      continue;
    }

    // Parse lesson rows
    if (inLessonTable && currentPhase && line.startsWith('|')) {
      // | 01 | [Dev Environment](phases/00-setup-and-tooling/01-dev-environment/) | Build | Python, Node, Rust |
      // | 02 | Multi-Layer Networks & Forward Pass | Build | Python |
      const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cols.length >= 4) {
        const lessonCol = cols[1];
        const typeRaw = cols[2];
        const langRaw = cols[3];

        // Type may be plain ("Build") or a shield image: ![Build](https://...)
        const typeBadgeMatch = typeRaw.match(/!\[([^\]]+)\]/);
        const type = typeBadgeMatch ? typeBadgeMatch[1] : typeRaw;

        // Lang may be plain ("Python, Rust") or emoji flags (🐍 🟦 🦀 🟣 ⚛️)
        const EMOJI_LANG = {
          '🐍': 'Python',
          '🟦': 'TypeScript',
          '🦀': 'Rust',
          '🟣': 'Julia',
          '⚛️': 'React',
          '⚛': 'React',
        };
        let lang = langRaw;
        if (/[\uD800-\uDBFF\u2600-\u27BF\u1F300-\u1FAFF]/.test(langRaw) || /[🐍🟦🦀🟣⚛]/u.test(langRaw)) {
          const tokens = Array.from(langRaw)
            .map(ch => EMOJI_LANG[ch])
            .filter(Boolean);
          if (tokens.length) lang = [...new Set(tokens)].join(', ');
          else if (langRaw.trim() === '—' || langRaw.trim() === '-') lang = '';
        }
        if (lang === '—' || lang === '-') lang = '';

        // Check if lesson has a link (meaning it has content)
        const linkMatch = lessonCol.match(/\[(.+?)\]\((.+?)\)/);
        let lessonName, url;
        if (linkMatch) {
          lessonName = linkMatch[1];
          const relativePath = linkMatch[2];
          url = GITHUB_BASE + relativePath.replace(/^\//, '');
        } else {
          lessonName = lessonCol;
          url = null;
        }

        // Get status from roadmap
        const roadmapKey = `Phase ${currentPhase.id}`;
        const roadmapPhase = roadmapStatuses[roadmapKey];
        let status = 'planned';
        if (roadmapPhase) {
          // Try to find matching lesson by fuzzy match
          const lessonNameClean = lessonName.replace(/[-–—:]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
          for (const [rName, rStatus] of Object.entries(roadmapPhase.lessons)) {
            const rNameClean = rName.replace(/[-–—:]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
            if (rNameClean.includes(lessonNameClean) || lessonNameClean.includes(rNameClean) ||
                rNameClean.split(' ').slice(0, 3).join(' ') === lessonNameClean.split(' ').slice(0, 3).join(' ')) {
              status = rStatus;
              break;
            }
          }
        }

        // If it has a link, it's at least complete (override roadmap if needed)
        if (url && status === 'planned') {
          status = 'complete';
        }

        // Capstone tables use the middle column for prerequisite phase tokens
        // (e.g., "P11 P13 P14"), not a Build/Learn enum. Keep `type` on the
        // Build/Learn axis so CSS selectors (data-type="Build"/"Learn") stay
        // valid, and emit the prereq string in a dedicated `combines` field.
        const lessonEntry = {
          name: lessonName.trim(),
          status,
          type: isCapstoneTable ? 'Capstone' : type.trim(),
          lang: lang.trim() || '—',
          ...(isCapstoneTable && { combines: type.trim() }),
          ...(url && { url }),
        };
        currentPhase.lessons.push(lessonEntry);
      }
    }

    // End of table
    if (inLessonTable && (line.match(/<\/td>/) || line.match(/<\/details>/) || (line.trim() === '' && i + 1 < lines.length && !lines[i + 1].startsWith('|')))) {
      inLessonTable = false;
    }

    // Also detect capstone table format (# | Project | Combines | Lang)
    if (currentPhase && line.match(/^\|\s*#\s*\|\s*Project/)) {
      inLessonTable = true;
      isCapstoneTable = true;
      continue;
    }
  }

  return phases;
}

// ─── Extract lesson summary + keywords from docs/en.md ───────────────
/**
 * Single-pass read of a lesson's docs/en.md.
 *
 * Returns:
 *   summary  — first `> blockquote` line (the lesson's one-liner motto).
 *   keywords — all `### H3` heading texts joined by ' · '.
 *              H3 headings are the densest vocabulary in a lesson doc
 *              (e.g. "Scaled dot-product · Causal masking · KV cache"),
 *              so they extend search coverage without bloating data.js.
 *   minutes  — parsed from the `**Time:** ~N minutes` metadata line.
 *              Powers the learning-plan scheduler (plan.html). 0 when absent.
 *
 * Both string fields are empty when the file is absent or has no
 * matching content — expected for planned lessons with no docs yet.
 */
function extractLessonMeta(relPath) {
  const docPath = path.join(REPO_ROOT, relPath, 'docs', 'en.md');
  const result = { summary: '', keywords: '', minutes: 0 };
  try {
    const lines = fs.readFileSync(docPath, 'utf8').split(/\r?\n/);
    const h3s = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!result.summary && line.startsWith('> ') && line.length > 3) {
        const s = line.slice(2).trim();
        result.summary = s.length > 180 ? s.slice(0, 177) + '…' : s;
      }
      if (!result.minutes) {
        const timeMatch = line.match(/\*\*Time:\*\*\s*~?(\d+)\s*(min|hour|hr)/i);
        if (timeMatch) {
          const n = parseInt(timeMatch[1], 10);
          result.minutes = /min/i.test(timeMatch[2]) ? n : n * 60;
        }
      }
      if (line.startsWith('### ')) {
        const heading = line.slice(4).trim();
        if (heading) h3s.push(heading);
      }
    }
    if (h3s.length) result.keywords = h3s.join(' · ');
  } catch (_) {
    // File absent or unreadable — expected for planned lessons.
  }
  return result;
}

// ─── Parse glossary/terms.md ──────────────────────────────────────────
function parseGlossary(content) {
  const terms = [];
  let currentTerm = null;

  for (const line of content.split(/\r?\n/)) {
    // Match term headers: ### Agent or ### Adam (Optimizer)
    const termMatch = line.match(/^###\s+(.+)/);
    if (termMatch) {
      if (currentTerm && currentTerm.says && currentTerm.means) {
        terms.push(currentTerm);
      }
      currentTerm = { term: termMatch[1].trim(), says: '', means: '' };
      continue;
    }

    if (!currentTerm) continue;

    // Match "What people say" line
    const saysMatch = line.match(/\*\*What people say:\*\*\s*"?(.+?)"?\s*$/);
    if (saysMatch) {
      currentTerm.says = saysMatch[1].replace(/^"/, '').replace(/"$/, '').trim();
      continue;
    }

    // Match "What it actually means" line
    const meansMatch = line.match(/\*\*What it actually means:\*\*\s*(.+)/);
    if (meansMatch) {
      currentTerm.means = meansMatch[1].trim();
      continue;
    }
  }

  // Push the last term
  if (currentTerm && currentTerm.says && currentTerm.means) {
    terms.push(currentTerm);
  }

  return terms;
}

// ─── Discover outputs/ artifacts (skills / prompts / agents) ──────────
function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 4);
  if (end === -1) return null;
  const block = text.slice(4, end);
  const result = {};
  for (const raw of block.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line || line.startsWith('#') || !line.includes(':')) continue;
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      result[key] = inner
        ? inner.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
        : [];
    } else if ((value.startsWith('"') && value.endsWith('"')) ||
               (value.startsWith("'") && value.endsWith("'"))) {
      result[key] = value.slice(1, -1);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function discoverArtifacts() {
  const artifacts = [];
  const phasesDir = path.join(REPO_ROOT, 'phases');
  if (!fs.existsSync(phasesDir)) return artifacts;
  const VALID_TYPES = ['skill', 'prompt', 'agent'];
  for (const phaseDirName of fs.readdirSync(phasesDir).sort()) {
    const phaseMatch = phaseDirName.match(/^([0-9]{2})-([a-z0-9-]+)$/);
    if (!phaseMatch) continue;
    const phaseId = parseInt(phaseMatch[1], 10);
    const phaseDir = path.join(phasesDir, phaseDirName);
    for (const lessonDirName of fs.readdirSync(phaseDir).sort()) {
      const lessonMatch = lessonDirName.match(/^([0-9]{2})-([a-z0-9-]+)$/);
      if (!lessonMatch) continue;
      const lessonId = parseInt(lessonMatch[1], 10);
      const lessonRel = `phases/${phaseDirName}/${lessonDirName}`;
      const outputsDir = path.join(phaseDir, lessonDirName, 'outputs');
      if (fs.existsSync(outputsDir)) {
        for (const file of fs.readdirSync(outputsDir).sort()) {
          if (!file.endsWith('.md')) continue;
          const stem = file.replace(/\.md$/, '');
          const type = VALID_TYPES.find(t => stem.startsWith(`${t}-`));
          if (!type) continue;
          let meta = {};
          try {
            meta = parseFrontmatter(fs.readFileSync(path.join(outputsDir, file), 'utf8')) || {};
          } catch (_) {}
          artifacts.push({
            kind: type,
            name: (meta.name || stem).trim(),
            description: (meta.description || '').trim(),
            tags: Array.isArray(meta.tags) ? meta.tags : [],
            phase: phaseId,
            lesson: lessonId,
            lessonPath: lessonRel,
            file: `${lessonRel}/outputs/${file}`,
          });
        }
      }
      const missionPath = path.join(phaseDir, lessonDirName, 'mission.md');
      if (fs.existsSync(missionPath)) {
        let firstLine = '';
        try {
          firstLine = fs.readFileSync(missionPath, 'utf8').split(/\r?\n/)[0].replace(/^#\s+/, '').trim();
        } catch (_) {}
        artifacts.push({
          kind: 'mission',
          name: firstLine || `${lessonDirName} mission`,
          description: '',
          tags: [],
          phase: phaseId,
          lesson: lessonId,
          lessonPath: lessonRel,
          file: `${lessonRel}/mission.md`,
        });
      }
    }
  }
  return artifacts;
}

// ─── Sync ROADMAP.md per-lesson Est. cells from docs/en.md Time lines ─
/**
 * Rewrites only the trailing `Est.` cell of each lesson row in ROADMAP.md
 * so it matches the authoritative `**Time:** ~N minutes` line in the
 * lesson's docs/en.md. The lesson folder is resolved from the row's link
 * when present, otherwise from the phase number + the row's `#` column
 * (phases/NN-…/MM-…). Rows whose doc is missing or has no Time line are
 * left untouched. The `| # | name | glyph |` prefix is preserved verbatim
 * so parseRoadmap()'s status-glyph matching is unaffected.
 */
function syncRoadmapEstimates() {
  const phasesDir = path.join(REPO_ROOT, 'phases');
  const phaseDirByid = {};
  for (const name of fs.readdirSync(phasesDir)) {
    const m = name.match(/^(\d{2})-/);
    if (m) phaseDirByid[parseInt(m[1], 10)] = name;
  }
  const lessonDirCache = {}; // phase id → { '01': '01-dev-environment', ... }
  const lessonDirsFor = phaseId => {
    if (!lessonDirCache[phaseId]) {
      const map = {};
      const dir = phaseDirByid[phaseId];
      if (dir) {
        for (const name of fs.readdirSync(path.join(phasesDir, dir))) {
          const m = name.match(/^(\d{2})-/);
          if (m) map[m[1]] = name;
        }
      }
      lessonDirCache[phaseId] = map;
    }
    return lessonDirCache[phaseId];
  };

  const docTime = relPath => {
    try {
      const doc = fs.readFileSync(path.join(REPO_ROOT, relPath, 'docs', 'en.md'), 'utf8');
      const m = doc.match(/\*\*Time:\*\*\s*~?(\d+)\s*(min|hour|hr)/i);
      if (m) return `~${m[1]} ${/min/i.test(m[2]) ? 'min' : 'hr'}`;
    } catch (_) { /* doc absent — expected for planned lessons */ }
    return null;
  };

  const before = fs.readFileSync(ROADMAP_PATH, 'utf8');
  let currentPhaseId = null;
  let updated = 0;
  const unresolved = [];
  const lines = before.split('\n').map(rawLine => {
    const eol = rawLine.endsWith('\r') ? '\r' : '';
    const line = eol ? rawLine.slice(0, -1) : rawLine;

    const phaseMatch = line.match(/^##\s+Phase\s+(\d+)/);
    if (phaseMatch) { currentPhaseId = parseInt(phaseMatch[1], 10); return rawLine; }
    if (currentPhaseId === null) return rawLine;

    // | 01 | Dev Environment | ✅ | ~75 min |   (name may be a markdown link)
    const row = line.match(/^(\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(?:✅|🚧|⬚)\s*\|\s*)[^|]*?(\s*\|)\s*$/);
    if (!row) return rawLine;
    const [, prefix, numStr, lessonCol, suffix] = row;

    const linkMatch = lessonCol.match(/\]\(([^)]+)\)/);
    const relPath = linkMatch
      ? linkMatch[1].replace(/\/+$/, '')
      : (lessonDirsFor(currentPhaseId)[numStr.padStart(2, '0')]
          ? `phases/${phaseDirByid[currentPhaseId]}/${lessonDirsFor(currentPhaseId)[numStr.padStart(2, '0')]}`
          : null);
    const est = relPath && docTime(relPath);
    if (!est) {
      unresolved.push(`Phase ${currentPhaseId} row ${numStr}: ${lessonCol.slice(0, 50)}`);
      return rawLine;
    }
    const next = prefix + est + suffix + eol;
    if (next !== rawLine) updated++;
    return next;
  });
  const after = lines.join('\n');
  if (after !== before) {
    fs.writeFileSync(ROADMAP_PATH, after, 'utf8');
    console.log(`   updated ${updated} Est. cells in ROADMAP.md`);
  }
  for (const u of unresolved) console.warn(`   ⚠ no Time found for ${u}`);
}

// ─── Emit static lesson content into site/content/ ───────────────────
/**
 * Copies every lesson's docs/en.md, quiz.json, and top-level code/ and
 * outputs/ files into site/content/phases/<phase>/<lesson>/, plus a
 * manifest.json ({ code: [{name,size}], outputs: [{name,size}] }) that
 * replaces the GitHub contents-API listing in lesson.html.
 *
 * This makes the deployed site fully self-contained: lesson pages fetch
 * relative URLs instead of raw.githubusercontent.com / api.github.com,
 * so the site keeps working when the repo is private, renamed, or
 * GitHub is down. The directory is gitignored and regenerated on every
 * build (locally and by Vercel's buildCommand).
 */
function emitContent() {
  const contentDir = path.join(__dirname, 'content');
  fs.rmSync(contentDir, { recursive: true, force: true });

  const phasesDir = path.join(REPO_ROOT, 'phases');
  let lessons = 0, files = 0, bytes = 0;

  const copyInto = (srcDir, destDir, manifest) => {
    if (!fs.existsSync(srcDir)) return;
    for (const name of fs.readdirSync(srcDir).sort()) {
      if (name === '.gitkeep') continue;
      const srcPath = path.join(srcDir, name);
      const stat = fs.statSync(srcPath);
      if (!stat.isFile()) continue; // top-level files only, matching the old API listing
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(destDir, name));
      if (manifest) manifest.push({ name, size: stat.size });
      files++;
      bytes += stat.size;
    }
  };

  for (const phaseDirName of fs.readdirSync(phasesDir).sort()) {
    if (!/^[0-9]{2}-/.test(phaseDirName)) continue;
    const phaseDir = path.join(phasesDir, phaseDirName);
    for (const lessonDirName of fs.readdirSync(phaseDir).sort()) {
      if (!/^[0-9]{2}-/.test(lessonDirName)) continue;
      const lessonDir = path.join(phaseDir, lessonDirName);
      const destBase = path.join(contentDir, 'phases', phaseDirName, lessonDirName);
      const manifest = { code: [], outputs: [] };

      const docPath = path.join(lessonDir, 'docs', 'en.md');
      if (fs.existsSync(docPath)) {
        fs.mkdirSync(path.join(destBase, 'docs'), { recursive: true });
        fs.copyFileSync(docPath, path.join(destBase, 'docs', 'en.md'));
        files++;
        bytes += fs.statSync(docPath).size;
      }
      const quizPath = path.join(lessonDir, 'quiz.json');
      if (fs.existsSync(quizPath)) {
        fs.mkdirSync(destBase, { recursive: true });
        fs.copyFileSync(quizPath, path.join(destBase, 'quiz.json'));
        files++;
        bytes += fs.statSync(quizPath).size;
      }
      copyInto(path.join(lessonDir, 'code'), path.join(destBase, 'code'), manifest.code);
      copyInto(path.join(lessonDir, 'outputs'), path.join(destBase, 'outputs'), manifest.outputs);

      if (fs.existsSync(destBase)) {
        fs.writeFileSync(path.join(destBase, 'manifest.json'), JSON.stringify(manifest));
        lessons++;
      }
    }
  }

  console.log(`   content bundle: ${lessons} lessons, ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB → site/content/`);
}

// ─── Main build ──────────────────────────────────────────────────────
function build() {
  console.log('📖 Reading source files...');

  console.log('🕐 Syncing ROADMAP.md Est. cells from docs/en.md Time lines...');
  syncRoadmapEstimates();

  const readme = fs.readFileSync(README_PATH, 'utf8');
  const roadmap = fs.readFileSync(ROADMAP_PATH, 'utf8');
  const glossary = fs.readFileSync(GLOSSARY_PATH, 'utf8');

  console.log('🔍 Parsing ROADMAP.md...');
  const roadmapStatuses = parseRoadmap(roadmap);

  console.log('🔍 Parsing README.md...');
  const phases = parseReadme(readme, roadmapStatuses);

  console.log('🔍 Parsing glossary/terms.md...');
  const glossaryTerms = parseGlossary(glossary);

  console.log('🔍 Discovering outputs + Phase 14 missions...');
  const artifacts = discoverArtifacts();

  console.log('📦 Emitting static lesson content...');
  emitContent();

  console.log('📚 Extracting lesson summaries + keywords from docs/en.md...');
  let summarized = 0, withKeywords = 0;
  let totalMinutes = 0;
  const phaseMinutes = {}; // phase id → summed lesson minutes
  for (const phase of phases) {
    phaseMinutes[phase.id] = phaseMinutes[phase.id] || 0;
    for (const lesson of phase.lessons) {
      if (lesson.url) {
        const relPath = lesson.url.replace(GITHUB_BASE, '').replace(/\/+$/, '');
        const meta = extractLessonMeta(relPath);
        if (meta.summary)  { lesson.summary  = meta.summary;  summarized++;   }
        if (meta.keywords) { lesson.keywords = meta.keywords; withKeywords++; }
        if (meta.minutes)  {
          lesson.minutes = meta.minutes;
          totalMinutes += meta.minutes;
          phaseMinutes[phase.id] += meta.minutes;
        }
        if (FREE_PREVIEW.has(relPath)) { lesson.free = true; }
      }
    }
  }

  // Stats
  let totalLessons = 0;
  let completeLessons = 0;
  phases.forEach(p => {
    totalLessons += p.lessons.length;
    completeLessons += p.lessons.filter(l => l.status === 'complete').length;
  });

  console.log(`\n📊 Stats:`);
  console.log(`   Phases: ${phases.length}`);
  console.log(`   Lessons: ${totalLessons}`);
  console.log(`   Complete: ${completeLessons}`);
  console.log(`   Summaries: ${summarized}, Keywords: ${withKeywords}`);
  console.log(`   Estimated time: ${totalMinutes} min (~${Math.round(totalMinutes / 60)} hours)`);
  console.log(`   Glossary terms: ${glossaryTerms.length}`);
  console.log(`   Artifacts: ${artifacts.length}`);

  // Generate data.js
  const output = `// Auto-generated by build.js — do not edit manually.
// Last built: ${new Date().toISOString()}

const PHASES = ${JSON.stringify(phases, null, 2)};

const GLOSSARY = ${JSON.stringify(glossaryTerms, null, 2)};

const ARTIFACTS = ${JSON.stringify(artifacts, null, 2)};
`;

  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
  console.log(`\n✅ Generated ${OUTPUT_PATH}`);

  // Capstone phase is open-ended (pick-your-own projects), so the README
  // "Where to start" estimates exclude it and call it out separately.
  const capstonePhase = phases.find(p => p.lessons.some(l => l.type === 'Capstone'));
  syncCounts(totalLessons, phases.length, artifacts.length, totalMinutes, phaseMinutes,
    capstonePhase ? capstonePhase.id : null);
}

// ─── Keep marketing counts in sync (single source of truth = this build) ──
function syncCounts(lessons, phaseCount, outputs, totalMinutes, phaseMinutes, capstonePhaseId) {
  const hoursOf = mins => Math.round(mins / 60).toLocaleString('en-US');
  const totalHours = hoursOf(totalMinutes);

  const targets = ['index.html', 'catalog.html', 'lesson.html', 'prereqs.html', 'cmdpalette.js'];
  for (const f of targets) {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) continue;
    const before = fs.readFileSync(p, 'utf8');
    let after = before
      .replace(/\b\d+( AI engineering)? lessons\b/g, `${lessons}$1 lessons`)
      .replace(/\b\d+ phases\b/g, `${phaseCount} phases`)
      .replace(/\b\d+ outputs\b/g, `${outputs} outputs`);
    if (totalMinutes > 0) {
      after = after.replace(/~[\d,]+(?:\.\d+)? hours\b/g, `~${totalHours} hours`);
    }
    if (after !== before) {
      fs.writeFileSync(p, after, 'utf8');
      console.log(`   synced counts in ${f}`);
    }
  }

  // README.md + ROADMAP.md carry the same totals (headline blockquote,
  // "Where to start" table, roadmap intro/footer, per-phase headers).
  // All hour figures are derived from the per-lesson `**Time:**` lines in
  // docs/en.md — the same numbers that power the plan.html scheduler.
  // Skipped when no minutes were extracted, so a parsing regression can't
  // zero out the published totals.
  if (totalMinutes > 0) {
    // Lesson-phase hours from startId onward, excluding the capstone phase.
    const cumulativeFrom = startId => Object.entries(phaseMinutes)
      .reduce((sum, [id, mins]) =>
        Number(id) >= startId && Number(id) !== capstonePhaseId ? sum + mins : sum, 0);
    const capstoneHours = capstonePhaseId !== null && phaseMinutes[capstonePhaseId]
      ? hoursOf(phaseMinutes[capstonePhaseId]) : null;

    const readmeBefore = fs.readFileSync(README_PATH, 'utf8');
    let readmeAfter = readmeBefore
      // Headline: "503 lessons. 20 phases. ~1,137 hours."
      .replace(/(\d+ lessons\. \d+ phases\. )~[\d,]+(?:\.\d+)? hours/, `$1~${totalHours} hours`)
      // "Where to start" rows: | ... | Phase N — ... | ~X hours |
      .replace(/(\|[^|\n]*Phase\s+(\d+)\s+—[^|\n]*\|\s*)~[\d,]+(?:\.\d+)? hours(\s*\|)/g,
        (_, pre, id, post) => `${pre}~${hoursOf(cumulativeFrom(Number(id)))} hours${post}`);
    if (capstoneHours) {
      // Footnote under the "Where to start" table.
      readmeAfter = readmeAfter.replace(/~[\d,]+(?:\.\d+)? hours if you build all/,
        `~${capstoneHours} hours if you build all`);
    }
    if (readmeAfter !== readmeBefore) {
      fs.writeFileSync(README_PATH, readmeAfter, 'utf8');
      console.log('   synced hour totals in README.md');
    }

    const roadmapBefore = fs.readFileSync(ROADMAP_PATH, 'utf8');
    const roadmapAfter = roadmapBefore
      .replace(/(Total estimated time: )~[\d,]+(?:\.\d+)? hours/, `$1~${totalHours} hours`)
      .replace(/~[\d,]+(?:\.\d+)? hours estimated/, `~${totalHours} hours estimated`)
      // Phase headers: ## Phase N: Name — ✅ (~X hours)
      .replace(/^(## Phase (\d+):[^(\n]*\()~[\d,]+(?:\.\d+)? hours\)/gm,
        (match, pre, id) => phaseMinutes[Number(id)]
          ? `${pre}~${hoursOf(phaseMinutes[Number(id)])} hours)`
          : match);
    if (roadmapAfter !== roadmapBefore) {
      fs.writeFileSync(ROADMAP_PATH, roadmapAfter, 'utf8');
      console.log('   synced hour totals in ROADMAP.md');
    }
  }
}

build();
