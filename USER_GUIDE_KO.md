# JNU 시간표 한국어 설치 가이드

설정을 한 번 마치면 포털 시간표를 Google Calendar와 Galaxy의 삼성 캘린더에서 볼 수 있습니다. 학기마다 날짜를 입력할 필요가 없습니다. Windows에 Docker나 gcloud를 설치하지 않고 **Google Cloud Shell**에서 진행합니다.

화면 이름은 언어와 계정에 따라 조금 다를 수 있습니다. 괄호 안 영어 메뉴를 함께 참고하세요. 공식 문서 확인일: 2026-09-07.

## 1. 준비물과 비용

- GitHub 계정, 개인 Google 계정, 제주대학교 포털 계정
- 본인 소유 Google Cloud 프로젝트와 연결 가능한 결제 계정
- 웹 Google Calendar
- 선택: Webhook 생성 권한이 있는 Discord 서버

결제 계정 연결과 무료 할당량은 다른 개념입니다. 이 도구는 상시 서버 없이 하루 네 번 짧게 실행하지만, 무료라고 보장하지 않습니다. 빌드·이미지 저장 비용도 있습니다. [Cloud Run](https://cloud.google.com/run/pricing), [Cloud Scheduler](https://cloud.google.com/scheduler/pricing), [Secret Manager](https://cloud.google.com/secret-manager/pricing), [Cloud Build](https://cloud.google.com/build/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing)의 현재 가격을 확인하세요.

Cloud Console의 **결제(Billing) → 예산 및 알림(Budgets & alerts) → 예산 만들기(Create budget)**에서 알림을 설정할 수 있습니다. 예산 알림은 지출을 자동 차단하지 않습니다. [공식 예산 가이드](https://docs.cloud.google.com/billing/docs/how-to/budgets)

## 2. GitHub에서 내 복사본 만들기 (Fork)

1. [원본 저장소](https://github.com/vividhyeok/jnu-google-calendar)를 엽니다.
2. 오른쪽 위 **Fork**를 누릅니다.
3. **Owner**에서 본인 GitHub 계정을 선택합니다.
4. **Repository name**은 jnu-google-calendar를 유지하면 아래 명령을 쓰기 편합니다.
5. **Copy the main branch only**를 선택합니다. 설치에는 main만 있으면 됩니다.
6. **Create fork**를 누릅니다.
7. 주소가 github.com/**내아이디**/jnu-google-calendar인지 확인합니다.

Fork는 GitHub 계정 아래에 복사하는 작업입니다. 다음의 Clone은 그 복사본을 Cloud Shell에 내려받는 작업입니다. 이후 Clone 주소는 자신의 Fork에서 복사하세요. [GitHub 공식 Fork 안내](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo)

## 3. Google Cloud 프로젝트 만들기

1. [Cloud Console](https://console.cloud.google.com/)에 Google 계정으로 로그인합니다.
2. 상단 프로젝트 선택기를 누르고 **새 프로젝트(New Project)**를 선택합니다.
3. 프로젝트 이름은 JNU Calendar처럼 정합니다.
4. 아래 표시되는 **프로젝트 ID(Project ID)**를 기록합니다. 화면용 프로젝트 이름과 다르며, 아래 명령에는 ID를 넣습니다.
5. **만들기(Create)**를 누르고 생성된 프로젝트를 상단 선택기에서 선택합니다.
6. **결제(Billing)**에서 이 프로젝트를 결제 계정에 연결합니다. 기존 결제 계정이 없다면 화면 안내를 따릅니다.

학교 조직 계정은 API나 IAM 설정이 제한될 수 있습니다. 이 가이드는 본인이 만든 개인 프로젝트를 관리할 권한이 있다는 전제입니다. 조직 정책 오류가 나면 해당 조직 관리자에게 확인하세요. [프로젝트 생성 공식 안내](https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects)

## 4. 시간표 전용 Google Calendar 만들기

1. PC 브라우저에서 [Google Calendar](https://calendar.google.com)를 엽니다.
2. 왼쪽 **다른 캘린더(Other calendars)** 옆 **+ → 새 캘린더 만들기(Create new calendar)**를 누릅니다.
3. 이름은 **JNU 시간표**, 시간대는 **대한민국 표준시 / Asia/Seoul**로 정하고 만듭니다.
4. 왼쪽 내 캘린더에서 JNU 시간표의 점 세 개 메뉴 → **설정 및 공유(Settings and sharing)**를 엽니다.
5. **캘린더 통합(Integrate calendar)**의 **캘린더 ID(Calendar ID)**를 복사해 둡니다. 일반적으로 @group.calendar.google.com으로 끝납니다.
6. 공개 URL이나 비공개 iCal 주소를 복사하는 것이 아닙니다.

전용 캘린더를 쓰면 개인 일정과 구분하기 쉽고 설치 확인·문제 해결도 간단합니다. 캘린더를 공개할 필요는 없습니다. [새 캘린더 공식 안내](https://support.google.com/calendar/answer/37095)

## 5. Cloud Shell에서 내 Fork 내려받기

1. Cloud Console 오른쪽 위 **Cloud Shell 활성화(Activate Cloud Shell)** 아이콘을 누릅니다.
2. 하단 터미널이 열리면 필요한 경우 **계속(Continue)**, **승인(Authorize)**을 누릅니다.
3. GitHub의 **내 Fork**에서 **Code → HTTPS** 주소를 복사합니다.
4. 아래 명령의 YOUR_GITHUB_NAME을 본인 GitHub 이름으로 바꾸어 실행합니다.

```bash
git clone https://github.com/YOUR_GITHUB_NAME/jnu-google-calendar.git
cd jnu-google-calendar
git remote -v
```

origin 주소가 내 Fork인지 확인하세요. 원본 소유자의 주소로 되어 있다면 아래처럼 교체합니다.

```bash
git remote set-url origin https://github.com/YOUR_GITHUB_NAME/jnu-google-calendar.git
```

Cloud Shell에는 Git과 gcloud가 준비되어 있습니다. 컴퓨터를 끄더라도 나중에 Cloud Run의 자동 실행은 계속됩니다. [Cloud Shell 시작](https://docs.cloud.google.com/shell/docs/using-cloud-shell)

## 6. 배포 스크립트 실행

YOUR_PROJECT_ID를 3단계에서 기록한 프로젝트 ID로 바꿉니다.

```bash
bash scripts/deploy.sh YOUR_PROJECT_ID asia-northeast3
```

처음 출력되는 프로젝트 ID와 리전이 맞는지 확인합니다. 기본 리전은 서울(asia-northeast3)입니다. 스크립트는 다음을 수행합니다.

- Cloud Run, Cloud Build, Artifact Registry, Scheduler, Secret Manager, Calendar, IAM Credentials API 활성화
- 런타임 jnu-calendar와 실행 요청용 jnu-scheduler 서비스 계정 생성
- 런타임에는 해당 secret을 읽는 권한과 자기 계정의 단기 토큰 생성 권한만 부여
- 빌드 계정에는 Cloud Run Builder 역할 부여
- 입력한 secret을 Secret Manager에 저장하고 특정 숫자 버전으로 Job에 연결
- Dockerfile을 Cloud Build에서 빌드하여 Cloud Run Job 생성/업데이트

**서비스 계정 키(JSON)를 만들거나 다운로드하지 않습니다.**

질문이 나오면 순서대로 입력합니다.

| 질문 | 입력 |
| --- | --- |
| PORTAL_USERNAME | 제주대 포털 아이디 |
| PORTAL_PASSWORD | 포털 비밀번호 |
| Enable Discord notifications? | 처음에는 Enter로 건너뛰어도 됨 |
| Google Calendar ID | 4단계에서 복사한 ID |

아이디·비밀번호·Webhook 입력은 화면에 나타나지 않습니다. 정상입니다. 이 값들을 명령줄 인자로 붙이거나 GitHub에 올리지 마세요.

### 캘린더에 서비스 계정 공유하기

스크립트가 **Share the dedicated calendar with ...**를 출력하고 멈추면:

1. 출력된 **jnu-calendar@프로젝트ID.iam.gserviceaccount.com**을 복사합니다.
2. Google Calendar의 JNU 시간표 **설정 및 공유**로 돌아갑니다.
3. **공유 대상(Shared with)** 또는 **특정 사용자 및 그룹과 공유**에서 **사용자 및 그룹 추가(Add people and groups)**를 누릅니다.
4. 복사한 서비스 계정 이메일을 넣습니다.
5. 권한은 **일정 변경(Make changes to events)**을 선택하고 **보내기(Send)**를 누릅니다.
6. Cloud Shell로 돌아가 Enter를 눌러 배포를 계속합니다.

내 Gmail과 서비스 계정 이메일이 다른 것은 정상입니다. 서비스 계정은 자동화가 쓰는 별도 계정입니다. **변경 및 공유 관리** 권한까지 줄 필요는 없습니다. [Calendar 공유 공식 안내](https://support.google.com/calendar/answer/37082)

서비스 계정 이메일을 다시 확인하려면 Cloud Console **IAM 및 관리자(IAM & Admin) → 서비스 계정(Service Accounts)**에서 jnu-calendar를 찾습니다.

첫 빌드는 Chrome 설치 때문에 몇 분 걸릴 수 있습니다. 실패하면 출력된 오류를 확인한 뒤 같은 명령으로 재시도합니다. 기존 자원을 삭제하지 않습니다. secret 질문에 Enter를 누르면 기존 값을 보존합니다. Discord는 재실행할 때도 y를 선택해야 연결이 유지되며, N은 Job에서 연결을 제거합니다.

Secret Manager의 **버전(Version)**은 비밀값의 저장 이력입니다. 값 변경은 새 버전을 만들고, 재배포가 그 버전을 Job에 연결합니다. 이전 버전은 자동 삭제하지 않습니다. 사용하지 않는 버전은 정상 동작 확인 후 Secret Manager에서 비활성화하여 관리할 수 있습니다.

## 7. 첫 수동 실행과 결과 확인

배포가 끝나면 자동 스케줄을 켜기 전에 직접 실행합니다.

```bash
gcloud run jobs execute jnu-calendar --project=YOUR_PROJECT_ID --region=asia-northeast3 --wait
```

또는 Cloud Console **Cloud Run → 작업(Jobs) → jnu-calendar → 실행(Execute)**을 누릅니다. 실행 목록에서 해당 실행을 열어 상태와 **로그(Logs)**를 확인합니다.

정상 로그 흐름:

```text
Sync started
Sync range: ... (Asia/Seoul)
Portal fetch succeeded: ... lecture rows
Calendar diff: ... changed, ... removed
Sync completed
```

Google Calendar에서 오늘부터 앞으로 6주 안의 수업을 확인하세요. 방학이고 수업이 없으면 일정 0개로 정상 종료할 수 있습니다. 동일 명령을 한 번 더 실행하여 중복이 생기지 않고 변경 수가 0인지 확인합니다.

Job 설정은 **View and edit job configuration**에서 확인할 수 있습니다. 리전 서울, 서비스 계정 jnu-calendar, task 1, 병렬 1, CPU 1, 메모리 1 GiB, timeout 600초, Job 재시도 0입니다. **Variables and Secrets**에 PORTAL_USERNAME/PASSWORD secret과 Calendar ID, CALENDAR_SERVICE_ACCOUNT가 표시되어야 합니다. [Job secret 설정](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets)

## 8. 자동 스케줄 켜기

수동 실행이 성공하면:

```bash
bash scripts/schedule.sh YOUR_PROJECT_ID asia-northeast3
```

한국 시간 매일 **08:17, 12:17, 16:17, 20:17**에 실행합니다. 시간대는 **Asia/Seoul**, cron은 **17 8,12,16,20 * * ***입니다. 같은 이름의 스케줄을 갱신하므로 다시 실행해도 별도 스케줄이 추가되지 않습니다.

Cloud Console **Cloud Scheduler → jnu-calendar-sync**에서 **사용 설정됨(Enabled)** 상태, 시간대와 다음 실행 시각을 확인합니다. 기존에 일시중지한 스케줄은 갱신만으로 재개되지 않을 수 있으므로 **재개(Resume)**를 사용합니다.

UI에서 직접 구성하는 공식 경로는 **Cloud Run → Jobs → 대상 Job → Triggers → Add Scheduler Trigger**입니다. 스크립트로 만들었다면 추가로 생성하지 마세요. 수동 구성 시 빈도와 시간대를 위와 같이 지정하고 실행 계정은 jnu-scheduler를 선택합니다. 이 계정은 해당 Job에만 Invoker 권한을 가집니다. [공식 Scheduler 연결 안내](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule)

Scheduler 성공은 실행 요청 접수를 의미합니다. 실제 동기화 성공 여부는 Cloud Run execution 상태에서 확인합니다.

## 9. 삼성 캘린더에서 보기

Galaxy에 캘린더 소유자의 Google 계정을 추가하고 **설정 → 계정 및 백업 → 계정 관리 → Google 계정 → 계정 동기화**에서 캘린더를 켭니다. 삼성 캘린더의 메뉴에서 해당 Google 계정 아래 JNU 시간표를 표시하도록 선택합니다. 메뉴 이름은 One UI 버전에 따라 다를 수 있습니다.

먼저 웹 Google Calendar에서 일정이 보이는지 확인하세요. 웹에는 보이는데 휴대폰에만 없다면 계정/캘린더 표시와 동기화를 확인합니다.

## 10. Discord 알림 (선택)

건너뛰어도 모든 동기화 기능은 정상 동작합니다.

1. Webhook 관리 권한이 있는 Discord 서버를 엽니다.
2. **서버 설정(Server Settings) → 연동(Integrations) → Webhooks**로 이동합니다.
3. **New Webhook / Create Webhook**을 눌러 만듭니다.
4. 알림을 받을 채널을 선택하고 저장합니다.
5. **Copy Webhook URL**을 누릅니다.

별도 봇, Developer Application, OAuth 설정은 필요 없습니다. [Discord 공식 Webhook 안내](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks)

배포 스크립트를 다시 실행하고 기존 포털 값은 Enter로 보존합니다. Discord 질문에는 **y**, 다음 숨김 입력에는 복사한 URL을 붙여넣습니다. Calendar ID도 다시 입력합니다. jnu-discord-webhook secret이 생성되어 DISCORD_WEBHOOK_URL로 연결됩니다.

URL은 비밀번호와 같습니다. GitHub, 공개 채팅, 스크린샷에 올리지 마세요. 노출되었다면 Discord에서 해당 Webhook을 삭제·재생성하고 스크립트로 새 값을 저장합니다.

알림 예:

- JNU 시간표 변경: 추가/수정 2개, 삭제 1개. 캘린더를 확인하세요.
- JNU 시간표 동기화 실패 (portal). Cloud Run 실행 로그를 확인하세요.

변경이 없으면 성공 메시지도 보내지 않습니다. Discord 실패는 동기화 결과를 바꾸지 않습니다. 휴대폰 알림 수신은 Discord 채널 알림 설정에도 달려 있습니다.

## 11. 설치 완료 체크

- [ ] Cloud Run Jobs에 jnu-calendar가 있다.
- [ ] 수동 실행이 성공한다. 실패하면 아래 Cloud Run 항목을 확인한다.
- [ ] 로그에 Portal fetch succeeded와 Sync completed가 나온다.
- [ ] 전용 Google Calendar에 수업이 표시된다. 없다면 조회 범위/Calendar ID를 확인한다.
- [ ] 재실행해도 중복되지 않는다.
- [ ] 삼성 캘린더에서 같은 캘린더가 표시된다.
- [ ] Scheduler가 Enabled이고 Asia/Seoul이며 다음 실행 시각이 보인다.

이후 시간표 변경은 다음 스케줄에서 반영됩니다. 다음 학기에도 START/END 날짜를 수정하지 않습니다.

## 12. 문제 해결

| 증상 | 확인할 곳과 다음 조치 |
| --- | --- |
| Cloud Run 실패 | Jobs → jnu-calendar → 해당 execution → Logs. 마지막 실패 단계 확인 |
| Portal authentication failed | 포털에 브라우저로 직접 로그인, ID/PW·추가 인증·비밀번호 변경 요구 확인. Secret Manager의 최신 값으로 재배포 |
| Navigation timeout / portal timeout | 포털 장애인지 직접 접속. 반복되면 로그인 구조 변경 가능성. 계정 값을 로그에 붙이지 말고 실패 단계만 공유 |
| Google Calendar에 일정 없음 | 전용 Calendar ID인지, jnu-calendar 이메일 공유/일정 변경 권한, Calendar API 활성화, 로그의 6주 조회 범위 확인 |
| 403 / permission denied | Calendar 공유, IAM Credentials API, 자기 계정 Token Creator, secret별 Accessor 확인. 설치 명령 실패면 실행한 사람의 프로젝트 권한도 확인 |
| source build 권한 실패 | Cloud Build 기본 서비스 계정과 Cloud Run Builder 권한 확인. IAM 반영에 잠시 걸릴 수 있어 배포를 재실행 |
| Discord가 안 옴 | 변경 없으면 정상. Job의 Webhook secret 연결/버전, Discord Webhook 유효성·채널 권한·알림 설정 확인. Calendar 상태와 별도로 판단 |
| Scheduler가 실행 안 함 | Enabled, 시간대, 다음 실행 시각, jnu-scheduler의 해당 Job Invoker와 Cloud Scheduler 로그 확인 |
| 시간표가 0개 / Destructive sync blocked | 기존 일정이 있으면 삭제하지 않고 중단하도록 설계됨. 먼저 포털 실제 시간표와 계정 확인 |
| 원본으로 push하려 함 | git remote -v에서 origin을 본인 Fork URL로 교체 |

진짜 전체 휴강이나 대규모 수강 변경도 안전장치가 중단할 수 있습니다. 포털을 확인한 뒤 전용 캘린더에서 없어져야 할 **해당 일정만** 수동 정리하고 재실행하세요. 응답이 이상한 상태에서 캘린더 전체를 비우지 마세요.

한 실행 도중 Calendar API가 실패하면 그 전에 반영된 일부 변경은 남을 수 있습니다. 다음 성공 실행에서 재계산합니다. 동시에 여러 execution을 수동 시작하지 마세요.

## 13. 기존 GitHub Actions 사용자 전환

1. 기존 Fork의 Actions → cron → 점 세 개 메뉴에서 **Disable workflow**로 일시중지하고 실행 중 작업이 없는지 확인합니다.
2. 새 코드를 받으면 cron.yml이 제거되고 CI만 남습니다.
3. 이 가이드대로 Cloud Run을 설정합니다. 기존 전용 캘린더를 사용하면 새 런타임 이메일을 공유 대상에 추가합니다.
4. 첫 실행과 중복 방지를 확인하고 새 Scheduler를 켭니다.
5. 이전 JSON 키를 다른 곳에서 쓰지 않는지 확인한 뒤 IAM 서비스 계정의 Keys에서 폐기합니다. GitHub Actions의 기존 포털/Google 키 secrets와 START/END 변수도 더 이상 필요하지 않습니다.

현재 조회 범위 밖의 과거 일정은 보존합니다. 기존 별도 자동 실행은 중지해야 두 운영 경로가 겹치지 않습니다.

## 14. 코드 업데이트와 중지

GitHub 내 Fork에서 **Sync fork → Update branch**를 선택한 뒤 Cloud Shell에서:

```bash
cd jnu-google-calendar
git pull --ff-only
bash scripts/deploy.sh YOUR_PROJECT_ID asia-northeast3
```

Cloud Shell이 이미 저장소 폴더라면 cd는 생략합니다. 충돌이 있으면 강제로 덮어쓰지 말고 변경사항부터 확인합니다. 코드 업데이트는 재배포해야 운영에 반영됩니다. 포털의 시간표 변경에는 이 작업이 필요 없습니다. [Fork 동기화 공식 안내](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/syncing-a-fork)

잠시 중지하려면 Cloud Scheduler에서 해당 스케줄을 **Pause**합니다. 이미 실행 중인 Job은 별도 확인하세요. 완전히 사용을 중단한다면 Scheduler/Job, 불필요한 이미지와 secret을 검토하여 정리하고 Calendar 공유 권한도 해제할 수 있습니다.
