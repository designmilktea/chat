# React migration and UX parity

Baseline: `31894212ada11878c06ebf849a6014f58f0d147c`.

## Scope

React owns the main application DOM using typed JSX components. Vite builds source
from `src/` into ignored `dist/`. GitHub Pages remains at `/chat/`. Firebase Auth,
Firestore project, UID paths, document encoding, schema version 1, localStorage keys,
revision checks, conflict behavior and JSON backups remain compatible.

`src/core/runtime.js` is an explicitly transitional controller: existing mutations,
validation, event delegation and sync coordination are encapsulated in one runtime,
not rewritten. React receives a typed snapshot and view helpers. Native dialogs and
notifications remain an imperative adapter outside the React root. This avoids two
writers for the same DOM. It is not a completed domain/service decomposition.

`start`/`dispose` own listeners, Auth subscription and AI tool lifecycle. React does
not initialize Firebase in a render/effect. Infrastructure retains the existing
pinned Firebase SDK imports. UI and AI tools still share the existing mutations.

## UX acceptance matrix

| Area | Preserved contract | Verification |
|---|---|---|
| Login | Google-only, login dialog, persistent account, load before private view | Synthetic browser flow + existing mock SDK tests; real Safari OAuth release check pending |
| Desktop navigation | Rail / chat list / conversation in three columns | Browser geometry check |
| Mobile | List -> open chat -> back to list | Browser test at 390px; real soft keyboard check pending |
| Search | Global keyword includes thoughts/hypotheses; category + chat creation month; in-chat search | VM runtime tests + browser filters |
| Reality records | Other/me choice, composer, Ctrl/Cmd+Enter, inline insertion | Runtime logic tests + browser composer |
| Thoughts | Add at selected message, inline editor, always right aligned with parent semantics | Runtime + browser create/edit and geometry |
| Hypotheses | Attached to a thought, modal add, inline edit | Runtime + browser create/delete/restore |
| Edit | Click content to edit in place, save/cancel | Runtime + browser thought edit |
| Batch | Chat category/delete; message role/delete; composer disabled during message batch | Runtime + browser role/category selection |
| Categories | Name/color, replacement destination on deletion, preserve user colors | Runtime tests |
| Delete | Centered native dialog, impact preview, cancel focused, no deletion on open/cancel | Runtime + browser cancellation/confirmation |
| Restore | 30-day recycle bin, restore parent relationships | Runtime + browser restore |
| Drafts | Sync status updates preserve text, cursor and stable input elements | Browser held transaction + typing; actual keyboard QA pending |
| Storage safety | Corrupt bytes preserved, quota rollback, stale tab conflict, UID isolation | Migrated runtime VM suites |
| Cloud | Dirty local cache retained, revision conflict pauses, stale-account load/save ignored | Runtime + SDK mock suites |
| AI | Default off, selected chats, write opt-in, revoke old handles | Migrated runtime security suite |
| Accessibility | Labels, native forms/dialog, live status, skip link, focus-visible, reduced motion | Existing markup + manual keyboard/screen-reader release checks pending |

## Validation commands

- `npm ci`
- `npm run check`
- `npm test` (migrated runtime, React server-rendered view, codec and SDK mocks)
- `npm run build`
- `npm run preview -- --host 127.0.0.1`
- `BASE_URL=http://127.0.0.1:4173/chat/ npm run test:browser`

Browser tests refuse production URLs and intercept SDK modules with synthetic local
REST fixtures. They are not real Google OAuth, deployed Firestore Rules, actual
Firebase end-to-end tests, or proof of soft-keyboard behavior. CI saves screenshots.
`npm run test:auth` remains the optional real SDK Auth-persistence fixture.

## Release / rollback gates

No automatic PR deployment to production. Merge remains a separate release action.
Before release: pass CI; inspect desktop/mobile/dialog screenshots; verify Safari
Google popup and account switch on test accounts; confirm installed Firestore Rules;
verify old cache/backups and cross-tab dirty revision conflict; inspect keyboard,
focus and scroll behavior. Confirm original and React clients can read each other's
writes before claiming safe rollback. Keep the baseline commit available; no data
migration is part of this PR. Do not clear localStorage on release/rollback.

Known inherited limits: >450 document changes in one sync are rejected; logout
retains UID local cache; Firestore JSON body domain checks remain client-side;
AI writes use session-level permission, without per-record approval/provenance.
