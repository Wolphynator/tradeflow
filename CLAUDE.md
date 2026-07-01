# Tradesflowpro — Claude Session Bootstrap

| | |
|---|---|
| **Status** | Active |
| **Owner** | Project Owner |
| **Last Updated** | 2026-07-01 |
| **Purpose** | Session entry point. Points to authoritative governance documents. Does not duplicate them. |

---

## Read at session start

In this order, before any coding or file changes:

1. `Obsidian Vault/Projects/Invoice Maker/PROJECT_CONTEXT.md` — current architecture, stack, version
2. `Obsidian Vault/Projects/Invoice Maker/AI_DEVELOPMENT_PRINCIPLES.md` — master AI instruction document, authority hierarchy, all engineering rules
3. `Obsidian Vault/Projects/Invoice Maker/HANDOFF.md` — current version, deployment state, what is pending

---

## Read before specific work

| Situation | Read first |
|---|---|
| Any form, input, email, auth, public link, RLS, OTP | `SECURITY_FORM_RULES.md` |
| Any major feature (payments, AI, scheduling, etc.) | `FEATURE_DESIGN_STANDARD.md` |
| Any cross-product or platform architectural decision | `PLATFORM_VISION.md` |

---

## Non-negotiable rules

**Brand:** Always **Tradesflowpro**. Never TradeFlow, TradeFlow Pro, or any variation.

**VAT:** Always user-configurable. Never hardcode a percentage. If a task tries to lock VAT, stop and flag it.

**Secrets:** Never commit API keys, tokens, or secrets to `index.html` or any browser file. All secrets live in Supabase Edge Function environment variables only.

**Estimates:** The tradesperson always triggers estimate→invoice conversion manually. Never automate it.

**UK defaults:** GBP, £, en-GB locale, 20% VAT default.

---

## What this project is

Mobile invoicing PWA for UK tradespeople.
Single file: `index.html` (vanilla JS, no framework).
Stack: Supabase (auth + DB + Edge Functions), Cloudflare Pages, Resend (email).
GitHub → Cloudflare Pages auto-deploy to tradesflowpro.com.

---

## Key helpers — do not reinvent

- `esc(value)` — XSS-safe HTML escaping. Required on every `innerHTML` write with user data.
- `cleanInputValue(id, kind)` — sanitise + enforce length limits.
- `INPUT_LIMITS` — all max lengths. Never hardcode lengths elsewhere.
- `validateEmail(email)` — structural + typo domain check.
- `gbToISO(dateStr)` — converts `dd/mm/yyyy` → `yyyy-mm-dd` for Supabase.
- `money(n)` / `moneyShort(n)` — always use for currency display.

---

## After every code change

Before the session ends, update:

- `CHANGELOG.md` — version bump and what changed
- `BUGS.md` — mark fixed bugs, add newly found bugs
- `HANDOFF.md` — current version and next session focus
- `PROJECT_CONTEXT.md` — version number
