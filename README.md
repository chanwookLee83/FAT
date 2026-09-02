# 설비검수 (Equipment Acceptance PWA)

장비 제작 완료 후 진행하는 **FAT(공장검수) / SAT(현장검수)** 체크리스트를
현장에서 바로 기록하는 오프라인 지원 PWA입니다. 빌드 도구 없이 순수
HTML/CSS/JS로만 되어 있어 GitHub Pages에 그대로 올려서 씁니다.

## 구성

```
index.html            앱 셸
styles.css             디자인 토큰 · 스타일
app.js                 라우팅 · 체크리스트 로직 · 저장(localStorage)
service-worker.js      오프라인 캐시 (app-shell 전략)
manifest.webmanifest   PWA 설치 매니페스트
icons/                 앱 아이콘 (192/512/마스커블/파비콘)
```

- 검수 항목은 안전 · 기계/구조 · 전기·제어(PLC/HMI) · 공정·성능 · 문서 5개
  카테고리, 총 25개 항목으로 `app.js`의 `CATEGORIES` 배열에 정의되어
  있습니다. 현장에 맞게 이름/항목을 자유롭게 수정하세요.
- 데이터는 서버 없이 기기의 `localStorage`에 저장됩니다. 검수를 새로
  시작하거나 항목을 체크할 때마다 자동 저장되며, 완료된 검수는 이력으로
  계속 남아 홈 화면에서 검색·필터로 다시 찾아볼 수 있습니다. 사진은
  업로드 시 자동으로 리사이즈·압축(JPEG)되어 용량을 줄입니다.
- 홈 화면은 **전체 / 진행중 / 완료** 탭과 장비명·검수자 검색으로 이력을
  거를 수 있고, 각 카드에 합격 · 불합격 · 진행중 상태가 배지로 표시됩니다.
  단, `localStorage`는 브라우저(기기)별로 분리되어 있으므로 다른 기기나
  브라우저의 캐시를 완전히 지우면 사라집니다 — 중요한 이력은 JSON
  내보내기로 주기적으로 백업하세요.
- 검수 건별로 JSON 내보내기/가져오기를 지원해 백업하거나 다른 기기로
  옮길 수 있습니다.
- 라우팅은 해시(`#/...`) 방식이라 GitHub Pages에서 새로고침해도
  깨지지 않습니다(서버 사이드 라우팅 설정이 필요 없음).

## GitHub Pages로 배포하기

1. 새 GitHub 저장소를 만들고 이 폴더의 파일 전체를 커밋합니다.

   ```bash
   git init
   git add .
   git commit -m "설비검수 PWA 초기 배포"
   git branch -M main
   git remote add origin https://github.com/<사용자명>/<저장소명>.git
   git push -u origin main
   ```

2. GitHub 저장소 → **Settings → Pages** 로 이동합니다.
3. **Source**를 `Deploy from a branch`로 설정하고, 브랜치는 `main`,
   폴더는 `/ (root)`를 선택한 뒤 저장합니다.
4. 몇 분 뒤 `https://<사용자명>.github.io/<저장소명>/` 에서 접속됩니다.
5. 모바일/태블릿 브라우저로 접속 후 "홈 화면에 추가"를 하면 앱처럼
   설치되어 오프라인에서도 열립니다.

### 업데이트 배포 시 주의

`service-worker.js`가 앱 셸을 캐시하기 때문에, 파일을 수정해서 다시
푸시했다면 `service-worker.js` 상단의 `CACHE_VERSION` 값을 올려주세요
(예: `v1` → `v2`). 그래야 사용자 기기에서 새 버전을 내려받습니다.

```js
const CACHE_VERSION = "v2";
```

## 로컬에서 미리 보기

정적 파일이므로 아무 로컬 서버로 열면 됩니다 (서비스워커는
`file://`에서 동작하지 않으므로 http 서버가 필요합니다):

```bash
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080 접속
```
