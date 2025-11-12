# NFC 테스트 환경 구성 가이드

## 🎯 목적
main 브랜치의 안정성을 유지하면서 NFC 기능을 안전하게 실험합니다.

---

## 📁 브랜치 구조

```
main (운영 환경)
├── Firebase: smart-mission-race-57839
└── 기존 코드 그대로 유지

nfc-test (실험 환경) ← 현재 여기
├── Firebase: smart-mission-race-nfc-test (별도 프로젝트)
└── NFC 기능 추가
```

---

## 🚀 1단계: Firebase 테스트 프로젝트 생성

### 1-1. Firebase Console 접속
```
https://console.firebase.google.com
```

### 1-2. 새 프로젝트 생성
1. **프로젝트 추가** 클릭
2. **프로젝트 이름**: `smart-mission-race-nfc-test`
3. Google Analytics: 선택 사항 (권장: 사용 안 함)
4. **프로젝트 만들기** 클릭

### 1-3. Realtime Database 설정
1. 좌측 메뉴 → **빌드** → **Realtime Database**
2. **데이터베이스 만들기** 클릭
3. 위치 선택: `asia-southeast1` (또는 가까운 리전)
4. 보안 규칙: **테스트 모드**로 시작
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   ⚠️ 테스트용이므로 임시로 열어둠 (나중에 보안 강화 필요)

### 1-4. Storage 설정
1. 좌측 메뉴 → **빌드** → **Storage**
2. **시작하기** 클릭
3. 보안 규칙: **테스트 모드**
4. 위치: Realtime Database와 동일

### 1-5. 웹 앱 추가
1. 프로젝트 개요 → **웹 앱 추가** (</> 아이콘)
2. 앱 닉네임: `NFC Test Web App`
3. **앱 등록** 클릭
4. **Firebase 구성 객체** 복사:
   ```javascript
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "...",
     databaseURL: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

---

## 🔧 2단계: 로컬 설정

### 2-1. Firebase 설정 업데이트
`public/js/firebase_config.nfc.js` 파일을 열어 복사한 설정값 붙여넣기:

```javascript
const firebaseConfig = {
  apiKey: "여기에_복사한_API_KEY",
  authDomain: "smart-mission-race-nfc-test.firebaseapp.com",
  databaseURL: "https://smart-mission-race-nfc-test-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-mission-race-nfc-test",
  storageBucket: "smart-mission-race-nfc-test.firebasestorage.app",
  messagingSenderId: "여기에_복사한_SENDER_ID",
  appId: "여기에_복사한_APP_ID"
};
```

### 2-2. Firebase CLI 프로젝트 전환
```bash
# 현재 nfc-test 브랜치에서 실행
firebase use --add

# 프로젝트 선택: smart-mission-race-nfc-test
# Alias 입력: nfc-test
```

---

## 📱 3단계: NFC 테스트 페이지 사용

### 3-1. 로컬 서버 실행
```bash
# Firebase 로컬 에뮬레이터
firebase serve

# 또는 간단한 HTTP 서버
python3 -m http.server 8000
```

### 3-2. 접속
```
http://localhost:5000/nfc_test.html
```

### 3-3. NFC 태그 준비
- **NFC 태그 구매**: Amazon, 다이소, 온라인 쇼핑몰
- **권장 사양**: NTAG215 또는 NTAG216
- **수량**: 테스트용 5~10개

### 3-4. 테스트 시나리오

#### ✅ 시나리오 1: NFC 쓰기
1. `nfc_test.html` 접속
2. **"✏️ NFC 태그에 쓰기"** 버튼 클릭
3. 팀 정보 입력:
   - 팀 ID: `Team1`
   - 팀 번호: `1`
   - 팀 이름: `테스트팀`
4. NFC 태그를 스마트폰 뒷면에 가까이 대기
5. "쓰기 성공!" 메시지 확인

#### ✅ 시나리오 2: NFC 읽기
1. **"📡 NFC 태그 스캔"** 버튼 클릭
2. 위에서 작성한 태그를 가까이 대기
3. 팀 정보가 화면에 표시되는지 확인
4. Firebase Console → Realtime Database → `nfc_test/scans`에 로그 저장 확인

#### ✅ 시나리오 3: Dashboard 연동 (다음 단계)
1. `dashboard.html`에 NFC 로그인 버튼 추가
2. NFC 태그 스캔 → 자동 로그인
3. 비밀번호 입력 없이 팀 대시보드 접속

---

## 🔄 4단계: NFC를 실제 Dashboard에 통합

### 4-1. NFC 로그인 모듈 생성
```bash
# 새 파일 생성
touch public/js/nfc_module.js
```

### 4-2. Dashboard에 NFC 버튼 추가
`public/team_login.html` 수정:
```html
<button id="nfcLoginBtn" class="nfc-login-btn">
  🔖 NFC 태그로 로그인
</button>
```

### 4-3. 로그인 로직 연동
```javascript
// team_login.html 또는 login.js에 추가
import { scanNFCForTeam } from './js/nfc_module.js';

document.getElementById('nfcLoginBtn')?.addEventListener('click', async () => {
  try {
    const teamData = await scanNFCForTeam();
    // 기존 로그인 흐름과 연결
    loginWithTeam(teamData.teamId, teamData.password);
  } catch (error) {
    alert('NFC 로그인 실패: ' + error.message);
  }
});
```

---

## 📊 5단계: Firebase Preview 배포

### 5-1. NFC 테스트 환경 배포
```bash
# nfc-test 프로젝트로 전환
firebase use nfc-test

# Preview 채널 배포 (실험용)
firebase hosting:channel:deploy nfc-preview

# 출력된 URL 복사 (예: https://...-nfc-preview-xxxxx.web.app)
```

### 5-2. 모바일 테스트
- 출력된 URL을 **Android Chrome**에서 열기
- iOS는 Web NFC 미지원 (앱 개발 필요)

---

## ⚠️ 중요 사항

### ✅ 해도 되는 것
- nfc-test 브랜치에서 자유롭게 코드 수정
- nfc-test Firebase 프로젝트에 데이터 저장
- 여러 번 배포 테스트

### ❌ 하면 안 되는 것
- main 브랜치에 NFC 코드 직접 추가
- 운영 Firebase (smart-mission-race-57839)에 테스트 데이터 저장
- NFC 검증 없이 main으로 병합

---

## 🧪 테스트 완료 체크리스트

- [ ] Firebase NFC 테스트 프로젝트 생성
- [ ] Realtime Database & Storage 설정
- [ ] `firebase_config.nfc.js` 설정 업데이트
- [ ] `nfc_test.html`에서 NFC 쓰기 성공
- [ ] `nfc_test.html`에서 NFC 읽기 성공
- [ ] Firebase Database에 스캔 로그 저장 확인
- [ ] NFC 모듈 (`nfc_module.js`) 작성
- [ ] Dashboard에 NFC 로그인 버튼 추가
- [ ] NFC 로그인 → Dashboard 자동 접속 성공
- [ ] Preview 배포 후 실제 모바일에서 테스트
- [ ] 크로스 브라우저 호환성 확인 (Android Chrome)
- [ ] 에러 핸들링 (NFC 미지원, 태그 읽기 실패 등)

---

## 🆘 트러블슈팅

### Q: "NDEFReader is not defined" 오류
**A**: NFC는 HTTPS 환경에서만 작동합니다.
```bash
# Firebase Hosting 사용 (자동 HTTPS)
firebase serve --only hosting

# 또는 ngrok으로 HTTPS 터널
ngrok http 5000
```

### Q: iOS에서 NFC 안 됨
**A**: Web NFC API는 Android Chrome만 지원합니다.
- iOS: CoreNFC 사용하는 네이티브 앱 필요
- 대안: QR 코드 로그인 병행

### Q: Firebase 프로젝트가 두 개인데 어떻게 전환?
**A**: 
```bash
# 현재 사용 중인 프로젝트 확인
firebase use

# nfc-test로 전환
firebase use nfc-test

# main으로 되돌리기
firebase use default
```

### Q: NFC 태그에 쓴 데이터가 안 읽힘
**A**:
1. 태그가 NDEF 포맷인지 확인 (NFC Tools 앱 사용)
2. Chrome flags 확인: `chrome://flags/#enable-experimental-web-platform-features` → Enabled
3. 태그를 스마트폰 뒷면 중앙에 가까이 대기 (1~2cm 이내)

---

## 📞 다음 단계

NFC 기본 테스트 완료 후:

1. **NFC 모듈화**: `public/js/nfc_module.js` 작성
2. **Dashboard 통합**: 로그인 화면에 NFC 옵션 추가
3. **HQ 통합**: 팀 도착 체크인 기능 (NFC 태그 스캔 → 출석 자동 기록)
4. **미션 완료**: 각 미션 스테이션에 NFC 태그 → 스캔 시 자동 인증
5. **보안 강화**: Firebase Rules 적용, 태그 암호화

**완료되면 `INSPECTION_CHECKLIST.md`에 NFC 섹션 추가하고 main 병합 고려!**
