# MWT DAM (DAMMWT)

Digital Asset Management MVP for Media Wave Technology — **Gallery V1** (love / keep / reject + notes) on Electron + SQLite IPC.

**Repo:** https://github.com/13DJTEQ/DAMMWT

## Clone & run

```bash
git clone https://github.com/13DJTEQ/DAMMWT.git
cd DAMMWT
npm ci
npx @electron/rebuild   # if better-sqlite3 ABI fails under Electron
npm run verify
npm start               # build + Electron → Gallery UI
```

## Gallery V1

| Layer | Contents |
|-------|----------|
| Decisions | ❤️ Love · 👍 Keep · 👎 Reject (+ notes); Request Changes secondary for resubmit |
| Persistence | SQLite `ReviewQueue` / `ApprovalHistory` via Electron IPC (no Hermes HTTP) |
| UI | Preview-first gallery queue + decision card + Love/Keep/Reject stats |
| Keys | `1` love · `2` keep · `3` reject · `n` notes |

Week 1 formal Approve naming mapped to **keep**; **love** is a distinct strong-positive for generation steering.

## Verify

`npm run verify` runs Days 1/2/5/6 + Gallery V1 coverage. Optional: `npm run verify:day34`, `npm run verify:gallery`.

## Spec / docs

- Project Gallery plan: see Project store `docs/v1-gallery-plan.md` (or legacy `v0.5-gallery-plan.md` until renamed)
- Day 1 notes: [docs/DAY1-README.md](docs/DAY1-README.md)

## CI

On every PR and push to `main`, **CI (Node)** runs typecheck / build / verify. **Commitlint** requires lowercase conventional subjects.
