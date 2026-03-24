# Team/Mission Legacy Path Audit (`config/missions`)

## 기준일
- 2026-03-14 (KST)

## 결과 요약
- 라우팅 프로젝트 운영 경로에서 `config/missions` **쓰기 제거 완료**
- 현재 `config/missions`는 **읽기 폴백 + 레거시 정규화 전용 쓰기**만 남아 있음

## 발견 경로
| 파일 | 경로 유형 | 목적 | 상태 |
|---|---|---|---|
| `public/js/admin.js` | write | 레거시(비라우팅) 스키마 정규화 | 유지(의도된 예외) |
| `public/js/mission_module.js` | read | 팀 미션 폴백 구독 | 유지(폴백) |
| `public/photo_upload.html` | read | 업로드 페이지 미션 설정 폴백 | 유지(폴백) |
| `functions/index.js` | read | 모바일 승인 API 미션 설정 폴백 | 유지(폴백) |

## 운영 정책
- 라우팅 프로젝트:
  - 저장: `routing + teamOverrides`
  - `config/missions`: 읽기 폴백만 허용
- 비라우팅 레거시 프로젝트:
  - `config/missions` 정규화 허용

## 제거 게이트 (완전 제거 전 조건)
1. 라우팅 프로젝트 2회차 운영에서 폴백 미사용 확인
2. 업로드/모바일승인/HQ에서 resolver 결과 100% 일치
3. 레거시 프로젝트 마이그레이션 완료

위 3개 조건 충족 후 `config/missions` 읽기 폴백 제거 가능.
