# Google Drive Setup

## 현재 상태
- Drive 자동 업로드 코드는 반영됨
- 실제 동작을 위해서는 `functions/service-account.json`이 필요함
- 업로드 대상 폴더 ID는 [functions/index.js](/Users/uedutainment2/Dev/SMART-Mission-Race/functions/index.js)에 있는 `FOLDER_ID`를 사용함

## 개인 드라이브도 가능한가
가능하다.
단, 아래 조건이 필요하다.

1. 개인 Google Drive 안에 전용 폴더를 만든다.
2. 그 폴더를 서비스 계정 이메일과 공유한다.
3. 권한은 `편집자`를 사용한다.
4. 그 폴더 ID를 `FOLDER_ID`에 넣는다.

공유 드라이브는 필수가 아니다.
다만 공유 드라이브가 운영상 더 안정적일 뿐이다.

## 서비스 계정 파일 준비
파일 위치:
- `functions/service-account.json`

이 파일은 git에 올리지 않는다.
이미 `.gitignore`에 제외되어 있다.

대안:
- `DRIVE_SERVICE_ACCOUNT_JSON`
- `DRIVE_SERVICE_ACCOUNT_JSON_BASE64`

둘 중 하나의 환경변수로도 넣을 수 있다.

## 서비스 계정 이메일 확인
아래 명령으로 확인:

```bash
./scripts/check_drive_service_account.sh
```

출력 예:

```bash
source=file
client_email=my-drive-bot@my-project.iam.gserviceaccount.com
project_id=my-project
private_key_id=abcd1234
```

## Drive 폴더 공유 방법
1. Google Drive에서 업로드 대상 폴더를 연다.
2. `공유`를 누른다.
3. 위 스크립트에서 확인한 `client_email`을 추가한다.
4. 권한을 `편집자`로 저장한다.

## 폴더 ID 확인
Drive 폴더 URL 예:

```text
https://drive.google.com/drive/folders/1ZESAq5xLGZVRiS0EA_f1AGkvjGLVyRjr
```

여기서 마지막 값이 폴더 ID다.

## 업로드 구조
자동 업로드가 성공하면 Drive 안에 아래처럼 폴더가 만들어진다.

```text
프로젝트명/
  3팀_팀명/
    M3_핵심가치/
      P01_전체셀카/
        T03_P01.jpg
```

## 업로드 성공 기록
Realtime Database:
- `drive_backups/{projectId}/{teamId}/mission_{n}/{slotId}`

실패 기록:
- `drive_backups_errors`

## 배포
준비가 끝나면 functions 재배포:

```bash
firebase deploy --only functions --project smart-mission-race-57839
```

## 현재 상태
- Functions 배포는 완료됨
- 남은 실제 조건은 `functions/service-account.json` 준비와 Drive 폴더 공유
- 키 파일이 없으면 런타임에서 `backupToDrive`가 업로드를 건너뛴다

## 테스트 순서
```bash
./scripts/drive_backup_test_steps.sh
```

## 로그 확인
업로드 테스트 후:

```bash
./scripts/watch_drive_backup_logs.sh smart-mission-race-57839 80
```
