# Team-Mission UI Rehearsal Runbook

## 목적
- 남은 UI 리허설 4개 항목을 일관된 방식으로 검증
- 전/후 DB 스냅샷으로 PASS/FAIL 근거를 남김

## 준비
1. 리허설 대상 프로젝트 ID 확정
2. 터미널에서 스냅샷 도구 실행 가능 확인:
   - `./scripts/rehearsal_db_snapshot.sh <project_id> before_ui`

권장 리허설 프로젝트:
- `codex_ui_rehearsal_20260314` (routing enabled)
- 팀 비밀번호 샘플: `Team1=1001`, `Team2=1002` ... `Team10=1010`

## Step 1. 팀배치표 화면/CSV 확인
1. Admin > Team 탭 진입
2. 팀배치표 리포트 컬럼 확인:
   - `팀 비밀번호 -> START -> A/B/C... -> LAST -> 검증`
3. 내보내기:
   - `팀배치표 리포트 CSV`
   - `문제팀 CSV`
4. PASS 기준:
   - 경고 없음이면 `validation=ok`
   - 경고가 있으면 코드 토큰(`DUP_PASSWORD`, `MISSING_KEY(...)` 등) 표기

## Step 2. Route Apply 반영 확인
1. 배치표 수정 후 `배치표 적용` 실행
2. 적용 직후 스냅샷:
   - `./scripts/rehearsal_db_snapshot.sh <project_id> after_route_apply`
3. PASS 기준:
   - `projects/{id}/routing` 갱신
   - `projects/{id}/teamOverrides`가 null 또는 기대값
   - 라우팅 프로젝트에서 운영 중 `config/missions` 신규 쓰기 없음

## Step 3. 팀별 Override 저장/복원 확인
1. 미션 모달에서 한 팀의 한 미션만 변경 후 저장
2. 스냅샷:
   - `./scripts/rehearsal_db_snapshot.sh <project_id> after_override_save`
3. 다시 기본값으로 복원 후 저장
4. 스냅샷:
   - `./scripts/rehearsal_db_snapshot.sh <project_id> after_override_restore`
5. PASS 기준:
   - 변경 시 `teamOverrides/{teamId}`만 변화
   - 복원 시 해당 override 항목 삭제

## Step 4. 팀 단말 UI 동선 확인
1. Team Login -> 테스트 팀 로그인
2. 미션 진행:
   - `code -> mission -> awaiting_hq`
3. HQ/review에서 승인/재도전
4. PASS 기준:
   - 팀 화면 상태와 HQ 화면 상태 일치
   - 지연 설정 시 countdown 정상

## 결과 기록 템플릿
- Project ID:
- Step 1:
  - Result: PASS/FAIL
  - Evidence: CSV 파일명/스크린샷
- Step 2:
  - Result: PASS/FAIL
  - Evidence: `rehearsal_artifacts/<project_id>/.../summary.json`
- Step 3:
  - Result: PASS/FAIL
  - Evidence: before/after snapshot diff
- Step 4:
  - Result: PASS/FAIL
  - Evidence: UI 화면/채팅/상태 변화 기록
