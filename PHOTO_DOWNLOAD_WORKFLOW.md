# Photo Download Workflow

## 목적
행사 중 업로드된 사진/동영상을 원본 그대로 내려받고,
슬라이드 영상 제작에 바로 사용할 수 있는 구조로 정리한다.

## HQ 버튼 의미
- `전체 사진 CSV`
  - 프로젝트 전체 사진 목록표를 CSV로 저장한다.
  - 어떤 팀이 어떤 미션에서 어떤 슬롯 파일을 올렸는지 확인할 때 사용한다.
- `전체 다운로드 스크립트`
  - 프로젝트 전체 원본 파일을 `curl`로 일괄 다운로드하는 `.sh` 파일을 저장한다.
- `매니페스트 CSV`
  - 현재 팀/미션 또는 선택 슬롯 기준 CSV를 저장한다.
- `다운로드 스크립트`
  - 현재 팀/미션 또는 선택 슬롯 기준 `.sh` 파일을 저장한다.
- `선택 다운로드`
  - 현재 선택된 슬롯 파일만 바로 다운로드한다.
- `전체 다운로드`
  - 현재 팀/미션의 파일을 모두 바로 다운로드한다.

## 추천 운영 순서
1. 행사 중 검수는 `배치` 단위로 본다.
2. 승인/재도전 처리는 `선택 승인`, `선택 재도전`으로 한다.
3. 행사 종료 후 HQ에서 `전체 사진 CSV`를 먼저 저장한다.
4. 이어서 `전체 다운로드 스크립트`를 저장한다.
5. 노트북 터미널에서 스크립트를 실행해 원본을 정리 구조로 저장한다.

## 스크립트 실행 방법
예:
```bash
cd ~/Downloads
chmod +x smart-mission-race-57839_photo_download_all.sh
./smart-mission-race-57839_photo_download_all.sh
```

## 생성 폴더 구조
스크립트는 아래와 같은 구조로 파일을 저장한다.

```text
프로젝트명_photo_downloads/
  프로젝트명/
    팀명/
      M3_미션명/
        Photo1_전체셀카/
          Team03_3팀_M3_Photo1_전체셀카.jpg
        Photo2_점프샷/
          Team03_3팀_M3_Photo2_점프샷.jpg
```

## CSV 주요 컬럼
- `team_id`: 팀 ID
- `team_label`: 운영 화면에서 보이는 팀명
- `mission_id`: 미션 번호
- `route_key`: 공통 미션 키
- `slot_id`: 내부 슬롯 ID
- `slot_label`: 운영용 슬롯명
- `batch_id`: 한 번에 올라온 제출 묶음 ID
- `original_name`: 팀이 올린 원본 파일명
- `download_name`: 내려받을 때 사용할 정리용 파일명
- `storage_path`: Firebase Storage 경로
- `download_url`: 직접 다운로드 URL

## 실무 팁
- 슬라이드 제작 전에는 `slot_label` 기준으로 먼저 묶는다.
- 팀별 검수가 끝났더라도 `batch_id`를 보면 어떤 제출 묶음이었는지 다시 추적할 수 있다.
- 영상 제작용 셀카/점프샷/핵심가치는 `slot_label`로 정렬하는 것이 가장 빠르다.
