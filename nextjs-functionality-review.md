# Next.js functionality review

Scope: App Router pages, API routes, and the client flows that call them. Excludes generated HTML quality, OpenAI prompts, and the Java deploy agent internals.

Source: `app/`, `components/`, and `lib/` used by those routes · 18 Aug 2026

The MVP paid loop is in place: chat → generate → preview → pay R19 → edit → deploy a `.co.za`, with site files in Firebase Storage and billing state in Firestore. What remains is product polish, not the POC bar.


| Metric          | Value                                 |
| --------------- | ------------------------------------- |
| Website files   | Firebase Storage `sites/{websiteId}/` |
| Billing / ITN   | Firestore `subscriptions/{websiteId}` |
| Generate / edit | Job id + client poll                  |
| Preview         | App-origin file server                |
| Monthly price   | R19                                   |


## Remaining product gaps


| Promise                       | What is still true                                                                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview                       | `/api/preview` reads Storage (with a local disk cache). It is still a public file server on the app origin. Anyone with the id can open it. |
| Deploy                        | Deploy is a modal. `/deploy` redirects to `/builder`. Localhost skips domain registration.                                                  |
| Contact form on the live site | Recipient comes from the stored site record, not the JSON `to` field. Live forms still POST to this Next.js origin forever.                 |
| Change domain                 | Checkout binds one `.co.za`. Deploy rejects any other domain. There is no change-domain or transfer flow.                                   |


## User journey — what still breaks


| Step             | Next.js surface                  | Works?  | Remaining failure                                                       |
| ---------------- | -------------------------------- | ------- | ----------------------------------------------------------------------- |
| 3. Chat intake   | `POST /api/chat`                 | Mostly  | Rate-limited and authenticated. Conversation is not stored server-side. |
| 4. Address       | `AddressModal` + `/api/places/*` | Mostly  | Places is ZA-only.                                                      |
| 5. Generate      | `POST /api/generate`             | Partial | Returns a job id and polls. Not streamed.                               |
| 6. Preview       | `GET /api/preview/[...path]`     | Partial | Public if you know the id. Not a separate origin or signed URL.         |
| 8. Edit / deploy | `POST /api/edit`, `/api/deploy`  | Partial | Edit is a job. Domain cannot be changed after subscribe.                |


## High — flows that still strand a paying user


| Issue                         | User-visible effect                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Domain is frozen at subscribe | Checkout binds one `.co.za`. Deploy rejects any other name. Cancel is on the dashboard; there is still no change-domain or transfer. |


## API inventory (remaining notes)


| Route                    | Auth                      | Remaining note                                                    |
| ------------------------ | ------------------------- | ----------------------------------------------------------------- |
| `/api/chat`              | Bearer / session          | Full history posted each turn. Not stored.                        |
| `/api/generate`          | Bearer / session          | Writes Firebase Storage via a polled job.                         |
| `/api/edit`              | Bearer / session + owner  | Polled job. Requires an active subscription.                      |
| `/api/preview/[...path]` | None                      | Hardened, still public for a known id.                            |
| `/api/payfast/notify`    | Signature                 | Writes Firestore via Admin. Replay and `FAILED` handled. No period-end handling. |
| `/api/deploy`            | Bearer / session + owner  | Skips registrar on localhost.                                     |
| `/api/contact`           | Origin + stored recipient | Live sites depend on this process forever.                        |
| `/api/places/*`          | Bearer / session          | ZA addresses only.                                                |


## What does work

Signed-in users land on `/dashboard` and can resume, cancel billing, and delete sites. Route handlers verify the Firebase ID token and bind sites to `uid` in Firestore. Generated website files are stored in Firebase Storage at `sites/{websiteId}/`. PayFast ITN writes `subscriptions/{websiteId}` with the Admin SDK, then copies the paid flag onto the site records. Checkout reuses a pending `paymentId`, fails closed if PayFast is missing, and does not reopen the paywall after a late ITN. Generate and edit return a job id the client polls. Contact mail uses the stored recipient. Sign-out clears the builder session. Landing copy matches the edit paywall.

`/deploy` redirecting to `/builder` is leftover routing. `FileExplorer` and `CodeViewer` are unused, not broken in production.

## Next.js platform mismatch

The App Router is still used as a shell: server pages render client islands immediately. There are no Server Actions, no RSC data loaders, and no `loading.tsx` / `error.tsx` / `not-found.tsx`.

## MVP

Bar for this POC: one signed-in user can chat → generate → preview → pay R19 → edit → deploy a `.co.za`, and still have the site and payment after a process restart. Everything else is a later product.


| Must fix                                                                                                         | Status |
| ---------------------------------------------------------------------------------------------------------------- | ------ |
| Put PayFast ITN / subscription state in Firestore (or equivalent), not `generated-sites/<id>/.subscription.json` | Done. Admin SDK writes `subscriptions/{websiteId}`. Disk is a cache only. |
| Make generate and edit finish on the host you actually run                                                       | Done. Job id + client poll. |
| Keep website files in Firebase Storage as the source of truth after generate                                     | Done. Do not regress to local disk. |


| Do not block the POC                                     | Why it can wait                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Separate preview origin / signed URLs                    | Knowing the id is enough for a closed demo. Same-origin iframe is a security debt, not a missing feature. |
| Streaming generate/edit                                  | Nice when jobs exist. Not required if the request actually completes.                                     |
| Change-domain / transfer                                 | One bound `.co.za` at checkout is acceptable for a first customer.                                        |
| PayFast period-end / recurring edge cases                | First-month COMPLETE is enough. Cancel on the dashboard already exists.                                   |
| Contact forms living on this origin                      | Correct for a POC: this app *is* the backend. Move later if you host many live sites.                     |
| `/deploy` leftover route, unused FileExplorer/CodeViewer | Dead UI, not a broken path.                                                                               |
| RSC, Server Actions, `loading.tsx` / `error.tsx`         | Platform polish. The client builder already runs the flow.                                                |


## Fix order if the goal is a real product

1. Serve preview from a separate origin or signed URLs.
2. Stream generate/edit, and add period-end handling for cancelled PayFast subscriptions.
3. Add change-domain / transfer.
