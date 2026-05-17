---
tags: [gameslist, overview]
created: 2026-04-30
---

# GamesList — Project Overview

## What Is It?

GamesList is a personal game tracking web app built as a solo side project. The core idea: track every game you play across a shared household, wrap it in a gamification layer (tickets, XP, a spin wheel), and make it feel like an event rather than a spreadsheet.

It was built iteratively in phases over several weeks, with each phase adding a self-contained slice of functionality.

## The Problem It Solves

A household where multiple people share a gaming "queue" needs a way to:
- Track what's been played and completed
- Fairly decide who picks the next game (the wheel)
- Reward completion with a currency that unlocks privileges (ticket economy)
- Keep everyone's history and stats visible

A plain spreadsheet works but has no soul. GamesList adds the soul.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 14 (App Router) | Server Components + Server Actions = minimal client JS |
| Database + Auth | Supabase (PostgreSQL + GoTrue) | Instant auth, row-level security, Postgres RPCs |
| Styling | Tailwind CSS + design token system | Consistent theming, easy dark mode via CSS variables |
| Language | TypeScript | End-to-end type safety from DB types to UI |
| Fonts | Geist Sans (body) + Orbitron (logo) | Clean + slightly gamified feel |
| Testing | Vitest + jsdom | Fast, Jest-compatible, runs in ~1 second |
| Hosting | Vercel (implied by Next.js) | Zero-config deploys |

## Key Features

- **Game library** — add, edit, delete games with status (playing / completed / backlog / DNF), hours, rating, review, platform, cover image
- **Gamification — Tickets** — completing games earns tickets based on length and achievement progress; tickets are spent on wheel privileges
- **Gamification — XP & Levels** — separate XP system tracking total progress
- **Wheel spin** — random game picker with three turn types (Spin, Spin+Reroll, Choose) and two modes (Elimination, First Land)
- **Achievements** — unlock badges for milestones, displayed with flash notifications
- **Friends list** — view other users' game libraries (read-only)
- **Settings** — display name, password, theme (light/dark/system), accent colour
- **Dynamic theming** — the user's chosen accent colour drives the entire brand palette in real time

## Status

Phases 1–5 are complete. Phase 6 (public Changelog page) is deferred indefinitely.

---

## See Also

- [[01 - Feature Log]]
- [[02 - Architecture]]
- [[03 - Database Schema]]
- [[04 - Development Journal]]
- [[05 - Component & API Reference]]
