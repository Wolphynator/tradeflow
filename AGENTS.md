# TradeFlow — Agent Instructions

## Read this first
Before any coding or file changes:
1. Read `Obsidian Vault/Projects/Invoice Maker/PROJECT_CONTEXT.md`.
2. Read `Obsidian Vault/Projects/Invoice Maker/AI_DEVELOPMENT_PRINCIPLES.md` — the master AI instruction document.
3. Read and follow the root-level `AI_DEVELOPMENT_PROTOCOL.md` for task coordination, conflict prevention, Git workflow, and execution checklists.
Also check `TRADEFLOW_RULEBOOK.md` for project rules, but only apply approved sections.

## What this project is
Mobile invoicing PWA for UK tradespeople. Single file: `index.html` (~8,000+ lines, vanilla JS, no framework).
Stack: Supabase (auth + DB + Edge Functions), Cloudflare Pages, Resend (email).

## Read at session start
1. `Obsidian Vault/Projects/Invoice Maker/PROJECT_CONTEXT.md` — full architecture reference
2. `Obsidian Vault/Projects/Invoice Maker/AI_DEVELOPMENT_PRINCIPLES.md` — master AI and engineering rules
3. `Obsidian Vault/Projects/Invoice Maker/HANDOFF.md` — current status, version, what's pending

## Before touching any form, input, or public-facing field
**Read `Obsidian Vault/Projects/Invoice Maker/SECURITY_FORM_RULES.md` first.**
This covers: email validation, password fields, date handling, XSS protection, input limits, RLS, email sending, and the public share link viewer.

## Permanent rules

**VAT is always configurable — never hardcode it.**
If any task tries to lock VAT to a fixed percentage, STOP and flag it in CAPITALS before doing anything.

**UK-first defaults:** GBP, £, en-GB locale, 20% VAT default (configurable).

**No automatic estimate→invoice conversion.** The tradesperson always triggers it manually.

**Never commit API keys, tokens, or secrets to `index.html` or any browser file.** All secrets live in Supabase Edge Function environment variables only.

## After every code change
Update these vault files before the session ends:
- `CHANGELOG.md` — version bump + what changed
- `BUGS.md` — mark fixed, add new bugs found
- `HANDOFF.md` — current version + next session focus
- `PROJECT_CONTEXT.md` — version number

## Key helpers (do not reinvent)
- `esc(value)` — XSS-safe HTML escaping. Use on every `innerHTML` write with user data.
- `cleanInputValue(id, kind)` — sanitise + enforce length limits. Kinds: `short`, `name`, `email`, `phone`, `postcode`, `unit`, `address`, `description`, `notes`.
- `INPUT_LIMITS` — all max lengths. Add new kinds here, never hardcode lengths.
- `validateEmail(email)` — structural + typo domain check. Returns error string or null.
- `gbToISO(dateStr)` — converts `dd/mm/yyyy` → `yyyy-mm-dd` for Supabase.
- `money(n)` / `moneyCompact(n)` — always use for currency display, never format manually.
