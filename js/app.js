/* ============================================================
 * 火眼金睛 · 安全隐患大排查  —  游戏逻辑
 * ============================================================ */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const SVG_NS = "http://www.w3.org/2000/svg";
  const D = GAME_DATA;

  /* ---------------- 音效（WebAudio，无外部资源） ---------------- */
  const Sound = {
    ctx: null,
    ensure() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* 无声环境 */ }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        try { this.ctx.resume().catch(() => {}); } catch (e) { /* 忽略 */ }
      }
    },
    tone(freq, dur, type, gain, delay) {
      if (state.muted) return;
      this.ensure();
      if (!this.ctx) return;
      const t = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.05);
    },
    correct() { this.tone(660, 0.12, "sine", 0.18); this.tone(880, 0.16, "sine", 0.18, 0.1); },
    wrong()   { this.tone(180, 0.2, "sawtooth", 0.1); },
    hint()    { this.tone(520, 0.1, "triangle", 0.1); this.tone(660, 0.12, "triangle", 0.1, 0.1); },
    tick()    { this.tone(1150, 0.05, "square", 0.04); },
    sceneDone() { this.tone(587, 0.12, "triangle", 0.14); this.tone(784, 0.22, "triangle", 0.14, 0.12); },
    win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.15, i * 0.13)); }
  };

  /* ---------------- 元素 ---------------- */
  const screens = { cover: $("#screen-cover"), play: $("#screen-play"), final: $("#screen-final") };
  const panels = {
    intro: $("#panel-intro"), card: $("#panel-card"), summary: $("#panel-summary"),
    quiz: $("#panel-quiz"), recap: $("#panel-recap")
  };
  const hud = {
    scene: $("#hud-scene"), found: $("#hud-found"), score: $("#hud-score"),
    bar: $("#timer-bar"), hint: $("#btn-hint"), mute: $("#btn-mute")
  };

  /* ---------------- 状态 ---------------- */
  const state = {
    sceneIdx: 0,
    completedTotal: 0,   // 已完成场景的得分之和
    partial: 0,          // 当前场景临时得分
    found: new Set(),
    wrongCount: 0,
    hintsUsed: 0,
    hintsLeft: D.HINT_MAX,
    timeLeft: 0,
    timerId: null,
    paused: false,
    quizIdx: 0,
    quizCorrect: 0,
    sceneResults: [],
    muted: localStorage.getItem("hh_mute") === "1"
  };

  /* ---------------- 工具 ---------------- */
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }
  function showScreen(name) {
    Object.keys(screens).forEach((k) => { if (k !== name) hide(screens[k]); });
    show(screens[name]);
  }
  function closeAllPanels() { Object.keys(panels).forEach((k) => hide(panels[k])); }

  function svgPoint(svg, clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  function currentScene() { return D.scenes[state.sceneIdx]; }
  function currentSvg() { return $("#scene-" + currentScene().id); }

  /* ---------------- 命中点注入 ---------------- */
  function injectHits() {
    D.scenes.forEach((scene) => {
      const svg = $("#scene-" + scene.id);
      const layer = svg.querySelector(".overlay-layer");
      scene.hazards.forEach((h) => {
        const c = document.createElementNS(SVG_NS, "circle");
        c.setAttribute("cx", h.x); c.setAttribute("cy", h.y);
        c.setAttribute("r", h.r);
        c.setAttribute("class", "hit");
        c.dataset.hid = h.id;
        c.dataset.r = h.r;
        layer.appendChild(c);
      });
    });
    applyHitScale();
    window.addEventListener("resize", applyHitScale);
  }

  /* 小屏（手机）放大命中圈，保证触控友好 */
  function applyHitScale() {
    const scale = window.innerWidth < 560 ? 1.35 : 1;
    document.querySelectorAll(".hit").forEach((c) => {
      c.setAttribute("r", Math.round(Number(c.dataset.r) * scale));
    });
  }

  function appendSvgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  /* ---------------- HUD ---------------- */
  function clamp0(n) { return Math.max(0, n); }
  function updateHud() {
    const sc = currentScene();
    hud.scene.textContent = "场景 " + (state.sceneIdx + 1) + "/" + D.scenes.length + " · " + sc.name;
    hud.found.textContent = "🔍 " + state.found.size + "/" + sc.hazards.length;
    hud.score.textContent = clamp0(state.completedTotal + state.partial) + " 分";
    hud.hint.textContent = "💡提示×" + state.hintsLeft;
    hud.hint.disabled = state.hintsLeft <= 0;
    hud.mute.textContent = state.muted ? "🔇" : "🔊";
  }
  function updateTimerBar() {
    const total = currentScene().time;
    hud.bar.style.width = (state.timeLeft / total * 100) + "%";
    hud.bar.classList.toggle("danger", state.timeLeft <= 15);
  }

  /* ---------------- 计时 ---------------- */
  function startTimer() {
    stopTimer();
    state.timerId = setInterval(() => {
      if (state.paused) return;
      state.timeLeft--;
      updateTimerBar();
      if (state.timeLeft <= 10 && state.timeLeft > 0) Sound.tick();
      if (state.timeLeft <= 0) endScene();
    }, 1000);
  }
  function stopTimer() {
    if (state.timerId) { clearInterval(state.timerId); state.timerId = null; }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.timerId && !state.paused) {
      state.paused = true;
      state._autoPaused = true;
    } else if (!document.hidden && state._autoPaused) {
      state.paused = false;
      state._autoPaused = false;
    }
  });

  /* ---------------- 流程 ---------------- */
  function startGame() {
    state.sceneIdx = 0;
    state.completedTotal = 0;
    state.sceneResults = [];
    showScreen("play");
    showScene(0);
  }

  function showScene(i) {
    state.sceneIdx = i;
    const sc = currentScene();
    state.found = new Set();
    state.wrongCount = 0;
    state.hintsUsed = 0;
    state.hintsLeft = D.HINT_MAX;
    state.partial = 0;
    state.timeLeft = sc.time;
    state.paused = false;

    document.querySelectorAll(".scene-svg").forEach((s) => hide(s));
    show(currentSvg());
    // 清除上一轮的标记
    const layer = currentSvg().querySelector(".overlay-layer");
    layer.querySelectorAll(".found-ring,.found-check,.hint-ring,.float-text,.float-good,.float-dup").forEach((n) => n.remove());

    updateHud();
    updateTimerBar();

    $("#intro-tag").textContent = "场景 " + (i + 1) + "/" + D.scenes.length;
    $("#intro-title").textContent = sc.name;
    $("#intro-text").textContent = sc.intro;
    closeAllPanels();
    show(panels.intro);
  }

  function beginPlay() {
    hide(panels.intro);
    state.paused = false;
    startTimer();
  }

  function showCard(h) {
    state.paused = true;
    $("#card-name").textContent = h.name;
    $("#card-danger").textContent = h.danger;
    $("#card-fix").textContent = h.fix;
    show(panels.card);
  }

  function markFound(h, svg, layer) {
    state.found.add(h.id);
    state.partial += D.HAZARD_SCORE;

    layer.appendChild(appendSvgEl("circle", {
      cx: h.x, cy: h.y, r: h.r + 6, class: "found-ring"
    }));
    // 对勾徽章
    const bx = Math.min(h.x + h.r * 0.72, 960);
    const by = Math.max(h.y - h.r * 0.72, 40);
    const g = appendSvgEl("g", { class: "found-check", transform: "translate(" + bx + " " + by + ")" });
    g.appendChild(appendSvgEl("circle", { cx: 0, cy: 0, r: 15, fill: "#2f9e5f", stroke: "#fff", "stroke-width": 3 }));
    g.appendChild(appendSvgEl("path", { d: "M-6 0 L-1 6 L7 -6", stroke: "#fff", "stroke-width": 3.5, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }));
    layer.appendChild(g);

    const t = appendSvgEl("text", { x: h.x, y: h.y - h.r - 12, class: "float-good", "text-anchor": "middle" });
    t.textContent = "+" + D.HAZARD_SCORE + "分";
    layer.appendChild(t);

    Sound.correct();
    updateHud();

    if (state.found.size === currentScene().hazards.length) {
      state.paused = true;
      stopTimer();
      setTimeout(() => endScene(true), 650);
    } else {
      showCard(h);
    }
  }

  function wrongTap(svg, layer, clientX, clientY) {
    state.wrongCount++;
    state.partial -= D.WRONG_COST;
    const p = svgPoint(svg, clientX, clientY);
    const t = appendSvgEl("text", { x: p.x, y: p.y, class: "float-text", "text-anchor": "middle" });
    t.textContent = "−" + D.WRONG_COST + "分";
    layer.appendChild(t);
    setTimeout(() => t.remove(), 1000);
    svg.classList.remove("shake");
    void svg.offsetWidth;
    svg.classList.add("shake");
    Sound.wrong();
    updateHud();
  }

  function useHint() {
    if (state.hintsLeft <= 0 || state.paused) return;
    const sc = currentScene();
    const remaining = sc.hazards.filter((h) => !state.found.has(h.id));
    if (!remaining.length) return;
    state.hintsUsed++;
    state.hintsLeft = D.HINT_MAX - state.hintsUsed;
    state.partial -= D.HINT_COST;
    const target = remaining[Math.floor(Math.random() * remaining.length)];
    const layer = currentSvg().querySelector(".overlay-layer");
    const ring = appendSvgEl("circle", { cx: target.x, cy: target.y, r: target.r + 8, class: "hint-ring" });
    layer.appendChild(ring);
    setTimeout(() => ring.remove(), 2200);
    Sound.hint();
    updateHud();
  }

  function endScene(foundAll) {
    stopTimer();
    state.paused = true;
    Sound.sceneDone();
    const sc = currentScene();

    $("#summary-tag").textContent = "场景小结 · " + sc.name;
    $("#summary-title").textContent = foundAll ? "全部找出，火眼金睛！" : "时间到！看看漏掉了哪些";
    $("#summary-title").style.color = foundAll ? "var(--good)" : "var(--bad)";

    const body = $("#summary-body");
    body.innerHTML = "";
    const head = document.createElement("p");
    head.className = "sum-score";
    head.innerHTML = "本场景已找出 <b>" + state.found.size + "/" + sc.hazards.length + "</b> 处隐患";
    body.appendChild(head);

    sc.hazards.forEach((h) => {
      const ok = state.found.has(h.id);
      const item = document.createElement("div");
      item.className = "sum-item " + (ok ? "ok" : "miss");
      const mark = document.createElement("span");
      mark.className = "mark";
      mark.textContent = ok ? "✓" : "✕";
      const txt = document.createElement("div");
      const b = document.createElement("b");
      b.textContent = h.name;
      txt.appendChild(b);
      if (!ok) {
        const s = document.createElement("span");
        s.className = "fix";
        s.textContent = " — " + h.fix;
        txt.appendChild(s);
      }
      item.appendChild(mark);
      item.appendChild(txt);
      body.appendChild(item);
    });

    show(panels.summary);
  }

  function startQuiz() {
    state.quizIdx = 0;
    state.quizCorrect = 0;
    showQuizQ();
  }

  function showQuizQ() {
    const sc = currentScene();
    const q = sc.quiz[state.quizIdx];
    $("#quiz-tag").textContent = "应急处置测验 · 第 " + (state.quizIdx + 1) + "/" + sc.quiz.length + " 题";
    $("#quiz-q").textContent = q.q;
    const box = $("#quiz-options");
    box.innerHTML = "";
    const fb = $("#quiz-feedback");
    hide(fb);
    hide($("#btn-quiz-next"));
    const letters = ["A", "B", "C", "D"];
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "quiz-opt";
      btn.textContent = letters[i] + "．" + opt;
      btn.addEventListener("click", () => answerQuiz(btn, i));
      box.appendChild(btn);
    });
    hide(panels.summary);
    show(panels.quiz);
  }

  function answerQuiz(btn, idx) {
    const q = currentScene().quiz[state.quizIdx];
    const box = $("#quiz-options");
    Array.from(box.children).forEach((b, i) => {
      b.classList.add("locked");
      if (i === q.answer) b.classList.add("correct");
    });
    const fb = $("#quiz-feedback");
    fb.innerHTML = "";
    if (idx === q.answer) {
      state.quizCorrect++;
      state.partial += D.QUIZ_SCORE;
      const head = document.createElement("div");
      head.innerHTML = "<b>回答正确，+" + D.QUIZ_SCORE + " 分！</b>";
      fb.appendChild(head);
      Sound.correct();
    } else {
      btn.classList.add("wrong");
      const head = document.createElement("div");
      head.innerHTML = "<b>答错了，正确答案是 " + "ABCD"[q.answer] + "。</b>";
      fb.appendChild(head);
      Sound.wrong();
    }
    const exp = document.createElement("div");
    exp.textContent = q.explain;
    fb.appendChild(exp);
    show(fb);
    updateHud();
    show($("#btn-quiz-next"));
  }

  function nextQuiz() {
    const sc = currentScene();
    if (state.quizIdx < sc.quiz.length - 1) {
      state.quizIdx++;
      showQuizQ();
    } else {
      finishScene();
    }
  }

  function finishScene() {
    const sc = currentScene();
    const score = clamp0(
      state.found.size * D.HAZARD_SCORE +
      state.quizCorrect * D.QUIZ_SCORE -
      state.wrongCount * D.WRONG_COST -
      state.hintsUsed * D.HINT_COST
    );
    state.sceneResults.push({
      name: sc.name,
      found: state.found.size,
      total: sc.hazards.length,
      quizCorrect: state.quizCorrect,
      quizTotal: sc.quiz.length,
      score: score
    });
    state.completedTotal += score;
    state.partial = 0;
    closeAllPanels();
    if (state.sceneIdx < D.scenes.length - 1) {
      showScene(state.sceneIdx + 1);
    } else {
      showFinal();
    }
  }

  /* ---------------- 结算 ---------------- */
  function showFinal() {
    const total = state.completedTotal;
    const maxScore = D.scenes.reduce((s, sc) => s + sc.hazards.length * D.HAZARD_SCORE + sc.quiz.length * D.QUIZ_SCORE, 0);
    let title = D.titles[D.titles.length - 1];
    for (const t of D.titles) { if (total >= t.min) { title = t; break; } }
    const medalMap = ["🏆", "🎖️", "🛡️", "🐣"];
    const idx = D.titles.indexOf(title);

    $("#final-score").textContent = total;
    $("#final-medal").textContent = medalMap[idx] || "🏆";
    $("#final-title").textContent = title.name;
    $("#final-desc").textContent = title.desc + "（满分 " + maxScore + " 分）";

    const bd = $("#final-breakdown");
    bd.innerHTML = "";
    state.sceneResults.forEach((r) => {
      const row = document.createElement("div");
      row.className = "fb-row";
      row.innerHTML = "<span>" + r.name + "</span><span>隐患 " + r.found + "/" + r.total +
        " · 答题 " + r.quizCorrect + "/" + r.quizTotal + " · <b>" + r.score + " 分</b></span>";
      bd.appendChild(row);
    });

    const best = Number(localStorage.getItem(D.bestKey) || 0);
    if (total > best) localStorage.setItem(D.bestKey, String(total));
    refreshCoverBest();

    showScreen("final");
    Sound.win();
  }

  function buildRecap() {
    const list = $("#recap-list");
    list.innerHTML = "";
    D.scenes.forEach((sc) => {
      const block = document.createElement("div");
      block.className = "recap-scene";
      const h = document.createElement("h4");
      h.textContent = "◆ " + sc.name;
      block.appendChild(h);
      sc.hazards.forEach((hz) => {
        const item = document.createElement("div");
        item.className = "recap-item";
        item.innerHTML = "<b>" + hz.name + "</b><br><span class='recap-fix'>" + hz.fix + "</span>";
        block.appendChild(item);
      });
      list.appendChild(block);
    });
  }

  function refreshCoverBest() {
    const best = Number(localStorage.getItem(D.bestKey) || 0);
    const el = $("#cover-best");
    if (best > 0) {
      el.querySelector("b").textContent = best;
      show(el);
    } else {
      hide(el);
    }
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    $("#btn-start").addEventListener("click", () => { Sound.ensure(); startGame(); });
    $("#btn-intro-go").addEventListener("click", beginPlay);
    $("#btn-card-next").addEventListener("click", () => {
      hide(panels.card);
      state.paused = false;
    });
    $("#btn-summary-next").addEventListener("click", startQuiz);
    $("#btn-quiz-next").addEventListener("click", nextQuiz);
    hud.hint.addEventListener("click", useHint);
    hud.mute.addEventListener("click", () => {
      state.muted = !state.muted;
      localStorage.setItem("hh_mute", state.muted ? "1" : "0");
      updateHud();
    });
    $("#btn-again").addEventListener("click", () => { closeAllPanels(); startGame(); });
    $("#btn-recap").addEventListener("click", () => { buildRecap(); show(panels.recap); });
    $("#btn-recap-close").addEventListener("click", () => hide(panels.recap));

    // 场景点按（事件委托，兼容触屏与鼠标）
    const area = $("#scene-area");
    area.addEventListener("click", (e) => {
      if (!panels.intro.classList.contains("hidden")) return;
      if (!panels.card.classList.contains("hidden")) return;
      const hitEl = e.target.closest ? e.target.closest(".hit") : null;
      const svg = e.target.closest ? e.target.closest(".scene-svg") : null;
      if (!svg || currentSvg() !== svg) return;
      const layer = svg.querySelector(".overlay-layer");
      if (hitEl) {
        const sc = currentScene();
        const h = sc.hazards.find((x) => x.id === hitEl.dataset.hid);
        if (!h) return;
        if (state.found.has(h.id)) return;
        markFound(h, svg, layer);
      } else if (!state.paused) {
        wrongTap(svg, layer, e.clientX, e.clientY);
      }
    });
    area.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /* ---------------- 启动 ---------------- */
  injectHits();
  bind();
  refreshCoverBest();
  if (state.muted) hud.mute.textContent = "🔇";
})();
