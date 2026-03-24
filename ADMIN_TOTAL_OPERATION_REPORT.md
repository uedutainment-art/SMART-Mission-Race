# SMART Mission Race 관리자 총괄 운영 리포트

## 목적
관리자가 프로젝트 생성부터 팀 운영, 사진 승인, 채팅 대응, 종료 정리까지 한 흐름으로 운영할 수 있도록 현재 구조와 보완점을 정리한다.

## 현재 운영 허브
- Admin: 프로젝트/팀배치/미션/운영 준비도
- HQ: 팀 상태/사진 대기/채팅/다운로드 허브
- Review: 사진 검수 전용
- Photo Approve: 현장 모바일 승인 전용

## 이번 개선 반영
1. 운영 시작 게이트
- Admin 운영 탭에서 `운영 시작 게이트`를 확인한다.
- 치명 항목이 남아 있으면 프로젝트 상태를 `진행중`으로 저장할 수 없다.

2. 운영 콘솔 홈
- Admin 운영 탭 상단에서 팀 입장, HQ, 사진 검수, 모바일 승인, 종료 패키지로 바로 이동한다.

3. 배포 전 스모크 테스트
- `./scripts/admin_smoke_check.sh`
- Hosting 주요 화면과 모바일 승인 API를 빠르게 점검한다.

4. 종료 패키지
- Admin: 결과 CSV + 운영 로그 CSV 저장 후 HQ로 이동
- HQ: 전체 사진 CSV, 슬라이드 CSV, 전체 다운로드 스크립트 생성

5. Drive 백업 상태
- HQ 오른쪽 패널에서 최근 성공/실패 상태를 확인한다.

6. Drive 시크릿 전환
- Functions는 이제 `DRIVE_SERVICE_ACCOUNT_JSON`, `DRIVE_SERVICE_ACCOUNT_JSON_BASE64`, `DRIVE_FOLDER_ID` 환경변수를 지원한다.
- `functions/service-account.json` 없이도 운영 가능하다.

7. 사진 미션 템플릿
- Admin 공통 미션 라이브러리에서 자주 쓰는 템플릿을 전체/빈 칸에 적용할 수 있다.

8. 슬라이드 제작용 CSV
- HQ의 `슬라이드 CSV`는 슬롯 번호 중심으로 정렬된 후처리용 목록이다.

## 추천 운영 순서
1. Admin에서 프로젝트 생성/저장
2. 팀배치표 정리 후 `저장+적용`
3. 공통 미션 라이브러리에서 사진 템플릿 적용
4. 운영 탭에서 `운영 시작 게이트` 통과 확인
5. `./scripts/admin_smoke_check.sh` 실행
6. 행사 중 HQ/Review/모바일 승인 운영
7. 종료 시 Admin `종료 패키지` + HQ `종료 패키지`
8. 필요하면 Drive 백업 상태와 다운로드 스크립트로 원본 정리
