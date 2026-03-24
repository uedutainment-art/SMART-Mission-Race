# Team-Mission 통합 실행 계획 (Compact Admin 기준)

## 0) 목표
- 팀/미션 운영 기능의 중복 구현을 제거하고, `팀배치표 중심`의 단일 운영 흐름으로 통합한다.
- 관리자 화면에서 세로=팀, 가로=`팀 비밀번호 -> START -> 중간 키(A/B/C...) -> LAST -> 검증`을 한 화면에서 처리한다.
- 기존 프로젝트(레거시 데이터)와의 호환성을 유지하면서 단계적으로 전환한다.

## 1) 현재 문제 정의
- 동일 역할 함수가 프론트/백엔드/화면별로 중복되어 변경 시 불일치 리스크가 큼.
- 팀별 미션 직접 편집과 배치표 기반 생성이 혼재되어 운영 기준이 불명확함.
- 팀 운영 핵심 정보(팀 비번, 배치 경로, 검증 결과)가 분산되어 한눈에 파악이 어려움.

## 2) 통합 원칙
- 단일 기준 데이터:
  - 팀: `teamId, number, password, alias`
  - 배치: `routing.missionKeys + routing.routes`
  - 공통 라이브러리: `routing.codeLibrary + routing.missionLibrary`
  - 예외: `teamOverrides`만 허용 (기본은 공통값 상속)
- 단일 검증 엔진:
  - 중복 비번, 빈 칸, 정의 안 된 키, 중복 키, 누락 키, 타임 불일치
  - 저장 전/적용 전/내보내기 전 동일 검증 수행
- 제거 순서:
  - `통합 구현 -> 이중 운영 검증 -> 구 기능 제거`

## 3) 목표 아키텍처
### 3.1 Data Layer
- `project.meta`: 운영 메타
- `project.teams[].profile`: 팀 기본 정보
- `project.routing`: 공통 코드/미션/배치표
- `project.teamOverrides`: 예외값만 저장 (없으면 공통값 사용)
- `project.teams[].missions`: 런타임 진행 상태만 유지

### 3.2 Rule Layer
- 프론트:
  - `public/js/mission_rules.js`
  - `public/js/mission_state.js`
  - `public/js/photo_slots.js`
- 백엔드:
  - `functions/mission_schema.js`
- 규칙 동기화 전략:
  - 입력/정규화/슬롯계산/지연시간 규칙을 양쪽에서 같은 경계값으로 유지

### 3.3 Admin UI Layer (Compact)
- 단일 핵심 화면(팀 탭):
  - 팀 비밀번호 편집
  - 팀 배치표 편집
  - 팀배치표 리포트(검증 포함)
  - 배치표 적용/내보내기
- 미션 탭:
  - 예외 편집 전용(기본은 공통값)

## 4) 단계별 실행 계획
## Phase 1. 모델 고정 및 호환 기초
- [ ] `routing`을 단일 기준으로 선언 (문서/코드 주석 정리)
- [ ] 레거시 프로젝트 로드시 `infer -> warn -> 확정 저장` 흐름 고정
- [ ] CSV 포맷 공식화:
  - 표준: `team_password + START~LAST + validation`
  - 레거시(`1타임`) import 호환 유지
- 완료 기준:
  - 신규/기존 프로젝트 모두 route import/export round-trip 성공

## Phase 2. 규칙 공통화 완성
- [ ] 프론트 슬롯/상태/정규화 규칙 점검 및 중복 제거 100%
- [ ] 백엔드 `mission_schema`를 유일 진입점으로 고정
- [ ] 승인/재도전/자동이동 시 동일 규칙 적용 확인
- 완료 기준:
  - 같은 입력 데이터에 대해 프론트/백엔드 결과가 일치

## Phase 3. Compact Admin 확정
- [ ] 팀배치표 리포트에 검증 컬럼 고도화(경고 타입별 가독성 강화)
- [ ] 리포트 CSV + 문제팀 CSV(경고 팀만) 분리 제공
- [ ] 배치표 셀 선택 시 우측(또는 하단) 상세 패널에서 즉시 수정
- 완료 기준:
  - 운영자 핵심 작업 5개를 팀 탭 단일 화면에서 처리 가능

## Phase 4. Override 정책 확정
- [ ] `teamOverrides` 저장 구조 도입
- [ ] 팀별 미션 직접 저장은 override만 저장하도록 변경
- [ ] "공통값 복원" 시 override 삭제 방식으로 표준화
- 완료 기준:
  - 팀별 미션 전체 복제 저장이 사라지고 예외만 저장됨

## Phase 5. 제거 및 정리
- [ ] 미사용 함수/레거시 분기 제거
- [ ] 액션 로그 라벨 표준화
- [ ] 운영 문서/체크리스트 갱신
- 완료 기준:
  - 팀/미션 설정 경로가 단일 흐름으로 정리됨

## 5) 파일 단위 작업 목록
### 프론트엔드
- `public/js/admin.js`
  - 팀배치표 중심 UI/검증/내보내기 엔진의 단일화
  - override 저장 분기 추가
- `public/admin.html`
  - 팀배치표 리포트/검증/내보내기 UI 확정
- `public/css/admin.css`
  - 컴팩트 테이블/경고 배지 가독성 개선
- `public/js/mission_rules.js`
  - normalize/step rule 변경 시 기준 파일로만 수정
- `public/js/mission_state.js`
  - 진행상태 기본값의 유일 함수 유지
- `public/js/photo_slots.js`
  - 슬롯 계산 유일 함수 유지
- `public/js/hq.js`, `public/js/review.js`, `public/js/photo_approve.js`, `public/js/mission_module.js`
  - 공통 모듈만 호출하도록 유지(로컬 중복 금지)

### 백엔드
- `functions/mission_schema.js`
  - normalize/slot/delay 규칙 유일 소스
- `functions/index.js`
  - route/mission 관련 로직의 직접 계산 제거

## 6) 검증 계획 (체크리스트)
- [ ] 문법 검사: `node --check` 대상 파일 전체
- [ ] 팀배치표 CSV:
  - [ ] 표준 CSV export -> import -> export diff 없음
  - [ ] 레거시 CSV import 성공
- [ ] 팀 비밀번호:
  - [ ] 중복 비번 경고 탐지
  - [ ] 변경 즉시 리포트 반영
- [ ] 배치표:
  - [ ] 정의 안 된 키, 중복/누락 키 탐지
  - [ ] START/LAST 고정 유지
- [ ] 운영:
  - [ ] 사진 승인/재도전/지연 이동 정상 동작
  - [ ] ops log와 UI 라벨 일치

## 7) 롤아웃/롤백
### 롤아웃
- Step 1: 개발 브랜치에서 Phase 1~2
- Step 2: 샌드박스 프로젝트 2개 리허설
- Step 3: 운영 전일 Phase 3 반영
- Step 4: 운영 종료 후 Phase 4~5 반영

### 롤백 조건
- 표준 CSV round-trip 실패
- 승인/재도전 흐름 불일치
- 팀 비밀번호 매칭 이상

### 롤백 방법
- UI 변경만 있을 때: `admin.js/html/css`만 이전 커밋 복원
- 규칙 변경 포함일 때: `mission_schema`/`mission_rules` 동시 복원

## 8) 산출물
- 통합 설계 문서(본 파일)
- 팀배치표 리포트 CSV (전체)
- 문제팀 리포트 CSV (향후 추가)
- 운영 체크리스트 업데이트

## 9) 의사결정 기록
- 기본 전략: `통합 후 제거`
- 이유:
  - 운영 중단 리스크 최소화
  - 레거시 프로젝트 호환성 확보
  - 단계별 검증/롤백 용이

## 10) 진행 현황 (2026-03-14)
- 완료:
  - [x] 팀배치표 리포트(세로 팀, 가로 팀비번/START/키/LAST) UI 추가
  - [x] 팀배치표 리포트 CSV(전체 팀) 내보내기 추가
  - [x] 문제팀 CSV(경고 팀만) 내보내기 추가
  - [x] 프론트 공통 모듈화: `mission_state`, `photo_slots`
  - [x] 백엔드 공통 모듈화: `functions/mission_schema`
  - [x] 백엔드 승인 API(`mobilePhotoAction`)를 `routing + teamOverrides + legacy fallback` 해석으로 전환
  - [x] 레거시 `1타임` CSV import 호환 유지
- 진행 필요(우선순위):
  - [x] `teamOverrides` 저장 구조 도입 (저장/배치표 적용 시 반영)
  - [x] 미션 직접 편집 저장 경로를 override 방식으로 전환 (라우팅 프로젝트에서 `config/missions` 쓰기 차단)
  - [x] 배치표 적용/프로젝트 저장 시 레거시 `config/missions` 쓰기 제거 (읽기 폴백만 유지)
  - [x] 문제팀 CSV와 팀배치표 리포트의 경고 타입별 시각 표준화
  - [ ] E2E 운영 시나리오 리허설 체크(로그인->배치표->적용->승인->결과) - API 실리허설 + UI 런북/스냅샷 툴 + 라우팅 리허설 프로젝트 준비 완료, UI 동선 실행 대기
