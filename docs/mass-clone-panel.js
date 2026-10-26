/**
 * AdReplica — mass clone panel, injected as an overlay on a live Ads Manager page.
 *
 * This is a clickable prototype, not shipped product code: it draws the proposed
 * "one campaign → many ad accounts" flow on top of the real Ads Manager so the
 * layout, wording and states can be judged in place. Account ids, names, business
 * managers, currencies and statuses come from a real YellowFox profile; pixel data
 * is real only where it was probed, everything else is clearly marked as demo.
 *
 * Usage: evaluate this file as an expression in the target tab.
 */
(() => {
  const ROOT_ID = "adreplica-mass-clone-proto";
  document.getElementById(ROOT_ID)?.remove();

  const ACCOUNTS = [
    { id: "974116454358643", name: "L3A3", status: 1, currency: "USD", biz: null, pixels: ["1621554896153020"] },
    { id: "796194912465909", name: "L3A9", status: 1, currency: "USD", biz: null, pixels: ["1693276409004593"] },
    { id: "3712757899043650", name: "L3A4", status: 1, currency: "USD", biz: null, pixels: null },
    { id: "1306348530321309", name: "L3A8", status: 1, currency: "USD", biz: null, pixels: null },
    { id: "1779940055831443", name: "L3A6", status: 1, currency: "USD", biz: null, pixels: null },
    { id: "654144733542828", name: "L3A1", status: 2, currency: "USD", biz: null, pixels: null },
    { id: "1635614067189984", name: "L3A7", status: 1, currency: "USD", biz: null, pixels: null },
    { id: "2313829705488751", name: "L3A5", status: 1, currency: "USD", biz: null, pixels: null },
    { id: "426472413446384", name: "Juan Miguel S. Bernardo", status: 1, currency: "PHP", biz: null, pixels: null },
    { id: "856230013114912", name: "L3 PV1", status: 2, currency: "USD", biz: "L3 ProfitVision", pixels: ["1573076034588284"] },
    { id: "343643318385126", name: "L3A2", status: 1, currency: "USD", biz: null, pixels: null },
    { id: "3950356461902900", name: "JMS1", status: 1, currency: "USD", biz: "Juan Miguel S.", pixels: ["2457052461465059"] },
    { id: "1499871348321734", name: "Juan1", status: 2, currency: "USD", biz: "Juan Playground", pixels: null },
  ];
  const SOURCE_CURRENCY = "USD";

  const CSS = `
  #${ROOT_ID}{position:fixed;top:16px;right:16px;bottom:16px;width:min(660px,52vw);z-index:2147483647;
    font-family:"Segoe UI","Trebuchet MS",sans-serif;pointer-events:none}
  #${ROOT_ID} *{box-sizing:border-box}
  #${ROOT_ID} .shell{position:absolute;inset:0;display:flex;flex-direction:column;background:#1a1a1a;color:#f5f5f5;
    border:2px solid #ffc107;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.7);pointer-events:auto;
    font-size:12px;overflow:hidden}
  #${ROOT_ID} .head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #333300;
    background:linear-gradient(180deg,#242400,#1a1a1a)}
  #${ROOT_ID} .mark{width:24px;height:24px;flex:0 0 auto;border-radius:6px;background:#ffc107;color:#1a1a1a;
    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
  #${ROOT_ID} .head h2{margin:0;font-size:14px;letter-spacing:.02em;color:#ffc107}
  #${ROOT_ID} .head .meta{color:#8a8a8a;font-size:10px;letter-spacing:.05em}
  #${ROOT_ID} .head .spacer{margin-left:auto;display:flex;align-items:center;gap:6px}
  #${ROOT_ID} .tabs{display:flex;gap:4px;padding:8px 12px 0;border-bottom:1px solid #333}
  #${ROOT_ID} .tab{padding:6px 10px;border-radius:6px 6px 0 0;color:#9a9a9a;background:#202020;border:1px solid #333;
    border-bottom:none;font-size:11px;cursor:pointer}
  #${ROOT_ID} .tab.active{color:#1a1a1a;background:#ffc107;border-color:#ffc107;font-weight:600}
  #${ROOT_ID} .body{flex:1;overflow:auto;padding:12px}
  #${ROOT_ID} section{background:#212121;border:1px solid #383838;border-radius:8px;padding:10px 12px;margin-bottom:10px}
  #${ROOT_ID} section h3{margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#ffc107;
    display:flex;align-items:center;gap:6px}
  #${ROOT_ID} .row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
  #${ROOT_ID} .field{display:flex;flex-direction:column;gap:3px;flex:1;min-width:150px}
  #${ROOT_ID} .field span{font-size:10px;color:#9a9a9a;letter-spacing:.04em}
  #${ROOT_ID} select,#${ROOT_ID} input[type=text]{background:#2a2a2a;color:#f5f5f5;border:1px solid #383838;
    border-radius:5px;padding:5px 7px;font:inherit;font-size:11px}
  #${ROOT_ID} button{background:#2a2a2a;color:#f5f5f5;border:1px solid #383838;border-radius:5px;padding:5px 9px;
    font:inherit;font-size:11px;cursor:pointer}
  #${ROOT_ID} button:hover:not(:disabled){border-color:#ffc107;color:#ffc107}
  #${ROOT_ID} button:disabled{opacity:.45;cursor:not-allowed}
  #${ROOT_ID} button.primary{background:#ffc107;border-color:#ffc107;color:#1a1a1a;font-weight:600}
  #${ROOT_ID} button.danger{border-color:rgba(239,68,68,.55);color:#fca5a5}
  #${ROOT_ID} .sum{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:#9a9a9a;font-size:11px}
  #${ROOT_ID} .sum b{color:#f5f5f5}
  #${ROOT_ID} .list{max-height:210px;overflow:auto;border:1px solid #383838;border-radius:6px;
    scrollbar-width:thin;scrollbar-color:#4b4b4b #202020}
  #${ROOT_ID} .list::-webkit-scrollbar{width:8px}
  #${ROOT_ID} .list::-webkit-scrollbar-thumb{background:#4b4b4b;border-radius:6px}
  #${ROOT_ID} .acc{display:flex;gap:6px;align-items:center;padding:5px 8px;border-bottom:1px solid #2b2b2b;
    cursor:pointer;flex-wrap:wrap}
  #${ROOT_ID} .acc:last-child{border-bottom:none}
  #${ROOT_ID} .acc:hover{background:#262626}
  #${ROOT_ID} .acc.off{opacity:.62}
  #${ROOT_ID} .acc .who{display:flex;flex-direction:column;min-width:0;flex:1 1 120px}
  #${ROOT_ID} .acc .chips{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;flex:0 1 auto}
  #${ROOT_ID} .acc .nm{font-size:11px}
  #${ROOT_ID} .acc .id{color:#777;font-size:9px;letter-spacing:.03em}
  #${ROOT_ID} .chip{font-size:9px;padding:1px 5px;border-radius:999px;border:1px solid #3d3d3d;color:#9a9a9a;
    white-space:nowrap}
  #${ROOT_ID} .chip.bm{border-color:rgba(255,193,7,.45);color:#ffc107}
  #${ROOT_ID} .chip.ok{border-color:rgba(34,197,94,.5);color:#86efac}
  #${ROOT_ID} .chip.warn{border-color:rgba(245,158,11,.5);color:#fcd34d}
  #${ROOT_ID} .chip.err{border-color:rgba(239,68,68,.5);color:#fca5a5}
  #${ROOT_ID} .chip.info{border-color:rgba(56,189,248,.5);color:#7dd3fc}
  #${ROOT_ID} table{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}
  #${ROOT_ID} table th:nth-child(1){width:25%}
  #${ROOT_ID} table th:nth-child(2){width:20%}
  #${ROOT_ID} table th:nth-child(3){width:17%}
  #${ROOT_ID} table th:nth-child(4){width:12%}
  #${ROOT_ID} table th:nth-child(5){width:26%}
  #${ROOT_ID} th,#${ROOT_ID} td{text-align:left;padding:5px 6px;border-bottom:1px solid #2b2b2b;vertical-align:top;
    overflow-wrap:anywhere}
  #${ROOT_ID} th{color:#9a9a9a;font-size:9px;letter-spacing:.06em;text-transform:uppercase;font-weight:500}
  #${ROOT_ID} td.risk{display:block;line-height:1.7}
  #${ROOT_ID} td.risk .chip{display:inline-block;white-space:normal}
  #${ROOT_ID} .toolbar{display:flex;gap:6px;align-items:center;justify-content:space-between;margin-top:8px;
    flex-wrap:wrap}
  #${ROOT_ID} .toolbar .right{display:flex;gap:6px;align-items:center}
  #${ROOT_ID} .bar{height:5px;background:#303030;border-radius:999px;overflow:hidden;margin:8px 0 4px}
  #${ROOT_ID} .bar>i{display:block;height:100%;width:0;background:#ffc107;transition:width .25s}
  #${ROOT_ID} .job{display:grid;grid-template-columns:1fr auto;gap:4px;padding:5px 8px;border-bottom:1px solid #2b2b2b}
  #${ROOT_ID} .job .ph{color:#9a9a9a;font-size:10px;margin-top:1px}
  #${ROOT_ID} .job.done .ph{color:#86efac}
  #${ROOT_ID} .job.fail .ph{color:#fca5a5}
  #${ROOT_ID} .job.queued{opacity:.55}
  #${ROOT_ID} .log{background:#141414;border:1px solid #2b2b2b;border-radius:6px;padding:6px 8px;margin-top:8px;
    font-family:Consolas,monospace;font-size:10px;color:#bfbfbf;max-height:84px;overflow:auto}
  #${ROOT_ID} .warnline{font-size:10px;color:#fcd34d;margin-top:6px}
  #${ROOT_ID} .hint{font-size:10px;color:#8a8a8a;line-height:1.45;margin-top:6px}
  #${ROOT_ID} .hidden{display:none !important}
  @media (max-width:1100px){#${ROOT_ID}{width:min(560px,72vw)}}
  `;

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <div class="shell">
      <div class="head">
        <div class="mark">A</div>
        <div>
          <h2>AdReplica</h2>
          <div class="meta">261026b1 · mass clone prototype</div>
        </div>
        <div class="spacer">
          <span class="chip warn">макет</span>
          <button class="close" title="Закрыть">✕</button>
        </div>
      </div>
      <div class="tabs">
        <div class="tab active">Clone</div>
        <div class="tab">Mappings</div>
        <div class="tab">Media</div>
        <div class="tab">Logs</div>
      </div>
      <div class="body">
        <section>
          <h3>1 · Что клонируем</h3>
          <div class="row">
            <label class="field"><span>Кабинет-источник</span>
              <select><option>JMS1 · 3950356461902900</option><option>L3A3 · 974116454358643</option></select>
            </label>
            <label class="field"><span>Кампания</span>
              <select><option>Juan1 Lang Retry · PAUSED</option><option>AdReplica Catalog Source · PAUSED</option></select>
            </label>
          </div>
          <div class="sum">
            <div>кампания <b>1</b></div><div>адсеты <b>3</b></div><div>объявления <b>12</b></div>
            <div>креативы <b>9</b></div><div>медиа <b>14</b></div><div>каталог <b>1</b></div><div>пиксель <b>1</b></div>
          </div>
        </section>
        <section>
          <h3>2 · Куда клонируем</h3>
          <div class="toolbar">
            <div class="right">
              <button data-act="active">Активные</button>
              <button data-act="all">Все</button>
              <button data-act="none">Снять</button>
            </div>
            <div style="color:#9a9a9a">Выбрано <b class="selcount" style="color:#f5f5f5">0</b> / 13</div>
          </div>
          <div class="list accounts"></div>
          <div class="warnline hidden diswarn"></div>
          <div class="toolbar">
            <div class="hint">Preflight проверяет страницу, пиксель, каталог и режим по каждому кабинету. Ничего не создаёт.</div>
            <div class="right">
              <button class="preflight" disabled>Проверить</button>
              <button class="primary clone" disabled>Клонировать</button>
            </div>
          </div>
        </section>
        <section class="hidden preflight-card">
          <h3>3 · Предпросмотр маппингов</h3>
          <table><thead><tr><th>Кабинет</th><th>Пиксель</th><th>Каталог</th><th>Режим</th><th>Риск</th></tr></thead>
          <tbody class="pfbody"></tbody></table>
          <div class="hint pfhint"></div>
        </section>
        <section class="hidden run-card">
          <h3>4 · Выполнение</h3>
          <div class="bar"><i></i></div>
          <div class="sum">
            <div>готово <b class="cdone">0</b></div><div>ошибки <b class="cfail">0</b></div>
            <div>в очереди <b class="cqueue">0</b></div><div>сейчас <b class="cnow">—</b></div>
          </div>
          <div class="list jobs" style="max-height:190px"></div>
          <div class="log"></div>
          <div class="toolbar">
            <div class="right">
              <button class="danger stop">Стоп</button>
              <button class="retry" disabled>Повторить неуспешные</button>
              <button class="reset">Сбросить</button>
            </div>
            <div class="hint runhint">Последовательно: один кабинет за раз.</div>
          </div>
        </section>
      </div>
    </div>`;
  document.body.appendChild(root);

  const q = (sel) => root.querySelector(sel);
  const selected = new Set();
  let preflighted = [];
  let jobs = [];
  let running = false;
  let stopRequested = false;

  const chip = (text, cls) => `<span class="chip ${cls || ""}">${text}</span>`;

  function renderAccounts() {
    q(".accounts").innerHTML = ACCOUNTS.map((a) => {
      const off = a.status !== 1;
      const kind = a.biz ? chip("БМ " + a.biz, "bm") : chip("личный");
      const px = a.pixels === null
        ? chip("пиксель ?", "warn")
        : a.pixels.length ? chip("пиксель ✓", "ok") : chip("без пикселя", "info");
      return `<label class="acc ${off ? "off" : ""}">
        <input type="checkbox" value="${a.id}" ${selected.has(a.id) ? "checked" : ""}/>
        <span class="who"><span class="nm">${a.name}</span> <span class="id">${a.id} · ${a.currency}</span></span>
        <span class="chips">${kind}${px}${off ? chip("отключён", "err") : chip("активен", "ok")}</span>
      </label>`;
    }).join("");
    q(".accounts").querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.addEventListener("change", () => {
        cb.checked ? selected.add(cb.value) : selected.delete(cb.value);
        afterSelection();
      });
    });
    afterSelection();
  }

  function afterSelection() {
    q(".selcount").textContent = selected.size;
    q(".preflight").disabled = selected.size === 0 || running;
    q(".clone").disabled = preflighted.length === 0 || running;
    q(".clone").textContent = selected.size ? `Клонировать в ${selected.size}` : "Клонировать";
    const off = ACCOUNTS.filter((a) => a.status !== 1 && selected.has(a.id));
    const warn = q(".diswarn");
    if (off.length) {
      warn.classList.remove("hidden");
      warn.textContent = `${off.length} отключённых кабинета (${off.map((a) => a.name).join(", ")}): ошибка Meta будет изолирована, остальные выполнятся.`;
    } else {
      warn.classList.add("hidden");
    }
  }

  function resolvePixels(a) {
    if (a.pixels !== null) return Promise.resolve(a.pixels);
    const seeded = [...a.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 10;
    q(".log").innerHTML += `<div>пиксели act_${a.id}…</div>`;
    return new Promise((r) => setTimeout(() => r(seeded >= 4 ? ["demo_" + a.id.slice(-6)] : []), 180));
  }

  async function preflight() {
    preflighted = [];
    q(".log").innerHTML = "";
    for (const a of ACCOUNTS.filter((x) => selected.has(x.id))) {
      const pixels = await resolvePixels(a);
      const risk = [];
      if (a.status !== 1) risk.push(chip("отключён", "err"));
      if (a.currency !== SOURCE_CURRENCY) risk.push(chip("валюта " + a.currency, "warn"));
      risk.push(pixels.length ? chip("переиспользуем пиксель", "ok") : chip("создадим пиксель", "info"));
      if (!a.biz) risk.push(chip("нет каталога", "warn"));
      preflighted.push({
        account: a,
        pixel: pixels.length
          ? (String(pixels[0]).startsWith("demo_") ? "есть · демо" : pixels[0])
          : "новый (POST adspixels)",
        catalog: a.biz ? "копия в " + a.biz : "—",
        mode: a.biz ? "DRAFT" : "PAUSED",
        risk: risk.join(" "),
      });
    }
    q(".preflight-card").classList.remove("hidden");
    q(".pfbody").innerHTML = preflighted.map((p) => `<tr>
      <td><b>${p.account.name}</b><div class="id">${p.account.id}</div></td>
      <td>${p.pixel}</td><td>${p.catalog}</td><td>${p.mode}</td><td class="risk">${p.risk}</td></tr>`).join("");
    q(".pfhint").textContent = `Проверено ${preflighted.length}. Пиксель Meta разрешает один на кабинет: где есть — берём существующий.`;
    afterSelection();
  }

  const PHASES = ["пакет", "медиа", "пиксель", "кампания", "адсеты", "объявления", "проверка"];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function renderJobs() {
    q(".jobs").innerHTML = jobs.map((j) => `<div class="job ${j.state}">
      <div><b>${j.account.name}</b> <span class="id">· ${j.account.id}</span><div class="ph">${j.phaseText || "в очереди"}</div></div>
      <div>${j.state === "done" ? chip("готово", "ok")
        : j.state === "fail" ? chip("ошибка", "err")
        : j.state === "running" ? chip("идёт", "info")
        : j.state === "cancelled" ? chip("отменено", "warn") : chip("в очереди", "warn")}</div>
    </div>`).join("");
    const done = jobs.filter((j) => j.state === "done").length;
    const fail = jobs.filter((j) => j.state === "fail").length;
    q(".cdone").textContent = done;
    q(".cfail").textContent = fail;
    q(".cqueue").textContent = jobs.filter((j) => j.state === "queued").length;
    const active = jobs.find((j) => j.state === "running");
    q(".cnow").textContent = active ? active.account.name : "—";
    q(".run-card .bar>i").style.width = jobs.length ? Math.round(((done + fail) / jobs.length) * 100) + "%" : "0";
    q(".retry").disabled = !fail || running;
  }

  async function runOne(job) {
    job.state = "running";
    const failEarly = job.account.status !== 1;
    for (const phase of PHASES) {
      if (stopRequested) { job.state = "cancelled"; job.phaseText = "остановлено"; renderJobs(); return; }
      job.phaseText = phase + "…";
      renderJobs();
      await sleep(220 + Math.random() * 240);
      if (failEarly && phase === "кампания") {
        job.state = "fail";
        job.phaseText = "(#200) Permissions error — кабинет отключён";
        q(".log").innerHTML += `<div>[${job.account.name}] #200 Permissions error; остальные кабинеты продолжаются</div>`;
        renderJobs();
        return;
      }
    }
    job.state = "done";
    job.phaseText = `кампания 1202391${job.account.id.slice(-4)} · 3 адсета · 12 объявлений`;
    q(".log").innerHTML += `<div>[${job.account.name}] клон завершён</div>`;
    renderJobs();
  }

  async function startClone() {
    if (running) return;
    running = true; stopRequested = false;
    q(".run-card").classList.remove("hidden");
    q(".log").innerHTML = "";
    jobs = preflighted.map((p) => ({ account: p.account, state: "queued", phaseText: "" }));
    q(".stop").disabled = false;
    renderJobs();
    for (const job of jobs) {
      if (stopRequested) { job.state = "cancelled"; renderJobs(); continue; }
      await runOne(job);
    }
    running = false;
    q(".stop").disabled = true;
    const done = jobs.filter((j) => j.state === "done").length;
    const fail = jobs.filter((j) => j.state === "fail").length;
    const cancelled = jobs.filter((j) => j.state === "cancelled").length;
    q(".runhint").textContent = `Итог: готово ${done}, ошибок ${fail}${cancelled ? `, отменено ${cancelled}` : ""}. Успешные не откатываются.`;
    afterSelection();
    renderJobs();
  }

  root.querySelector(".close").onclick = () => root.remove();
  q('[data-act="active"]').onclick = () => { selected.clear(); ACCOUNTS.filter((a) => a.status === 1).forEach((a) => selected.add(a.id)); renderAccounts(); };
  q('[data-act="all"]').onclick = () => { selected.clear(); ACCOUNTS.forEach((a) => selected.add(a.id)); renderAccounts(); };
  q('[data-act="none"]').onclick = () => { selected.clear(); renderAccounts(); };
  q(".preflight").onclick = preflight;
  q(".clone").onclick = startClone;
  q(".stop").onclick = () => { stopRequested = true; q(".stop").disabled = true; };
  q(".retry").onclick = () => {
    jobs = jobs.filter((j) => j.state === "fail").map((j) => ({ ...j, state: "queued", phaseText: "" }));
    preflighted = jobs.map((j) => ({ account: j.account }));
    startClone();
  };
  q(".reset").onclick = () => {
    jobs = [];
    q(".run-card").classList.add("hidden");
    q(".log").innerHTML = "";
    q(".runhint").textContent = "Последовательно: один кабинет за раз.";
  };

  renderAccounts();
  window.__adreplicaMassCloneProto = { root, selectAll: () => q('[data-act="all"]').click() };
  return "mounted";
})();
