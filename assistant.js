/* Ойбот — OYAN · 218 Robotics сайтының дауыстық AI-көмекшісі.
 * Қосу: <script src="assistant.js" data-url="https://....supabase.co" data-key="sb_publishable_..." defer></script>
 * Дауысты тану: Web Speech API (Chrome, Edge). Дауыспен оқу: браузердің speechSynthesis.
 * Қазақша табиғи дауыс Microsoft Edge-де бар (Aigul, Daulet). Chrome-да қазақ дауысы болмаса, орыс дауысымен оқиды.
 */
(() => {
  const me = document.currentScript;
  const SUPABASE_URL = me?.dataset.url || "https://vefpwvirxdeswutrhpqs.supabase.co";
  const KEY = me?.dataset.key || "";
  const ASK_URL = SUPABASE_URL + "/functions/v1/ask";
  const TTS_URL = SUPABASE_URL + "/functions/v1/tts";

  const LANGS = {
    kk: { voiceLoad: "Дауыс жүктелуде…", code: "kk-KZ", label: "ҚАЗ", name: "Ойбот", open: "Ойботпен сөйлесу", hello: "Сәлем! Мен Ойботпын, OYAN командасының көмекшісімін. Команда, жоба, робот немесе датчиктер туралы сұраңыз.",
          placeholder: "Сұрағыңызды жазыңыз…", listen: "Тыңдап тұрмын…", think: "Ойланып жатырмын…", speak: "Сөйлеп тұрмын", idle: "Сұрақ қойыңыз",
          noMic: "Дауыспен сұрау үшін Chrome немесе Edge браузерін қолданыңыз.", denied: "Микрофонға рұқсат беріңіз (адрес жолағындағы құлып белгісі).",
          err: "Кешіріңіз, қазір жауап бере алмадым. Сәлден соң қайталап көріңіз.",
          chips: ["OYAN командасы туралы айтып бер", "Сіздің жобаңыз не туралы?", "Қазір температура қанша?", "Робот қалай жұмыс істейді?"] },
    ru: { voiceLoad: "Загружаю голос…", code: "ru-RU", label: "РУС", name: "Ойбот", open: "Поговорить с Ойботом", hello: "Привет! Я Ойбот, помощник команды OYAN. Спросите о команде, проекте, роботе или датчиках.",
          placeholder: "Напишите вопрос…", listen: "Слушаю…", think: "Думаю…", speak: "Говорю", idle: "Задайте вопрос",
          noMic: "Для голосового ввода откройте сайт в Chrome или Edge.", denied: "Разрешите доступ к микрофону (значок замка в адресной строке).",
          err: "Извините, сейчас не получилось ответить. Попробуйте чуть позже.",
          chips: ["Расскажи о команде OYAN", "О чём ваш проект?", "Какая сейчас температура?", "Как устроен робот?"] },
    en: { voiceLoad: "Loading voice…", code: "en-US", label: "ENG", name: "Oybot", open: "Talk to Oybot", hello: "Hi! I'm Oybot, the OYAN team assistant. Ask me about the team, the project, the robot or the sensors.",
          placeholder: "Type your question…", listen: "Listening…", think: "Thinking…", speak: "Speaking", idle: "Ask me anything",
          noMic: "Voice input works in Chrome or Edge.", denied: "Please allow microphone access (lock icon in the address bar).",
          err: "Sorry, I couldn't answer right now. Please try again shortly.",
          chips: ["Tell me about team OYAN", "What is your project about?", "What's the temperature now?", "How does the robot work?"] },
  };

  // Тіл сайтпен ортақ: index.html/monitor.html тіл ауыстырғышы "oyan-lang" кілтін және "oyan:lang" оқиғасын қолданады
  let lang = "kk";
  try { lang = localStorage.getItem("oyan-lang") || localStorage.getItem("oybot-lang") || "kk"; } catch {}
  if (!["kk", "ru", "en"].includes(lang)) lang = "kk";
  let soundOn = true;
  try { soundOn = localStorage.getItem("oybot-sound") !== "off"; } catch {}
  const history = [];
  let greeted = false, busy = false, recognizing = false, recog = null;

  // ---------- Стиль ----------
  const css = `
  .oyb-fab{position:fixed;right:20px;bottom:20px;z-index:9999;width:68px;height:68px;border-radius:50%;border:2px solid #d8b46a;background:#0e302a;cursor:pointer;padding:6px;box-shadow:0 8px 28px #0008;transition:transform .2s}
  .oyb-fab:hover{transform:scale(1.06)}.oyb-fab:focus-visible,.oyb-panel button:focus-visible,.oyb-panel input:focus-visible{outline:2px solid #d8b46a;outline-offset:2px}
  .oyb-fab .oyb-badge{position:absolute;top:-6px;left:-8px;background:#d8b46a;color:#0a2622;font:700 11px/1 system-ui,sans-serif;padding:5px 7px;border-radius:999px;white-space:nowrap}
  .oyb-panel{position:fixed;right:20px;bottom:20px;z-index:10000;width:min(400px,calc(100vw - 24px));height:min(640px,calc(100vh - 40px));display:none;flex-direction:column;background:#0b2723;color:#eef4ec;border:1px solid #24524a;border-radius:22px;box-shadow:0 20px 60px #000a;overflow:hidden;font:15px/1.5 "PT Sans","Segoe UI",Roboto,Arial,sans-serif}
  .oyb-panel.open{display:flex}
  .oyb-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid #24524a}
  .oyb-name{font:800 14px "Unbounded","Arial Black",sans-serif;color:#d8b46a;letter-spacing:.02em}
  .oyb-tools{display:flex;gap:4px;align-items:center}
  .oyb-tools button{background:transparent;border:1px solid #24524a;color:#a3bdb3;border-radius:8px;padding:4px 7px;font:700 11px system-ui,sans-serif;cursor:pointer}
  .oyb-tools button[aria-pressed="true"]{background:#d8b46a;color:#0a2622;border-color:#d8b46a}
  .oyb-stage{display:grid;justify-items:center;gap:4px;padding:12px 12px 6px;background:radial-gradient(circle at 50% 40%,#16493f 0,transparent 65%)}
  .oyb-stage svg{width:150px;height:150px;overflow:visible}
  .oyb-status{font-size:13px;color:#a3bdb3;min-height:20px;text-align:center}
  .oyb-log{flex:1;overflow-y:auto;padding:8px 12px;display:flex;flex-direction:column;gap:8px}
  .oyb-msg{max-width:88%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;font-size:14px}
  .oyb-msg.u{align-self:flex-end;background:#1c4a40;border:1px solid #2f6b5d}
  .oyb-msg.b{align-self:flex-start;background:#123a33;border:1px solid #24524a}
  .oyb-msg.e{align-self:flex-start;background:#3a1d1d;border:1px solid #6b3d3d;color:#ffc4c4}
  .oyb-chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 8px}
  .oyb-chips button{background:#0e302a;border:1px solid #24524a;color:#a3bdb3;border-radius:999px;padding:5px 10px;font:12px inherit;cursor:pointer}
  .oyb-chips button:hover{color:#eef4ec;border-color:#d8b46a}
  .oyb-bar{display:flex;gap:8px;align-items:center;padding:10px 12px;border-top:1px solid #24524a}
  .oyb-bar input{flex:1;min-width:0;background:#0a2622;border:1px solid #24524a;border-radius:12px;padding:10px 12px;color:#eef4ec;font:inherit}
  .oyb-mic{flex:none;width:46px;height:46px;border-radius:50%;border:0;background:#d8b46a;color:#0a2622;cursor:pointer;display:grid;place-items:center}
  .oyb-mic.on{background:#7fe0ad;animation:oyb-pulse 1.2s infinite}
  .oyb-send{flex:none;border:1px solid #24524a;background:#123a33;color:#eef4ec;border-radius:12px;padding:10px 12px;cursor:pointer;font:700 13px inherit}
  .oyb-mic:disabled,.oyb-send:disabled{opacity:.45;cursor:default;animation:none}
  @keyframes oyb-pulse{0%{box-shadow:0 0 0 0 #7fe0ad88}100%{box-shadow:0 0 0 14px #7fe0ad00}}
  /* робот анимациясы */
  .oyb-eye{transform-box:fill-box;transform-origin:center;animation:oyb-blink 5s infinite}
  @keyframes oyb-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
  .oyb-mouth rect{transform-box:fill-box;transform-origin:center;transform:scaleY(.25);transition:transform .12s}
  [data-state="speaking"] .oyb-mouth rect{animation:oyb-talk .38s infinite alternate}
  [data-state="speaking"] .oyb-mouth rect:nth-child(2){animation-delay:.1s}[data-state="speaking"] .oyb-mouth rect:nth-child(3){animation-delay:.2s}[data-state="speaking"] .oyb-mouth rect:nth-child(4){animation-delay:.05s}
  @keyframes oyb-talk{from{transform:scaleY(.25)}to{transform:scaleY(1)}}
  .oyb-stage.lipsync[data-state="speaking"] .oyb-mouth rect{animation:none;transition:transform .06s}
  .oyb-ring{opacity:0;transition:opacity .3s}
  [data-state="listening"] .oyb-ring{opacity:1;animation:oyb-ring 1.4s infinite}
  @keyframes oyb-ring{0%{transform:scale(.92);opacity:.9}100%{transform:scale(1.12);opacity:0}}
  .oyb-ring{transform-box:fill-box;transform-origin:center}
  .oyb-antenna{transition:fill .3s}
  [data-state="thinking"] .oyb-antenna{animation:oyb-think .7s infinite alternate}
  [data-state="listening"] .oyb-antenna{fill:#7fe0ad}
  @keyframes oyb-think{from{fill:#d8b46a}to{fill:#7fe0ad}}
  [data-state="thinking"] .oyb-pupils{transform:translateY(-3px)}
  .oyb-pupils{transition:transform .3s}
  .oyb-float{animation:oyb-float 4s ease-in-out infinite}
  @keyframes oyb-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @media (prefers-reduced-motion:reduce){.oyb-panel *, .oyb-fab *{animation:none!important;transition:none!important}}
  @media (max-width:480px){.oyb-panel{right:8px;bottom:8px;height:calc(100vh - 16px)}.oyb-stage svg{width:110px;height:110px}}
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- Робот (SVG) ----------
  const robotSVG = (small) => `
  <svg viewBox="0 0 160 160" aria-hidden="true">
    <circle class="oyb-ring" cx="80" cy="86" r="70" fill="none" stroke="#7fe0ad" stroke-width="3"/>
    <g class="${small ? "" : "oyb-float"}">
      <line x1="80" y1="22" x2="80" y2="40" stroke="#d8b46a" stroke-width="4" stroke-linecap="round"/>
      <circle class="oyb-antenna" cx="80" cy="18" r="7" fill="#d8b46a"/>
      <rect x="38" y="62" width="10" height="34" rx="5" fill="#24524a"/>
      <rect x="112" y="62" width="10" height="34" rx="5" fill="#24524a"/>
      <rect x="44" y="40" width="72" height="80" rx="24" fill="#d8b46a"/>
      <rect x="52" y="52" width="56" height="44" rx="16" fill="#0a2622"/>
      <g class="oyb-pupils">
        <ellipse class="oyb-eye" cx="68" cy="72" rx="7" ry="9" fill="#7fe0ad"/>
        <ellipse class="oyb-eye" cx="92" cy="72" rx="7" ry="9" fill="#7fe0ad"/>
      </g>
      <g class="oyb-mouth">
        <rect x="64" y="102" width="5" height="12" rx="2.5" fill="#0a2622"/>
        <rect x="72" y="102" width="5" height="12" rx="2.5" fill="#0a2622"/>
        <rect x="80" y="102" width="5" height="12" rx="2.5" fill="#0a2622"/>
        <rect x="88" y="102" width="5" height="12" rx="2.5" fill="#0a2622"/>
      </g>
      <rect x="58" y="124" width="44" height="14" rx="7" fill="#24524a"/>
      <text x="80" y="134.5" text-anchor="middle" font-family="Unbounded,Arial Black,sans-serif" font-size="8" font-weight="800" fill="#d8b46a">OYAN</text>
    </g>
  </svg>`;

  // ---------- Интерфейс ----------
  const fab = document.createElement("button");
  fab.className = "oyb-fab"; fab.type = "button"; fab.setAttribute("aria-label", "Ойботпен сөйлесу");
  fab.innerHTML = `<span class="oyb-badge">Ойбот</span>${robotSVG(true)}`;

  const panel = document.createElement("section");
  panel.className = "oyb-panel"; panel.setAttribute("aria-label", "Ойбот — дауыстық көмекші");
  panel.innerHTML = `
    <div class="oyb-top">
      <span class="oyb-name">ОЙБОТ · AI</span>
      <div class="oyb-tools">
        ${Object.entries(LANGS).map(([k, v]) => `<button type="button" data-lang="${k}" aria-pressed="${k === lang}">${v.label}</button>`).join("")}
        <button type="button" class="oyb-sound" aria-pressed="${soundOn}" title="Дыбыс">🔊</button>
        <button type="button" class="oyb-close" aria-label="Жабу">✕</button>
      </div>
    </div>
    <div class="oyb-stage" data-state="idle">${robotSVG(false)}<div class="oyb-status" aria-live="polite"></div></div>
    <div class="oyb-log" aria-live="polite"></div>
    <div class="oyb-chips"></div>
    <form class="oyb-bar">
      <button type="button" class="oyb-mic" aria-label="Дауыспен сұрау">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z"/></svg>
      </button>
      <input type="text" maxlength="1000" autocomplete="off" aria-label="Сұрақ">
      <button type="submit" class="oyb-send">➤</button>
    </form>`;
  document.body.append(fab, panel);

  const $ = (s) => panel.querySelector(s);
  const stage = $(".oyb-stage"), statusEl = $(".oyb-status"), log = $(".oyb-log"), input = $(".oyb-bar input");
  const micBtn = $(".oyb-mic"), sendBtn = $(".oyb-send"), chips = $(".oyb-chips");
  const T = () => LANGS[lang];

  function setState(s) {
    stage.dataset.state = s;
    statusEl.textContent = { idle: T().idle, listening: T().listen, thinking: T().think, speaking: T().speak }[s] || "";
  }
  function addMsg(text, cls) {
    const el = document.createElement("div");
    el.className = "oyb-msg " + cls; el.textContent = text;
    log.appendChild(el); log.scrollTop = log.scrollHeight;
    return el;
  }
  function renderLang() {
    panel.querySelectorAll("[data-lang]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lang === lang));
    input.placeholder = T().placeholder;
    fab.querySelector(".oyb-badge").textContent = T().name;
    fab.setAttribute("aria-label", T().open);
    panel.querySelector(".oyb-name").textContent = T().name.toUpperCase() + " · AI";
    chips.innerHTML = "";
    T().chips.forEach(q => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = q;
      b.onclick = () => ask(q); chips.appendChild(b);
    });
    if (recog) recog.lang = T().code;
    setState(stage.dataset.state || "idle");
  }

  // ---------- Дауыспен оқу (TTS) ----------
  // 1) Сервердегі табиғи нейрон дауыс (Azure, "tts" функциясы) — таза қазақ/орыс/ағылшын дауысы.
  // 2) Ол қосылмаған болса — браузердің өз дауысы (сапасы төмен).
  const synth = window.speechSynthesis;
  let voices = [];
  const loadVoices = () => { voices = synth ? synth.getVoices() : []; };
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }
  let serverTTS = null;          // null = әлі белгісіз, false = қосылмаған
  let audioEl = null, audioCtx = null, analyser = null, rafId = 0, speakToken = 0;
  const mouthRects = () => stage.querySelectorAll(".oyb-mouth rect");


  // ---------- Piper: браузердің ішінде жұмыс істейтін тегін нейрон дауыс ----------
  // Модельдер бір рет жүктеліп, браузердің Cache Storage-інде сақталады (келесі жолы бірден).
  const PIPER = {
    models: "https://huggingface.co/diffusionstudio/piper-voices/resolve/main",
    ort: "https://cdnjs.cloudflare.com/ajax/libs/onnxruntime-web/1.18.0/",
    phonemizer: "https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/piper-DeOu3H9E.js",
    phonemizerFiles: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize",
    // Дауыстар: қазақшасы — IS2AI issai (high, 6 дикторлы), орысшасы — Dmitri, ағылшыншасы — Ryan
    voices: {
      kk: { path: "kk/kk_KZ/issai/high/kk_KZ-issai-high.onnx", speaker: 0 },
      ru: { path: "ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx", speaker: 0 },
      en: { path: "en/en_US/ryan/medium/en_US-ryan-medium.onnx", speaker: 0 },
    },
    cache: "oybot-piper-v1",
  };
  const piperState = { sessions: {}, configs: {}, loading: {}, progress: {}, phon: null, failed: false };
  // Мобильді трафикті үнемдеу режимінде 128 MB модельді жүктемейміз
  const piperSupported = () => typeof WebAssembly === "object" && "caches" in window && !piperState.failed &&
    !(navigator.connection && navigator.connection.saveData);

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error("load " + src));
      document.head.appendChild(el);
    });
  }
  async function cachedFetch(url, onProgress) {
    const cache = await caches.open(PIPER.cache);
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
    const r = await fetch(url);
    if (!r.ok) throw new Error("download " + r.status);
    const total = +r.headers.get("content-length") || 0;
    const reader = r.body.getReader(); const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      if (onProgress && total) onProgress(got / total);
    }
    const blob = new Blob(chunks);
    try { await cache.put(url, new Response(blob)); } catch (e) { console.warn("Ойбот: кэшке сақталмады", e); }
    return blob.arrayBuffer();
  }
  async function piperLoad(l) {
    if (piperState.sessions[l]) return;
    if (piperState.loading[l]) return piperState.loading[l];
    piperState.loading[l] = (async () => {
      await loadScript(PIPER.ort + "ort.min.js");
      ort.env.wasm.wasmPaths = PIPER.ort;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      piperState.phon = piperState.phon || await import(PIPER.phonemizer);
      const v = PIPER.voices[l], url = `${PIPER.models}/${v.path}`;
      const cfg = JSON.parse(new TextDecoder().decode(await cachedFetch(url + ".json")));
      const model = await cachedFetch(url, (f) => { piperState.progress[l] = f; if (l === lang && stage.dataset.state !== "speaking") statusEl.textContent = `${T().voiceLoad} ${Math.round(f * 100)}%`; });
      piperState.sessions[l] = await ort.InferenceSession.create(model);
      piperState.configs[l] = cfg;
      if (stage.dataset.state === "idle") setState("idle");
    })().catch((e) => { console.warn("Ойбот: Piper жүктелмеді", e); piperState.loading[l] = null; throw e; });
    return piperState.loading[l];
  }
  function phonemize(text, espeakVoice) {
    return new Promise(async (res, rej) => {
      try {
        (await piperState.phon.createPiperPhonemize({
          print: (line) => res(JSON.parse(line).phoneme_ids),
          printErr: (line) => rej(new Error(line)),
          locateFile: (f) => f.endsWith(".wasm") ? PIPER.phonemizerFiles + ".wasm" : f.endsWith(".data") ? PIPER.phonemizerFiles + ".data" : f,
        })).callMain(["-l", espeakVoice, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]);
      } catch (e) { rej(e); }
    });
  }
  async function piperSynth(l, text) {
    const cfg = piperState.configs[l], session = piperState.sessions[l];
    const ids = await phonemize(text, cfg.espeak.voice);
    const feeds = {
      input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)])),
      scales: new ort.Tensor("float32", Float32Array.from([cfg.inference.noise_scale, cfg.inference.length_scale, cfg.inference.noise_w])),
    };
    if (cfg.num_speakers > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([BigInt(PIPER.voices[l].speaker)]));
    const out = await session.run(feeds);
    return { samples: out.output.data, rate: cfg.audio.sample_rate };
  }
  async function speakPiper(text, token) {
    const l = lang;
    await piperLoad(l);
    if (token !== speakToken) return;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 64; analyser.connect(audioCtx.destination);
    stage.classList.add("lipsync");
    const sentences = text.match(/[^.!?…]+[.!?…]*/g)?.map((x) => x.trim()).filter(Boolean) || [text];
    let when = audioCtx.currentTime + 0.05, started = false, last = null;
    for (const sentence of sentences) {
      if (token !== speakToken) return;
      const { samples, rate } = await piperSynth(l, sentence);
      if (token !== speakToken) return;
      const buf = audioCtx.createBuffer(1, samples.length, rate);
      buf.copyToChannel(samples instanceof Float32Array ? samples : Float32Array.from(samples), 0);
      const src = audioCtx.createBufferSource(); src.buffer = buf; src.connect(analyser);
      when = Math.max(when, audioCtx.currentTime + 0.02);
      src.start(when); when += buf.duration + 0.12;
      piperSources.push(src); last = src;
      if (!started) { started = true; setState("speaking"); lipSync(); }
    }
    if (last) last.onended = () => { if (token === speakToken) { cancelAnimationFrame(rafId); stage.classList.remove("lipsync"); setState("idle"); } };
  }
  const piperSources = [];
  const hasNaturalBrowserVoice = () => !!voices.find((v) => v.lang.toLowerCase().startsWith(lang) && /natural/i.test(v.name));

  function pickVoice() {
    const want = lang === "kk" ? ["kk", "ru"] : [lang];
    for (const w of want) {
      const list = voices.filter(v => v.lang.toLowerCase().startsWith(w));
      const best = list.find(v => /natural|online|google/i.test(v.name)) || list[0];
      if (best) return best;
    }
    return null;
  }
  function cleanForSpeech(t) {
    return t.replace(/https?:\/\/\S+/g, "").replace(/[*_#`>|]/g, "").replace(/\s+/g, " ").trim();
  }
  function stopSpeaking() {
    speakToken++;
    if (synth) synth.cancel();
    if (audioEl) { audioEl.pause(); audioEl.src = ""; audioEl = null; }
    while (piperSources.length) { try { piperSources.pop().stop(); } catch {} }
    cancelAnimationFrame(rafId);
    stage.classList.remove("lipsync");
    mouthRects().forEach(r => r.style.transform = "");
  }
  function lipSync() {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const rects = mouthRects();
    const tick = () => {
      analyser.getByteFrequencyData(data);
      rects.forEach((r, i) => {
        const band = data.slice(2 + i * 6, 8 + i * 6);
        const lvl = band.reduce((a, b) => a + b, 0) / band.length / 255;
        r.style.transform = `scaleY(${(0.2 + Math.min(1, lvl * 1.6) * 0.8).toFixed(2)})`;
      });
      rafId = requestAnimationFrame(tick);
    };
    tick();
  }
  async function speakServer(text, token) {
    const r = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY },
      body: JSON.stringify({ text, lang }),
    });
    if (r.status === 503) { serverTTS = false; throw new Error("tts off"); }
    if (!r.ok) throw new Error("tts " + r.status);
    const blob = await r.blob();
    if (token !== speakToken) return;
    serverTTS = true;
    audioEl = new Audio(URL.createObjectURL(blob));
    audioEl.crossOrigin = "anonymous";
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") await audioCtx.resume();
      const src = audioCtx.createMediaElementSource(audioEl);
      analyser = audioCtx.createAnalyser(); analyser.fftSize = 64;
      src.connect(analyser); analyser.connect(audioCtx.destination);
      stage.classList.add("lipsync");
    } catch { analyser = null; }
    audioEl.onplay = () => { setState("speaking"); lipSync(); };
    audioEl.onended = audioEl.onerror = () => { cancelAnimationFrame(rafId); stage.classList.remove("lipsync"); setState("idle"); };
    await audioEl.play();
  }
  function speakBrowser(text) {
    if (!synth) { setState("idle"); return; }
    const voice = pickVoice();
    const parts = cleanForSpeech(text).match(/[^.!?]+[.!?]*/g) || [text];
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim());
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = T().code;
      if (i === 0) u.onstart = () => setState("speaking");
      if (i === parts.length - 1) { u.onend = () => setState("idle"); u.onerror = () => setState("idle"); }
      synth.speak(u);
    });
  }
  async function speak(text) {
    stopSpeaking();
    if (!soundOn) { setState("idle"); return; }
    const token = speakToken;
    const clean = cleanForSpeech(text);
    // 1) Azure (кілт қосылса)  2) браузердің табиғи дауысы (Edge)  3) Piper  4) браузердің қарапайым дауысы
    if (serverTTS !== false) {
      try { await speakServer(clean, token); return; }
      catch (e) { console.info("Ойбот: сервер дауысы жоқ.", e.message); }
    }
    if (token !== speakToken) return;
    if (!hasNaturalBrowserVoice() && piperSupported()) {
      if (piperState.sessions[lang]) {
        try { await speakPiper(clean, token); return; }
        catch (e) { console.warn("Ойбот: Piper қатесі", e); }
      } else {
        piperLoad(lang).catch(() => {});   // модель фонда жүктеле берсін, әзірге браузер дауысы
      }
    }
    if (token === speakToken) speakBrowser(text);
  }

  // ---------- Дауысты тану (STT) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    recog = new SR();
    recog.lang = T().code; recog.interimResults = true; recog.maxAlternatives = 1; recog.continuous = false;
    let finalText = "";
    recog.onstart = () => { recognizing = true; finalText = ""; micBtn.classList.add("on"); setState("listening"); };
    recog.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      input.value = (finalText + interim).trim();
    };
    recog.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") addMsg(T().denied, "e");
    };
    recog.onend = () => {
      recognizing = false; micBtn.classList.remove("on");
      const q = (finalText || input.value).trim();
      if (q) ask(q); else setState("idle");
    };
  }
  micBtn.onclick = () => {
    if (!recog) { addMsg(T().noMic, "e"); return; }
    if (recognizing) { recog.stop(); return; }
    stopSpeaking();
    try { recog.lang = T().code; recog.start(); } catch {}
  };

  // ---------- Сұрақ жіберу ----------
  async function ask(question) {
    question = String(question || "").trim();
    if (!question || busy) return;
    busy = true; micBtn.disabled = sendBtn.disabled = true;
    stopSpeaking();
    addMsg(question, "u"); input.value = "";
    setState("thinking");
    try {
      const r = await fetch(ASK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY },
        body: JSON.stringify({ question, history: history.slice(-10), mode: soundOn ? "voice" : "text", lang }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.answer) throw new Error(data.error || "HTTP " + r.status);
      addMsg(data.answer, "b");
      history.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
      speak(data.answer);
    } catch (e) {
      console.warn("Ойбот:", e);
      addMsg(T().err, "e"); setState("idle");
    } finally {
      busy = false; micBtn.disabled = sendBtn.disabled = false;
    }
  }
  $(".oyb-bar").addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });

  // ---------- Ашу/жабу, тіл, дыбыс ----------
  function open() {
    panel.classList.add("open"); fab.style.display = "none";
    if (!greeted) { greeted = true; addMsg(T().hello, "b"); speak(T().hello); }
    prefetchVoice();
    input.focus();
  }
  function close() {
    panel.classList.remove("open"); fab.style.display = "";
    stopSpeaking(); if (recognizing) recog.stop(); setState("idle");
  }
  fab.onclick = open;
  $(".oyb-close").onclick = close;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) close(); });
  function setLang(l) {
    if (!LANGS[l] || l === lang) return;
    lang = l; stopSpeaking(); setState("idle");
    try { localStorage.setItem("oyan-lang", lang); } catch {}
    renderLang();
    if (panel.classList.contains("open")) prefetchVoice();
  }
  function prefetchVoice() {
    if (soundOn && serverTTS !== true && !hasNaturalBrowserVoice() && piperSupported()) piperLoad(lang).catch(() => {});
  }
  panel.querySelectorAll("[data-lang]").forEach(b => b.onclick = () => {
    // Сайттың тіл ауыстырғышы болса, бүкіл сайтты ауыстырамыз; ол "oyan:lang" оқиғасы арқылы Ойботқа қайтады
    if (window.OyanI18n) window.OyanI18n.setLang(b.dataset.lang); else setLang(b.dataset.lang);
  });
  document.addEventListener("oyan:lang", (e) => setLang(e.detail));
  $(".oyb-sound").onclick = (e) => {
    soundOn = !soundOn; e.currentTarget.setAttribute("aria-pressed", soundOn);
    try { localStorage.setItem("oybot-sound", soundOn ? "on" : "off"); } catch {}
    if (!soundOn) { stopSpeaking(); setState("idle"); }
  };
  window.Oybot = { open, close, ask, setLang, debug: { piperLoad, piperSynth, piperState, speak } };

  renderLang(); setState("idle");
})();
