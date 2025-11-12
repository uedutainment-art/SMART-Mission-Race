# NFC 테스트 환경 - 빠른 시작

## 현재 상태 ✅

### 브랜치 구조
```
main                         ← 운영 환경 (보존됨)
│
├── inspection/full-validation   ← 기능 검증용
│
└── nfc-test                     ← NFC 실험용 (현재 위치)
```

### 생성된 파일
- ✅ `nfc_test.html` - NFC 태그 읽기/쓰기 테스트 페이지
- ✅ `public/js/nfc_module.js` - NFC 재사용 모듈
- ✅ `public/js/firebase_config.nfc.js` - 별도 Firebase 설정
- ✅ `NFC_SETUP_GUIDE.md` - 상세 설정 가이드
- ✅ `.firebaserc.nfc` - Firebase CLI 설정

---

## ⚡ 지금 바로 시작하기

### 1단계: Firebase 프로젝트 생성 (5분)

```bash
# Firebase Console 접속
open https://console.firebase.google.com

# 새 프로젝트 생성
# 이름: smart-mission-race-nfc-test
```

**필수 설정:**
1. Realtime Database 생성 (테스트 모드)
2. Storage 활성화
3. 웹 앱 추가 → 설정값 복사

### 2단계: 설정 파일 업데이트 (2분)

`public/js/firebase_config.nfc.js` 열어서 복사한 설정 붙여넣기:

```javascript
const firebaseConfig = {
  apiKey: "여기에_붙여넣기",
  authDomain: "smart-mission-race-nfc-test.firebaseapp.com",
  databaseURL: "https://smart-mission-race-nfc-test-...firebasedatabase.app",
  projectId: "smart-mission-race-nfc-test",
  storageBucket: "smart-mission-race-nfc-test.firebasestorage.app",
  messagingSenderId: "여기에_붙여넣기",
  appId: "여기에_붙여넣기"
};
```

### 3단계: 로컬 서버 실행 (1분)

```bash
# Firebase 로컬 서버
firebase serve

# 브라우저에서 열기
open http://localhost:5000/nfc_test.html
```

### 4단계: NFC 태그 테스트 (5분)

**준비물:**
- Android 스마트폰 (NFC 지원)
- Chrome 브라우저
- NFC 태그 (NTAG215 권장)

**테스트:**
1. 스마트폰에서 `http://[내IP주소]:5000/nfc_test.html` 접속
2. "✏️ NFC 태그에 쓰기" 클릭
3. 팀 정보 입력 (Team1, 번호 1, 이름 테스트팀)
4. 태그를 스마트폰 뒷면에 대기
5. "📡 NFC 태그 스캔" 클릭 → 정보 확인

---

## 🎯 다음 단계

### A. Dashboard NFC 로그인 추가
```javascript
// team_login.html에 버튼 추가
<button id="nfcLoginBtn">🔖 NFC로 로그인</button>

// login.js에 로직 추가
import { scanNFCForTeam } from './js/nfc_module.js';

nfcLoginBtn.onclick = async () => {
  const team = await scanNFCForTeam();
  // 기존 로그인 로직 호출
};
```

### B. HQ 체크인 기능
```javascript
// hq.html에 팀 도착 체크인 추가
// NFC 스캔 → 자동으로 출석 기록
```

### C. 미션 스테이션 인증
```javascript
// 각 미션 장소에 NFC 태그 설치
// 스캔 → 위치 인증 → 미션 unlock
```

---

## 🔒 안전 수칙

### ✅ 해도 되는 것
- `nfc-test` 브랜치에서 자유롭게 코드 수정
- `smart-mission-race-nfc-test` Firebase에 테스트 데이터 저장
- 여러 번 배포 및 테스트

### ❌ 절대 하면 안 되는 것
- `main` 브랜치에 직접 NFC 코드 추가
- 운영 Firebase (`smart-mission-race-57839`)에 테스트 데이터 저장
- 검증 없이 `main`으로 병합

---

## 📋 테스트 체크리스트

- [ ] Firebase NFC 테스트 프로젝트 생성
- [ ] `firebase_config.nfc.js` 설정 완료
- [ ] `nfc_test.html`에서 NFC 쓰기 성공
- [ ] `nfc_test.html`에서 NFC 읽기 성공
- [ ] Firebase Database에 스캔 로그 확인
- [ ] `nfc_module.js`를 다른 페이지에서 import 테스트
- [ ] Dashboard NFC 로그인 기능 추가
- [ ] 실제 모바일에서 동작 확인
- [ ] 에러 처리 (미지원 브라우저, 읽기 실패 등)

---

## 🆘 문제 해결

### "NDEFReader is not defined"
→ Android Chrome 89+ 필요, HTTPS 환경 필수

### iOS에서 안 됨
→ Web NFC는 Android만 지원, iOS는 네이티브 앱 필요

### Firebase 프로젝트 전환 방법
```bash
firebase use nfc-test     # NFC 테스트 프로젝트
firebase use default      # 운영 프로젝트 (main)
```

---

## 📞 더 알아보기

상세 가이드: **`NFC_SETUP_GUIDE.md`** 참고

---

**현재 위치**: `nfc-test` 브랜치  
**운영 환경**: `main` 브랜치 (안전하게 보존됨)  
**시작**: `NFC_SETUP_GUIDE.md` 1단계부터 진행! 🚀
