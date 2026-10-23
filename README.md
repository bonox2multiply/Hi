# KIA 다이아몬드

기아 타이거즈 경기 일정, 결과, 중계와 관련 소식을 보여주는 사이트입니다.

- 운영 사이트: https://kiadiamond.nicebs.chatgpt.site
- 소스 관리: https://github.com/bonox2multiply/67
- 이전 원본: Sites 소스 커밋 `abe93467ccd209d25c19ff18f14ef40163105a0c`

## 로컬 검증

Node.js 22 이상에서 별도 패키지 설치 없이 실행합니다.

```sh
npm run build
npm test
```

테스트 일부가 `dist/server/index.js`를 사용하므로 빌드를 먼저 실행해야 합니다.
`public/`은 화면, `worker/`는 서버 코드, `tests/`는 회귀 테스트입니다.
빌드 결과는 `dist/`에 생성됩니다.

## 운영 원칙

GitHub 코드를 기준으로 오류를 검토합니다. 확인된 오류만 최소한으로 수정하고 빌드 및 관련 테스트로 검증합니다. 디자인 변경, 새 기능과 사용성 개선은 적용 전에 사용자에게 보고합니다. 오류인지 불명확하면 먼저 보고합니다.

GitHub 업로드는 기존 Sites에 자동 배포되지 않습니다. 운영 반영 시 `.openai/hosting.json`의 기존 프로젝트를 유지하고 Sites 배포 절차를 사용해야 합니다. 비밀값과 인증 정보를 저장소에 커밋하지 않습니다.
