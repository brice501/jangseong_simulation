# 캠퍼스 로맨스 — 실행 & 배포 가이드

DM 대화는 이제 **백엔드 프록시(`server.js`)** 를 거칩니다.
API 키는 서버 환경변수(`.env`)에만 있고 브라우저로는 절대 나가지 않습니다.

---

## 1. API 키 발급 (직접 하셔야 하는 부분)

키는 본인 계정의 비밀 자격증명이라 대신 발급이 불가능합니다. 아래 중 하나만:

- **OpenAI** — https://platform.openai.com/api-keys → "Create new secret key" → `sk-...` 복사
  (사용량 결제수단 등록 필요. `gpt-4o-mini` 는 메시지당 소수점 원 수준으로 매우 저렴)
- **Google Gemini** — https://aistudio.google.com/apikey → 키 생성
  (`gemini-1.5-flash` 무료 티어 있음 — 테스트에 추천)

## 2. 키 넣기 (.env)

```bash
cp .env.example .env
```

`.env` 를 열어 채우세요:

```
LLM_PROVIDER=openai          # 또는 gemini
LLM_API_KEY=sk-당신의_키
LLM_MODEL=gpt-4o-mini        # gemini면 gemini-1.5-flash
PORT=8123
```

> `.env` 는 `.gitignore` 에 있어 커밋되지 않습니다. **키를 HTML/JS 에는 절대 넣지 마세요.**

## 3. 로컬 실행

```bash
npm install
npm start
```

→ 브라우저에서 http://localhost:8123 접속. (게임과 `/api/dm` 이 같은 포트에서 함께 서빙됩니다.)
DM 창 제목에 "AI 대화 ✨" 가 뜨고, 캐릭터가 대화 맥락에 맞게 매번 다르게 답하면 성공입니다.
서버 없이 정적 파일로만 열면 DM 은 자동으로 **오프라인(규칙기반) 응답**으로 폴백됩니다.

---

## 4. 배포

`server.js` 는 정적 파일 + API 를 한 번에 서빙하므로, Node 를 돌릴 수 있는 곳이면 어디든 됩니다.
플랫폼 대시보드에서 **환경변수(`LLM_API_KEY` 등)를 설정**하고 `npm start` 로 실행하면 끝(.env 파일은 올리지 않음).

- **Render / Railway / Fly.io** (추천, 무료 티어): 이 폴더를 그대로 배포 → Build `npm install`, Start `npm start`, 환경변수 등록.
- **VPS (Ubuntu 등)**: `npm install` 후 `pm2 start server.js` 로 상시 구동, 앞단에 Nginx + HTTPS 권장.

### 배포 시 보안 체크
- ✅ 키는 서버 환경변수에만 (이미 그렇게 구성됨).
- ✅ `/api/` 분당 30회 IP 레이트리밋 내장 (`server.js` 에서 숫자 조정 가능).
- ⚠️ 공개 URL이면 누구나 `/api/dm` 을 호출해 당신 키의 사용량을 쓸 수 있습니다. 트래픽이 커지면:
  허용 도메인 제한(CORS/Referer 체크), 로그인/세션, 또는 사용량 상한(provider 대시보드의 monthly limit) 을 거세요.
- ⚠️ provider 대시보드에서 **월 사용 한도(hard limit)** 를 걸어두면 예상치 못한 과금을 막을 수 있습니다.
