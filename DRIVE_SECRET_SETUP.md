# Google Drive 시크릿 운영 전환

## 권장 방식
1. `functions/service-account.json` 없이 운영
2. 서비스 계정 JSON을 base64로 인코딩
3. 배포 환경 변수에 저장
4. Drive 폴더 ID도 환경 변수로 분리

## 인코딩
```bash
./scripts/encode_drive_service_account.sh functions/service-account.json
```

## 사용할 환경 변수
- `DRIVE_SERVICE_ACCOUNT_JSON_BASE64`
- `DRIVE_FOLDER_ID`

## 현재 코드 우선순위
1. `DRIVE_SERVICE_ACCOUNT_JSON_BASE64`
2. `DRIVE_SERVICE_ACCOUNT_JSON`
3. `functions/service-account.json`

## 참고
- 폴더 자체는 개인 Drive여도 가능하다.
- 단, 대상 폴더를 서비스 계정 이메일과 `편집자`로 공유해야 한다.
