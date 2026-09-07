# 변경 기록

## 2026-09-07

- Cloud Run Job + Scheduler로 1회 실행 전환, Actions는 CI만 유지.
- KST 기준 과거 7일/미래 42일 자동 조회.
- iframe SSO에 맞는 완료 대기와 엄격한 응답 검증.
- 빈 결과/대폭 감소 시 쓰기 전 중단.
- ADC와 Calendar 범위의 단기 토큰, Secret Manager 사용.
- 선택 Discord 알림과 실패 격리.
- 한국어 초보자 설치 가이드와 배포 스크립트 추가.

## 2026-03-02 (과거 버전)

결정적 이벤트 ID, diff/upsert, 연강 병합 및 재시도 로직을 도입했습니다.
당시 사용한 GitHub Actions·JSON 키·수동 날짜 설정은 폐기되었습니다.
현재 설치는 [사용자 가이드](./USER_GUIDE_KO.md)만 참고하세요.
