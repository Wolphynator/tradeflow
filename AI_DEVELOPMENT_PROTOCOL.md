# TradeFlow Pro — AI Development Protocol

This is the repository execution companion to the approved Obsidian master:
`Obsidian Vault/Projects/Invoice Maker/AI_DEVELOPMENT_PRINCIPLES.md`.

Every AI assistant working on TradeFlow Pro must read `PROJECT_CONTEXT.md`, then the master AI principles, then this protocol before coding. This file preserves operational rules for coordination, file ownership, Git workflow, security gates, and completion checks. It must not become a competing master rulebook.

## 1. General AI rules

- Read this protocol before coding.
- Understand the task before changing files.
- Do not guess unclear requirements.
- Ask the user when a requirement is risky, ambiguous, or could materially affect the product.
- Keep changes simple, clean, and production-ready.
- Preserve existing functionality and check for regressions.
- Put security before convenience.
- Do not refactor unrelated code or expand the task without approval.

## 2. AI role separation

These are the preferred roles when multiple assistants are available. If only one assistant is available, it may handle the required work but must still follow this protocol and the project's specialist rules.

### Claude VS Code

- UI
- CSS
- Components
- Animations
- Splash screen
- UX polish
- Visual bugs

### Claude CLI / Codex

- Bug fixes
- Supabase
- Database logic
- Invoice and estimate rules
- Authentication
- Security
- Refactoring
- Tests
- Build issues
- Performance

## 3. Conflict prevention

Before editing code, every AI assistant must state:

- A summary of the task
- The files expected to be modified
- Possible risks
- Whether the work overlaps another active task

Never allow two AI assistants to edit the same files or the same feature at the same time. Check the current worktree and known active tasks before editing. If overlap exists or cannot be ruled out, pause and coordinate ownership before making changes.

## 4. Feature ownership

Each feature must have only one active AI owner. No other AI assistant may modify that feature until the work is completed or ownership is explicitly handed over.

Features include, but are not limited to:

- Splash Screen
- Authentication
- Invoice System
- Estimate System
- Scheduling
- Payments
- Dashboard
- Notifications

Before starting work, identify the feature being changed and confirm that no other AI currently owns it. A handover must clearly state the feature, current status, files involved, completed work, and remaining work.

## 5. File locking

Before modifying any file, list every file intended for editing.

If another AI assistant is already working on any listed file, stop before making changes and notify the user. Do not edit around, merge over, or overwrite another AI assistant's active changes. File ownership remains locked until the task is completed or explicitly handed over.

## 6. Git workflow

- Use separate branches or worktrees for large features.
- Keep commits small and focused.
- Do not mix unrelated fixes.
- Complete one task before starting another.
- Keep the main branch stable and production-ready.
- Do not overwrite, discard, or reformat another contributor's unrelated work.

## 7. Root cause rule

Never patch symptoms when the underlying cause can reasonably be identified. Investigate the affected flow, determine the root cause, and fix it at the correct layer. If a root-cause fix is unsafe or outside the approved scope, explain the constraint and obtain direction before applying a temporary mitigation.

## 8. Minimal changes rule

Modify the smallest amount of code necessary to solve the task safely and completely. Avoid unrelated cleanup, broad rewrites, or unnecessary refactoring unless specifically requested.

## 9. Existing code first

Before writing new code:

- Search for an existing implementation.
- Reuse existing components and helpers.
- Extend the existing architecture instead of duplicating it.
- Confirm that a new dependency or abstraction is genuinely necessary before adding it.

## 10. Code quality

- Reuse existing components and helpers.
- Follow the existing architecture and established project patterns.
- Avoid duplicated code.
- Avoid unnecessary dependencies.
- Keep naming consistent.
- Keep files organised.
- Prefer maintainable code over quick hacks.
- Make the smallest change that completely and safely solves the task.

## 11. Security rules

Use extra care around:

- Authentication
- Permissions and row-level security
- Invoices
- Estimates
- Client signatures
- Payments
- Client data
- Public share links

Never weaken validation, remove security checks, expose secrets, or bypass access controls. Read `Obsidian Vault/Projects/Invoice Maker/SECURITY_FORM_RULES.md` before touching any form, input, public-facing field, or related data flow.

## 12. TradeFlow business rules

TradeFlow manages legally important business documents and sensitive customer information. Changes involving the following areas require extra care:

- Invoices
- Estimates
- Signatures
- Payments
- Public share links
- Authentication
- Client data

Preserve all established business rules, audit expectations, validation, access controls, and security protections. Do not change document meaning, financial calculations, signing behaviour, conversion rules, or customer-visible state without tracing the full data flow and verifying the intended business outcome.

## 13. Database rules

Never modify database schemas, migrations, database functions, or row-level security policies without explicitly stating before the change:

- Why the database change is required
- Its expected impact on existing data, users, application behaviour, and deployments
- A safe rollback strategy

Database changes also require explicit testing recommendations and must preserve tenant isolation, data integrity, and backward compatibility wherever reasonably possible.

## 14. Documentation-first feature gate

Obsidian is the master blueprint for TradeFlow Pro. Before implementing any major feature, read and follow `Obsidian Vault/Projects/Invoice Maker/FEATURE_DESIGN_STANDARD.md`.

Major features include payments, multi-user/workspaces, inventory, AI, scheduling, authentication, invoice or estimate lifecycle changes, signatures, public links, notifications, reporting, integrations, subscriptions, and major data migrations.

Every major feature document must include:

1. Business purpose
2. User workflow
3. Database changes
4. Security considerations
5. Future scalability
6. Migration strategy
7. Risks
8. Future enhancements
9. Implementation phases
10. Approval status

Do not implement, scaffold, migrate, or add preparatory production code until:

- All ten sections are complete.
- The canonical feature document explicitly states `Approved for implementation: Yes`.
- The Project Owner has approved the documented version and scope.
- The requested work matches that approved scope.

If the document is Draft, In Review, incomplete, missing, or materially out of date, stop and ask the Project Owner. Approval of a general direction or design discussion is not approval to implement.

## 15. Before coding checklist

Before making changes, provide:

- Task summary
- Files to edit
- Risks
- Expected result
- Active-task overlap assessment

Do not begin editing until the task is understood and any material uncertainty or conflict is resolved.

## 16. After coding checklist

After making changes, provide:

- Summary of changes
- Exact files modified
- Why the solution was chosen
- Tests performed and further testing recommendations
- Possible side effects or remaining risks

Also complete all documentation and version updates required by `AGENTS.md`.

## 17. Completion checklist

Before considering any task complete, verify:

- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] No broken imports
- [ ] Existing functionality is preserved
- [ ] New functionality is tested
- [ ] A completion summary is provided

If an item does not apply or cannot be verified in the current environment, state that explicitly in the completion summary with the reason and the recommended follow-up. Never claim a check passed unless it was actually performed.

## 18. Long-term goal

TradeFlow Pro is intended to become a premium SaaS app for builders, cleaners, and tradespeople.

Every change should support:

- Scalability
- Maintainability
- Security
- Professional UX
- Production-quality code

Short-term delivery must not compromise the app's long-term reliability, security, or customer trust.
