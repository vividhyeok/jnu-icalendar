
📅 제주대학교 포털에서 강의 시간표를 가져와 **Google Calendar**에 직접 반영하는 개인용 동기화 서버입니다. 갤럭시 스마트폰·태블릿·워치에서 Google 계정을 추가해 두기만 하면 휴강·보강까지 자동으로 갱신됩니다.

> 이 저장소는 [mu-hun/jejunu-icalendar-server](https://github.com/mu-hun/jejunu-icalendar-server.git)를 기반으로 하며, **Google 캘린더 연동에 필요한 핵심 기능만** 남겨 단일 사용자 + GitHub Actions cron 환경에 맞게 가볍게 정리했습니다.

## 특징

- **완전 자동**: PC를 켜 둘 필요 없이 GitHub Actions가 정해진 스케줄에 실행
- **사실상 무료**: puppeteer + 단일 사용자 기준으로 GitHub Actions 무료 분량 내에서 운영 가능
- **갤럭시 친화**: Google Calendar를 소스로 쓰기 때문에 Samsung Calendar, Galaxy Watch 등에서 그대로 동기화
- **휴강/보강 인식**: 포털 응답을 분석해 휴강·보강·연강 상황까지 Google Calendar 이벤트로 반영

## 동작 개요

1. GitHub Actions가 스케줄에 따라 워크플로(`cron.yml`)를 실행
2. `puppeteer`가 제주대 포털에 로그인해 지정된 기간(`START_YYYYMMDD`~`END_YYYYMMDD`)의 시간표 JSON을 가져옴
3. 휴강/보강 플래그를 해석해 Google Calendar 이벤트 페이로드를 구성
4. 해당 기간의 기존 강의 이벤트를 삭제하고 새 이벤트를 삽입

---

## 1. Google 캘린더 & 서비스 계정 준비

### 1-1. 동기화 대상 캘린더 만들기

1. [Google Calendar](https://calendar.google.com/) → 왼쪽 `기타 캘린더` 옆 `+`
2. “새 캘린더 만들기” 선택 → 예: `제주대 시간표`
3. 생성된 캘린더의 “설정 및 공유”에서 **캘린더 ID**를 기록 (예: `abc123@group.calendar.google.com`)

### 1-2. Google Cloud 서비스 계정 생성

1. [Google Cloud Console](https://console.cloud.google.com/) → 새 프로젝트 생성
2. `APIs & Services → Library`에서 **Calendar API** 활성화
3. `IAM & Admin → Service Accounts`에서 서비스 계정 생성
4. 서비스 계정의 “Keys” 탭에서 **JSON 키** 발급
   - JSON 안의 `client_email` → `GOOGLE_CLIENT_EMAIL`
   - JSON 안의 `private_key` → `GOOGLE_PRIVATE_KEY`

### 1-3. 서비스 계정을 캘린더에 초대

1. Google Calendar의 동기화 대상 캘린더 설정으로 이동
2. “특정 사용자와 공유”에서 서비스 계정 이메일을 추가
3. 권한을 **“변경 및 공유 관리”**로 설정

---

## 2. 리포지토리 준비 & GitHub Actions 값 넣기

1. 이 코드를 GitHub에 푸시하거나 포크합니다.
2. 저장소 `Settings → Secrets and variables → Actions`로 이동해 아래를 등록합니다.

### Secrets (Repository secrets)

| 이름 | 값 |
| ---- | --- |
| `PORTAL_USERNAME` | 제주대 포털 아이디 |
| `PORTAL_PASSWORD` | 제주대 포털 비밀번호 |
| `GOOGLE_CLIENT_EMAIL` | 서비스 계정 `client_email` |
| `GOOGLE_PRIVATE_KEY` | 서비스 계정 `private_key` 전체 (줄바꿈 포함) |
| `GOOGLE_CALENDAR_ID` | 동기화할 Google 캘린더 ID |

### Variables (Repository variables)

| 이름 | 값 |
| ---- | --- |
| `START_YYYYMMDD` | 학기 시작일, 예: `20240902` |
| `END_YYYYMMDD` | 학기 종료일, 예: `20241221` |

`.github/workflows/cron.yml`은 위 변수들을 사용해 기본적으로 **월~금 한국시간 오전 10시**(UTC 01:00)에 동기화를 수행합니다. 스케줄을 바꾸고 싶다면 `cron` 표현식만 수정하면 됩니다. 워크플로는 자동으로 `SYNC_INTERVAL_HOURS=0`으로 실행되어 한 번의 동기화 후 즉시 종료되며, GitHub Actions가 장시간 대기하지 않습니다.

---

## 3. 갤럭시 기기 연동 방법

1. Google Calendar 웹에서 동기화 대상 캘린더를 자신의 Google 계정에서 확인 가능하도록 설정합니다.
2. 갤럭시 스마트폰에서 **설정 → 계정 및 백업 → 계정 관리**로 들어가 같은 Google 계정을 등록합니다.
3. **Samsung Calendar** 앱을 열고 `캘린더 관리`에서 해당 Google 캘린더를 활성화합니다.
4. 같은 Google 계정으로 로그인된 갤럭시 태블릿, Galaxy Watch에서도 자동으로 동일 일정이 동기화됩니다.

휴강/보강 등 일정 변동이 생기면 GitHub Actions가 갱신을 수행하고, 기기는 표준 Google 동기화 주기에 맞춰 자동으로 업데이트합니다.

---

## 4. 로컬에서 한 번 테스트하고 싶다면 (선택)

1. 프로젝트 루트에 `.env.local` 파일을 만들고 아래 내용을 입력합니다.

```ini
username=제주대-포털-아이디
password=제주대-포털-비밀번호
START_YYYYMMDD=20240902
END_YYYYMMDD=20241221
GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=abc123@group.calendar.google.com
SYNC_INTERVAL_HOURS=0  # 로컬에서는 한 번만 실행하고 종료
```

> Windows 메모장을 사용할 경우 `.env.local.txt`가 되지 않도록 확장자 표시를 확인하세요.

2. 터미널에서 아래 명령을 실행합니다.

```bash
pnpm install
pnpm test   # 선택: 휴강/보강 처리 로직 검증 (단일 실행)
pnpm start  # 실제 포털 → Google Calendar 동기화 실행
```

정상적으로 일정이 생성되는 것을 확인했다면, GitHub Actions에 환경 변수를 넣고 자동 스케줄에 맡기면 됩니다.

---

## 5. 문제 발생 시 확인할 곳

- GitHub 저장소의 `Actions` 탭 → `cron` 워크플로 선택 → 실행 로그에서 에러 메시지 확인
- 포털 로그인 실패, Calendar API 권한 오류 등은 여기 로그에 그대로 출력됩니다.

---

## 6. 환경 변수 요약 (로컬/CI 공통)

| 키 | 설명 |
| --- | --- |
| `username`, `password` | 제주대학교 포털 로그인 정보 (로컬 `.env.local` 전용) |
| `START_YYYYMMDD`, `END_YYYYMMDD` | 시간표를 가져올 학기 기간 (YYYYMMDD) |
| `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Google Cloud 서비스 계정 자격증명 |
| `GOOGLE_CALENDAR_ID` | 동기화 대상 Google 캘린더 ID |
| `SYNC_INTERVAL_HOURS` | 로컬 실행 시 반복 주기 (기본 24, 0이면 한 번 실행 후 종료) |

CI에서는 같은 값을 Secrets/Variables로 나누어 관리합니다 (표 2 참고).

---

## 7. 참고 자료

- 제주대 시간표 API (로그인 세션 필요): `GET https://portal.jejunu.ac.kr/api/patis/timeTable.jsp?sttLsnYmd=YYYYMMDD&endLsnYmd=YYYYMMDD`
- 샘플 응답: `src/tests/response.json`
- 테스트 실행: `pnpm test`

이 테스트들은 휴강/보강/연강 케이스와 Google Calendar 이벤트 변환 로직을 꾸준히 확인하기 위해 유지됩니다.

## 동작 방식

1. `puppeteer`가 제주대학교 포털에 로그인하여 원하는 기간(`START_YYYYMMDD`~`END_YYYYMMDD`)의 시간표를 가져옵니다.
2. 휴강/보강/연강 여부를 분석한 뒤 Google Calendar 이벤트 페이로드로 변환합니다.
3. 해당 기간의 기존 일정을 삭제하고 새 강의 정보를 등록해 일관성을 유지합니다.
4. `SYNC_INTERVAL_HOURS`(기본 24시간)에 맞춰 반복 실행하거나, GitHub Actions cron 으로 스케줄링합니다.

## 빠른 시작 (로컬/개인용)

### 1단계: Google 캘린더 & 서비스 계정 한 번만 준비하기

1. Google Calendar에서 새 캘린더를 하나 만듭니다. (예: `제주대 시간표`)
2. Google Cloud Console에서 새 프로젝트를 만든 뒤 **Calendar API**를 활성화합니다.
3. **서비스 계정**을 만들고 JSON 키를 발급받습니다. 이때 JSON 안의
   - `client_email` → `GOOGLE_CLIENT_EMAIL`
   - `private_key` → `GOOGLE_PRIVATE_KEY`
   값으로 사용합니다.
4. Google Calendar 웹에서 방금 만든 캘린더의
   - `설정 및 공유 → 특정 사용자와 공유`
   메뉴로 들어가 서비스 계정 이메일을 추가하고, **변경 및 공유 관리** 권한을 줍니다.

### 2단계: `.env.local` 파일 만들기

프로젝트 루트(이 README가 있는 위치)에 `.env.local` 파일을 만들고 아래처럼 채웁니다.

```ini
# 제주대 포털 계정
username=제주대-포털-아이디
password=제주대-포털-비밀번호

# 시간표를 가져올 학기 기간 (YYYYMMDD)
START_YYYYMMDD=20240902
END_YYYYMMDD=20241221

# Google Cloud 서비스 계정 정보
GOOGLE_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# 동기화할 Google 캘린더 ID (예: abc123@group.calendar.google.com)
GOOGLE_CALENDAR_ID=abc123@group.calendar.google.com

# 선택: 로컬에서 계속 켜 둘 경우 반복 주기(시간 단위)
# 24면 하루 1번, 0이면 한 번만 실행
SYNC_INTERVAL_HOURS=24
```

> Windows에서 `.env.local`을 만들 때 메모장을 쓰면 `.env.local.txt`가 되는 경우가 있습니다. 확장자 설정을 확인해 실제 파일명이 `.env.local`인지 한 번만 체크해 주세요.

### 3단계: 로컬에서 한 번 실행해 보기

```bash
pnpm install
pnpm test   # 선택: 변환 로직이 정상인지 확인
pnpm start  # 실제 포털 → Google 캘린더 동기화 실행
```

`pnpm start`가 끝난 뒤 Google Calendar 웹 또는 갤럭시 기기(아래 설명 참고)에서 일정이 생성되었는지 확인하면 됩니다.

## 자동 실행 옵션

### 4단계: 완전 무관리로 쓰고 싶다면 (선택)

혼자 쓰더라도 노트북을 켜 둘 필요 없이 GitHub Actions로 돌리면 사실상 **완전 무료 + 무관리 cron 서버**가 됩니다.

1. 이 저장소를 GitHub에 푸시합니다.(또는 포크)
2. GitHub 저장소의 `Settings → Secrets and variables → Actions`에서 아래 항목을 등록합니다.
    - **Repository secrets**
       - `PORTAL_USERNAME` → 제주대 포털 아이디
       - `PORTAL_PASSWORD` → 제주대 포털 비밀번호
       - `GOOGLE_CLIENT_EMAIL` → 서비스 계정 이메일
       - `GOOGLE_PRIVATE_KEY` → 서비스 계정 프라이빗 키
       - `GOOGLE_CALENDAR_ID` → 동기화할 캘린더 ID
    - **Repository variables**
       - `START_YYYYMMDD` → 학기 시작일 (YYYYMMDD)
       - `END_YYYYMMDD` → 학기 종료일 (YYYYMMDD)
3. `.github/workflows/cron.yml`에 정의된 스케줄(기본: 월~금 한국시간 10:00)에 맞춰 자동으로 동기화됩니다. 워크플로는 `SYNC_INTERVAL_HOURS=0`을 사용하므로 각 실행이 한 번 동기화 후 종료됩니다.

다른 클라우드(예: Render Cron, Cloud Run Jobs)를 쓸 경우에도 기본 아이디어는 동일합니다.

- `.env.local` 내용을 해당 서비스의 **환경 변수**로 옮기고
- 실행 명령을 `pnpm install --prod` 후 `pnpm start`로 지정
- `SYNC_INTERVAL_HOURS=0`으로 두고 **“한 번 실행할 때마다 한 번만 동기화”** 하도록 설정

## 갤럭시 기기에서 일정 확인하기

1. 동기화 대상 Google 캘린더를 본인 Google 계정에서 한 번만 구독합니다.
2. **Samsung Calendar** 앱을 열고 `설정 → 캘린더 관리`에서 해당 캘린더를 활성화합니다.
3. 위젯이나 Galaxy Watch의 캘린더 앱에서도 같은 Google 계정을 사용하면 자동으로 동일한 일정을 볼 수 있습니다.
4. 휴강/보강 등의 변동이 있을 때마다 서버가 Google Calendar를 갱신하므로, 사용자는 갤럭시 기기에서 알림만 확인하면 됩니다.

## 환경 변수 요약

| 키 | 설명 |
| --- | --- |
| `username`, `password` | 제주대학교 포털 로그인 정보 |
| `START_YYYYMMDD`, `END_YYYYMMDD` | 조회하고 싶은 학사 기간 (YYYYMMDD) |
| `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` | Google Cloud 서비스 계정 키 |
| `GOOGLE_CALENDAR_ID` | 동기화 대상 캘린더 ID (`*.ics` URL 아님) |
| `SYNC_INTERVAL_HOURS` | 로컬 실행 시 반복 주기, 기본 24시간 |

## 요청/응답 참고

- 시간표 API: `GET https://portal.jejunu.ac.kr/api/patis/timeTable.jsp?sttLsnYmd=YYYYMMDD&endLsnYmd=YYYYMMDD` (포털 로그인 세션 필요)
- 샘플 응답: `src/tests/response.json`

테스트(`pnpm test`)는 휴강/보강/연강, Google Calendar 이벤트 변환 로직을 꾸준히 검증합니다.
