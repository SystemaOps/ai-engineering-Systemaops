# Changelog

What's new in the curriculum. Most recent first.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Each entry names the phase, lesson, and what changed, so learners can jump straight to the delta.

## [Unreleased]

### Changed
- **Relicensed from MIT to a proprietary commercial license.** The curriculum is
  now a paid product. `LICENSE` replaced (versions distributed before this change
  remain MIT for their recipients), README rewritten to drop free/open-source
  positioning, and the open-source apparatus removed: `FORKING.md`, `SPONSORS.md`,
  `.github/FUNDING.yml`, the README sponsor block, and the star-history section.

### Added
- `scripts/scaffold-lesson.sh` — scaffolder that creates `phases/NN-phase/NN-lesson/` with the full folder structure and a `docs/en.md` skeleton prefilled from `LESSON_TEMPLATE.md`.
- `.github/PULL_REQUEST_TEMPLATE.md` — contributor checklist (code runs, no code comments, built-from-scratch-first, atomic per-lesson commit, markdown-link ROADMAP row).
- `.github/ISSUE_TEMPLATE/bug_report.md` and `new_lesson_proposal.md` — structured intake for bug reports and lesson pitches.
- This `CHANGELOG.md`.

### Fixed
- Total-time claims now match the per-lesson `**Time:**` estimates in `docs/en.md` (68,205 min ≈ 1,137 hours): README headline said ~320 hours, ROADMAP said ~314 (intro) and ~1,050 (footer), and ROADMAP per-phase hour headers drifted from their lessons. README's "Where to start" table now sums the lesson phases (0–18) per starting point, with Phase 19 capstones (~627 hours total) called out separately.
- `site/build.js` `syncCounts()` now derives all of these hour figures from the extracted lesson minutes and rewrites README.md and ROADMAP.md on build, the same way lesson/phase counts are already synced — so they can't drift again.

## 2026-04 — Phase 4: Computer Vision complete

### Added
- All 28 Phase 4 lessons, covering image fundamentals through multi-modal vision (VLMs, 3D, video, self-supervised).
- Phase 4 rows in `ROADMAP.md` linked as markdown to the lesson folders, so the website surfaces them.

### Fixed
- Phase 4 precision pass across 15+ lessons:
  - `phase-4/02`: shape calculator specifies RF/stride handling for adaptive pool, flatten, and linear.
  - `phase-4/03`: backbone selector description lists all covered families; head guidance added for OCR, medical, industrial.
  - `phase-4/04`: classification diagnostics use quantitative thresholds per failure mode; `n/a` declared for undefined metrics; guard for fewer than 3 classes.
  - `phase-4/06`: detection metric reader uses `AP@0.5` (not `mAP@0.5`); per-class recall declared optional; anchor designer clarifies stride truncation and single-anchor-per-level path.
  - `phase-4/10`: sampler picker declares `unet_forward_ms` as an input; ControlNet guard promoted to rule 0.
  - `phase-4/14`: ViT inspector aligned with refusal rule — port attempts are audited, not endorsed.
  - `phase-4/24`: open-vocab stack picker has explicit rule precedence and license-filter semantics; concept designer resolves step-5/rule-80 conflict.
  - `phase-4/25`: VLM docs `_merge` raises descriptive `ValueError` on placeholder mismatch; CMER normalises internally.
  - `phase-4/27`: `synthetic_frames` clips GT boxes to frame H/W.
  - `phase-4/28`: `rope_3d` validates dim split; dropped unused `F` import from DiT block example.

## 2026-Q1 and earlier

### Added
- Phase 0 (Setup & Tooling): all 12 lessons.
- Phase 1 (Math Foundations): all 22 lessons.
- Phase 2 (ML Fundamentals): all 18 lessons.
- Phase 3 (Deep Learning Core): core lessons through perceptron, backprop, optimizers.
- Built-in Claude Code skills: `find-your-level` (placement quiz) and `check-understanding` (per-phase quiz).
- Website at `aiengineeringfromsystemaops.com`: catalog, per-lesson pages, roadmap, 277-term glossary.
- Initial scaffolding for all 20 phases (`phases/00-*` through `phases/19-*`).
- `LESSON_TEMPLATE.md`, `CONTRIBUTING.md`, `ROADMAP.md`, `README.md`.

[Unreleased]: https://github.com/SystemaOps/ai-engineering-Systemaops/compare/HEAD...HEAD
