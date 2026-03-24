# Team-Mission Integration Rehearsal Report

## Date
- 2026-03-14 (KST)

## Scope
- Routing/Override 통합 구조 기준
- 체크리스트: `OPERATIONS_CHECKLIST.md` Section 13

## A. Automated Verification (Completed)

| Check | Result | Evidence |
|---|---|---|
| Routing project write path excludes `config/missions` in core save/apply flow | PASS | `public/js/admin.js` route apply/save mission/save project 경로 확인 |
| Legacy path usage reduced to fallback/legacy normalization | PASS | `rg "config/missions"` 결과: `admin normalize(legacy only)` + read fallback only |
| Assignment report validation token standardization | PASS | `validation` CSV token: `DUP_PASSWORD`, `MISSING_KEY(...)`, `COUNT_MISMATCH` 등 |
| Assignment report compact UI (vertical teams, horizontal password/start/keys/last/validation) | PASS | 팀배치표 렌더링 컬럼 구조 확인 |
| Mobile approval function resolves mission config via `routing + teamOverrides + legacy fallback` | PASS | `functions/index.js` `resolveMissionConfigForTeam(...)` 경로 확인 |
| JS syntax integrity (touched files) | PASS | `node --check` 다중 파일 통과 |

## B. Runtime Rehearsal (Executed on Temporary Project)

| Step | Status | Pass Criteria |
|---|---|---|
| Team assignment table baseline + CSV export | PENDING (UI) | 브라우저 화면/CSV 수동 확인 필요 |
| Route apply DB verification | PENDING (UI) | Admin 화면 route apply 수동 확인 필요 |
| Per-team override save verification | PENDING (UI) | Admin 모달 저장 수동 확인 필요 |
| Participant mission flow (`code -> mission -> awaiting_hq`) | PENDING (UI) | 팀 단말 UI 수동 확인 필요 |
| HQ approve/retry path | PASS (API Path) | approve/retry 호출 성공 및 상태전이 확인 |
| Mobile API approve/retry parity | PASS | `mobilePhotoAction` 실호출로 슬롯/상태 처리 확인 |
| Legacy safety (non-routing project) | PASS (Code+Path) | 레거시 정규화 쓰기 경로 유지, 라우팅 운영 쓰기 차단 확인 |

### Executed Runtime Test Details
- Temporary project ID: `codex_routing_rehearsal_20260314075722` (cleaned up after test)
- API endpoint: `mobilePhotoAction`
- Approve request result: `{\"ok\":true,\"action\":\"approve\"}`
- Retry request result: `{\"ok\":true,\"action\":\"retry\"}`
- Approve state checks:
  - uploads status: `approved` for `Photo1/Photo2/S1`
  - mission transition: `missions[2].stage=done`, `missions[3].stage=code`
- Retry state checks:
  - upload status: `retry`
  - retry reason: `테스트 재도전 사유`
  - mission lock fields cleared: `stepStatus/unlockAt` removed(null-cleared)
- Limitation:
  - `ops_logs/{projectId}` read was `Permission denied` by DB rule, so log existence는 함수 성공응답 기준으로만 간접 확인

## C. Command Log (Automated)

```bash
node --check public/js/admin.js
node --check functions/index.js
node --check public/js/mission_module.js
node --check public/js/hq.js
node --check public/js/review.js
node --check public/js/photo_approve.js
rg -n "config/missions" public/js public/*.html functions
```

## D. Current Decision
- 현재 단계 판정: `통합 후 제거` 전략 유효
- 상태: 코드 통합/경로 통합은 완료 구간 진입, 운영 리허설만 남음

## E. Next Action
1. 샌드박스 프로젝트 1건으로 Section 13 수동 리허설 실행
2. 각 Step를 `PASS/FAIL`로 채운 후 본 문서 업데이트
3. FAIL 항목이 없으면 `config/missions` 폴백 제거 준비 단계로 이동

## F. Deployment Path Verification
- Host checks (both domains):
  - `https://smart-mission-race-57839.web.app`
  - `https://smart-mission-race-57839.firebaseapp.com`
- Rewrites/status:
  - `/api/mobile-photo-action` -> `405` (GET/HEAD 기준, 정상)
  - `/admin` -> `200`
  - `/hq` -> `200`
  - `/review` -> `200`
  - `/photo_approve` -> `200`
  - `/team_login` -> `200`
  - `/photo_upload` -> `200`
- API behavior checks:
  - `OPTIONS /api/mobile-photo-action` -> `204`, CORS 허용 헤더 확인
  - `POST /api/mobile-photo-action` with `{}` -> `{\"ok\":false,\"error\":\"missing-fields\"}` (함수 라우팅 정상)

## G. UI Rehearsal Tooling
- Added runbook:
  - `TEAM_MISSION_UI_REHEARSAL_RUNBOOK.md`
- Added DB snapshot tool:
  - `./scripts/rehearsal_db_snapshot.sh <project_id> <label>`
- Tool validation run:
  - Command: `./scripts/rehearsal_db_snapshot.sh 1111 baseline`
  - Output summary:
    - `routingEnabled: no`
    - `teamCount: 10`
    - `overrideTeamCount: 0`
    - `opsReadable: no` (DB rule 제한)

## H. Live Project Baseline Snapshots
- Created:
  - `rehearsal_artifacts/1111/20260314_080434_before_ui_manual/summary.json`
  - `rehearsal_artifacts/55555/20260314_080434_before_ui_manual/summary.json`
- Observed:
  - Both live projects are currently `routingEnabled: no` (legacy)
- Impact:
  - 기존 운영 프로젝트는 legacy라 라우팅 리허설에 제한

## I. Routing UI Rehearsal Project Prepared
- Created project:
  - `codex_ui_rehearsal_20260314`
- Baseline snapshot:
  - `rehearsal_artifacts/codex_ui_rehearsal_20260314/20260314_080542_before_ui_manual/summary.json`
- Baseline summary:
  - `routingEnabled: yes`
  - `teamCount: 10`
  - `overrideTeamCount: 1`
- Ready state:
  - UI Section 13 Step 1~4를 즉시 실행 가능
