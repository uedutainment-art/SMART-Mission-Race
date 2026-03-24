# SMART Mission Race Operations Checklist

## 1. Event Preparation

- Open the admin page and select or create the target project.
- Confirm `project status` is set correctly.
  - Use `planned` before the event opens.
  - Use `running` when the event starts.
  - Use `finished` when the event ends.
- Confirm `start/end datetime` are set to the real operating time.
- Confirm `team count`, `mission count`, and logo are set.
- Open each team's mission modal and verify:
  - code step mode (`answer`, `qr`, `hq`)
  - mission step mode (`answer`, `qr`, `hq`, `photo_hq`)
  - code answer / QR value
  - mission answer / QR value
  - auto advance seconds for each step if used
  - bypass allowed on each step if used
  - code image
  - mission image
  - photo slots and special slots if photo missions are used
- Confirm `special bypass code` is set only if rehearsal or final inspection requires it.
- Check the validation checklist on the admin page.
  - No duplicate team passwords
  - No empty project name
  - Start/end time valid
  - Logo set if required
- Export a test CSV once to verify local download works.

## 2. Before Participants Enter

- Confirm the project appears in the list with the correct status and time range.
- Confirm the login flow is blocked before the configured start time.
- Confirm a recent-session resume does not reopen an expired project.
- If using photo missions:
  - verify HQ page opens for the correct project
  - verify review page opens for the correct project
  - verify mobile photo approval page opens for the correct project
  - verify photo upload page can open from QR/link
  - verify at least one test upload can be reviewed in HQ
- If using HQ approval steps:
  - verify one `HQ approval` mission can be approved without photo upload
- If using auto advance:
  - verify the participant dashboard shows the remaining seconds correctly

## 3. Final 5-Minute Check

- Confirm the project status is `running` only when the event should actually open.
- Open the team login page in a fresh window and test one team password.
- If photo missions are used, copy an example upload link and confirm the upload page opens correctly.
- Open HQ and confirm:
  - the correct project title is shown
  - team cards load
  - photo pending and chat indicators are visible if expected
- Open the review page and confirm:
  - team queue loads
  - thumbnails load
  - approve and retry both work
- Open the mobile photo approval page and confirm:
  - password lock works if configured
  - approve and retry both work
- Run one test export for:
  - `results CSV`
  - `ops log CSV`

## 4. During Event

- Keep both admin and HQ pages open.
- Use the admin summary cards to monitor:
  - total teams
  - started teams
  - finished teams
  - photo pending teams
  - average progress
- Use HQ filters to focus on:
  - active teams
  - photo pending teams
  - chat unread teams
  - finished teams
- If a team must restart:
  - use HQ team reset
  - note that mission state, team uploads, and team chat are cleared
- If a project setting must change mid-event:
  - save only after reviewing warnings
  - be careful when reducing team count
  - avoid changing master password during live operation unless necessary

## 5. Photo Mission Operation

- Participants must upload photos from the upload page.
- HQ must approve or request retry.
- A participant cannot self-complete a photo mission.
- A photo mission with `auto advance seconds` should show a countdown after HQ approval.
- Before approving:
  - confirm all required slots are uploaded
  - inspect images/videos in the modal
- When requesting retry:
  - write a clear reason
  - confirm the selected slots are correct
  - confirm the mission returns from `awaiting_hq` or `delay` to normal upload state

## 6. HQ Approval Mission Operation

- `HQ approval` mode can be used on code or mission steps without photo upload.
- The HQ priority queue should show pending approval teams.
- After approval:
  - immediate move if delay is `0`
  - countdown state if delay is greater than `0`
- Confirm the participant dashboard reflects `HQ approval waiting` and `auto advance` correctly.

## 7. Closing the Event

- Export `results CSV`.
- Export `ops log CSV`.
- If the event is over, click `project finish`.
- Confirm the project status is `finished`.
- Confirm participants can no longer re-enter as new logins.

## 8. After Event

- Keep exported CSV files with the event date.
- Do not immediately delete the project unless retention is not needed.
- If reusing the setup:
  - use `project clone`
  - verify the cloned project has:
    - new master password
    - status reset to `planned`
    - empty runtime progress
    - empty countdown

## 9. High-Risk Actions

- Reducing `team count` can remove team data.
- Changing `master password` does not change the fixed project ID anymore, but live participants may be affected if they try to re-enter with the old password.
- `reset results` clears missions, uploads, and chat for the project.
- `delete project` is destructive and not recoverable from the UI.
- `finish project` prevents new participant entry.
- `special bypass code` should be disabled or rotated after final rehearsal.

## 10. Quick Recovery Checks

- If admin save fails:
  - verify network access
  - retry once after refresh
- If HQ data looks stale:
  - refresh the HQ page
  - confirm the correct project ID is open
- If a participant cannot upload:
  - confirm the upload URL has project/team/mission
  - confirm the mission has photo slots configured
  - confirm the mission is already in the photo-upload stage, not `code` or `locked`
- If rankings look wrong:
  - confirm mission state exists under each team
  - confirm finished missions are marked as `done`
- If a team does not move after approval:
  - confirm `unlockAt` is populated when delay is configured
  - confirm the mission is not stuck in `awaiting_hq`

## 11. Deployment Checks

- Confirm hosting rewrites work for:
  - `/api/mobile-photo-action`
  - `/admin`
  - `/hq`
  - `/review`
  - `/photo_approve`
  - `/dashboard`
  - `/team_login`
  - `/photo_upload`
- Deploy hosting and functions together when mobile approval is enabled.
- Confirm the `mobilePhotoAction` function is deployed and reachable from the hosted site.
- Confirm the browser can load Firebase scripts from `gstatic`.
- Local static preview can verify layout, but it does not fully validate the hosted mobile-approval function path.
- If Google Drive backup is required:
  - confirm `functions/service-account.json` exists or replace it with a secret-based approach
  - confirm the Drive folder ID is correct
  - confirm the backup function is deployed in the intended region

## 12. Audit Trail

- Important admin and HQ actions are recorded under `ops_logs/{projectId}`.
- Export the ops log CSV after every event.
- Use the ops log CSV together with the results CSV for incident review.
- Confirm these actions appear when used:
  - `mission_bypass`
  - `hq_step_approve`
  - `hq_photo_approve`
  - `hq_photo_retry`

## 13. Team-Mission Integration Rehearsal (Routing/Override)

- Scope:
  - Use a project that has `routing` enabled.
  - Validate `teamOverrides` based flow end-to-end.
  - Confirm legacy `config/missions` is read-fallback only.

- Step 1. Team assignment table baseline
  - Open Admin > Team tab and check the assignment report table.
  - Confirm layout is vertical team rows and horizontal columns:
    - `team password -> START -> A/B/C... -> LAST -> validation`
  - Export:
    - `team assignment report CSV`
    - `issues CSV`
  - Pass criteria:
    - `validation` is `ok` for all rehearsed teams.
    - If warnings exist, they are code-based in CSV (`DUP_PASSWORD`, `MISSING_KEY(...)`, etc.).

- Step 2. Apply routing and verify data paths
  - Click route apply.
  - Confirm DB paths:
    - `projects/{id}/routing` updated
    - `projects/{id}/teamOverrides` reset to `null`
  - Confirm no new write for routing projects at:
    - `projects/{id}/teams/{teamId}/config/missions`
  - Pass criteria:
    - Mission overview is generated from routing and visible immediately.

- Step 3. Per-team mission exception save
  - Open one team mission modal and modify one mission value (answer/image/slots/delay).
  - Save.
  - Confirm DB writes:
    - only `projects/{id}/teamOverrides/{teamId}` changes
    - no direct write to `teams/{teamId}/config/missions` for routing project
  - Pass criteria:
    - Reopen modal and confirm exception persists.
    - Revert to base value and confirm override entry is removed for that mission.

- Step 4. Participant flow rehearsal
  - Team login with one test team password.
  - Complete one normal mission.
  - Complete one `photo_hq` mission until `awaiting_hq`.
  - Pass criteria:
    - Mission transitions are correct (`code -> mission -> awaiting_hq`).
    - Dashboard status updates without stale state.

- Step 5. HQ approve/retry rehearsal
  - In `review` or `photo_approve`, approve once and retry once.
  - Confirm DB mission state updates:
    - approve + delay: `stepStatus=delay`, `unlockAt` set
    - approve + no delay: mission `done`, next mission unlock
    - retry: upload status `retry`, mission `stepStatus/unlockAt` cleared
  - Confirm logs:
    - `hq_photo_approve`
    - `hq_photo_retry`
  - Pass criteria:
    - Team UI and HQ UI both reflect same state.

- Step 6. Mobile API path rehearsal
  - Approve and retry through mobile endpoint flow.
  - Confirm `mobilePhotoAction` resolves config from:
    - `routing + teamOverrides + legacy fallback`
  - Pass criteria:
    - Required slots and delay behavior match web HQ behavior.

- Step 7. Legacy safety check
  - For routing project:
    - no operational writes to `config/missions`.
  - For non-routing legacy project:
    - normalization still works for `config/missions`.
  - Pass criteria:
    - Both project types operate without regression.

- Final sign-off (all must pass):
  - Assignment report has zero blocking warnings.
  - Override-only writes are verified.
  - Approve/retry logs are complete.
  - Delay countdown and auto-advance behavior are correct.
