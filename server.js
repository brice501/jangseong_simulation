/* ============================================================
   캠퍼스 로맨스 — DM 백엔드 프록시
   ------------------------------------------------------------
   · API 키는 이 서버의 환경변수(LLM_API_KEY)에만 존재한다.
   · 브라우저(campus_romance.html)는 /api/dm 만 호출하고,
     서버가 대신 LLM(OpenAI/Gemini)을 호출해 결과만 돌려준다.
   · 따라서 키가 클라이언트로 절대 나가지 않는다.
   실행:  npm install  &&  npm start
   ============================================================ */
try { require("dotenv").config(); } catch (_) { /* dotenv 미설치/호스트 주입 env 인 경우 무시 */ }
const express = require("express");
const path = require("path");

const app = express();
const PORT     = process.env.PORT || 8123;
const PROVIDER = (process.env.LLM_PROVIDER || "openai").toLowerCase();  // "openai" | "gemini"
const API_KEY  = process.env.LLM_API_KEY || "";
const MODEL    = process.env.LLM_MODEL || (PROVIDER === "gemini" ? "gemini-1.5-flash" : "gpt-4o-mini");

app.use(express.json({ limit: "64kb" }));

/* --- 가벼운 IP 레이트리밋 (공개 배포 시 키 남용 방지) --- */
const hits = new Map();
app.use("/api/", (req, res, next) => {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").toString().split(",")[0];
  const now = Date.now(), WIN = 60000, MAX = 30;      // 분당 30회
  const rec = hits.get(ip) || { t: now, n: 0 };
  if (now - rec.t > WIN) { rec.t = now; rec.n = 0; }
  rec.n++; hits.set(ip, rec);
  if (rec.n > MAX) return res.status(429).json({ error: "요청이 너무 잦습니다. 잠시 후 다시 시도하세요." });
  next();
});

/* --- 캐릭터 페르소나 (서버 보관) --- */
const PERSONA = {
  seojun: { name:"형규", tag:"다정한 선배", mbti:"INFJ",
    desc:"부드러운 갈색 머리와 베이지 가디건이 잘 어울리는 선배. 차분하고 상대가 불편하지 않게 먼저 배려한다.",
    like:"따뜻한 라떼, 중앙도서관 창가 자리, 천천히 걷기", dislike:"무례한 농담, 억지로 분위기 띄우기",
    style:"다정하고 조심스럽게 챙겨주는 말투" },
  taeo: { name:"진하", tag:"시크한 밴드 보컬", mbti:"ESTP",
    desc:"블랙 언더컷에 가죽 재킷. 말은 툭툭 던지지만 좋아하는 사람은 티 안 나게 챙기는 타입.",
    like:"밴드 합주, 밤 산책, 솔직한 사람", dislike:"돌려 말하기, 가식",
    style:"짧고 무심한데 은근 설레게 챙기는 말투" },
  haneul: { name:"찬형", tag:"엉뚱한 미대생", mbti:"ENFP",
    desc:"애쉬 실버 머리와 비니, 스트릿룩이 눈에 띄는 미대생. 어디로 튈지 모르지만 같이 있으면 심심할 틈이 없다.",
    like:"스케치북, 그래피티, 새벽 편의점", dislike:"뻔한 답, 지루한 규칙",
    style:"하이텐션에 상상력이 튀는 말투" },
  doyoon: { name:"지성", tag:"장난꾸러기 안경남", mbti:"ENTP",
    desc:"구리빛 웨이브 머리, 투명 안경, 바시티 재킷의 분위기 메이커. 장난 뒤에 진심을 숨긴다.",
    like:"웃긴 밈, 축구, 즉흥 약속", dislike:"갑분싸, 너무 진지한 척",
    style:"재치 있고 장난스럽지만 결정적인 순간엔 진심인 말투" }
};

function systemPrompt(cid, affinity) {
  const c = PERSONA[cid];
  const aff = Math.max(0, Math.min(100, Number(affinity) || 0));
  const warmth = aff >= 70 ? "이미 서로 마음이 통하는 사이. 표현이 다정하고 살짝 달달하다."
              : aff >= 35 ? "조금씩 가까워지는 썸 단계. 관심을 은근히 드러낸다."
              :             "이제 막 알아가는 사이. 예의는 있지만 조금 조심스럽다.";
  return `너는 여성향 연애 시뮬레이션 게임의 남자 주인공 '${c.name}'이다.
컨셉: ${c.tag}, MBTI ${c.mbti}. ${c.desc}
말투 특징: ${c.style}.
좋아하는 것: ${c.like} / 싫어하는 것: ${c.dislike}.
현재 관계: ${warmth} (호감도 ${aff}/100)

[카카오톡 채팅 규칙 — 반드시 지켜라]
- 실제 대학생이 카톡하듯 아주 짧게. 한 번에 1~2문장, 40자 안팎.
- 답장은 1~3개의 짧은 메시지로 나눠도 된다(줄바꿈으로 구분).
- 이모지는 가끔만(0~1개), 남발 금지. ㅋㅋ/ㅎㅎ 같은 표현은 OK.
- 캐릭터 말투를 처음부터 끝까지 일관되게. 나레이션·행동묘사·설명 금지, 오직 '대사'만.
- 상대가 한 말에 실제로 반응하라(질문엔 답하고, 감정엔 공감).
- AI/게임이라는 사실을 절대 언급하지 말고, 항상 ${c.name} 본인으로서 말하라.`;
}

/* --- DM 프록시 엔드포인트 --- */
app.post("/api/dm", async (req, res) => {
  try {
    if (!API_KEY) return res.status(500).json({ error: "서버에 LLM_API_KEY가 설정되지 않았습니다. .env 를 확인하세요." });
    const { cid, affinity, history } = req.body || {};
    if (!PERSONA[cid]) return res.status(400).json({ error: "알 수 없는 캐릭터입니다." });

    const hist = (Array.isArray(history) ? history : []).slice(-10)
      .map(m => ({ from: m && m.from === "me" ? "me" : "him", text: String((m && m.text) || "").slice(0, 500) }));
    const sys = systemPrompt(cid, affinity);

    let reply;
    if (PROVIDER === "gemini") {
      const contents = hist.map(m => ({ role: m.from === "me" ? "user" : "model", parts: [{ text: m.text }] }));
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.9, maxOutputTokens: 120 } })
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d.error && d.error.message) || "Gemini error");
      reply = (d.candidates?.[0]?.content?.parts || []).map(p => p.text).join(" ").trim();
    } else {
      const messages = [{ role: "system", content: sys }];
      hist.forEach(m => messages.push({ role: m.from === "me" ? "user" : "assistant", content: m.text }));
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + API_KEY },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.9, max_tokens: 120 })
      });
      const d = await r.json();
      if (!r.ok) throw new Error((d.error && d.error.message) || "OpenAI error");
      reply = d.choices?.[0]?.message?.content?.trim() || "";
    }
    res.json({ reply });
  } catch (e) {
    console.error("[/api/dm]", e.message);
    res.status(502).json({ error: e.message });
  }
});

/* --- 정적 파일 서빙 (게임 HTML + assets) --- */
app.use(express.static(__dirname));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "campus_romance.html")));

app.listen(PORT, () => {
  console.log(`▶  http://localhost:${PORT}`);
  console.log(`   provider=${PROVIDER}  model=${MODEL}  key=${API_KEY ? "설정됨 ✓" : "없음 ✗ (.env 확인)"}`);
});
