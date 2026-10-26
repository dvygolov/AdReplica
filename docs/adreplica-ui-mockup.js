/**
 * AdReplica — full interface prototype.
 *
 * Renders the whole panel (Export / Import / Clone + Logs + service menu) with the
 * mass-clone flow redesigned per the latest review:
 *   - no "active/all/none" buttons: one master checkbox in the table header;
 *   - only active ad accounts are listed (disabled ones are not shown at all);
 *   - per-account pixel choice with a sensible default;
 *   - currency mismatch is cloned with a budget conversion;
 *   - strictly sequential run;
 *   - a failed account is rolled back automatically (created objects deleted).
 *
 * Standalone: open the html wrapper, a mock Ads Manager backdrop is drawn.
 * Injected: evaluated inside a real Ads Manager tab, the backdrop is skipped and
 * the panel docks to the right.
 *
 * Account ids, names, business managers, currencies and known pixels come from a
 * live YellowFox profile; pixel state for unprobed accounts is marked as demo.
 */
(() => {
  const EMBED = window.location.protocol !== "file:";
  const ROOT_ID = "adreplica-full-prototype";
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById("adreplica-prototype-style")?.remove();

  const USD_PHP = 58.5;

  // Only accounts that can actually be cloned into: status must be active.
  const ACCOUNTS = [
    { id: "974116454358643", name: "L3A3", kind: "personal", currency: "USD", pixels: ["1621554896153020"] },
    { id: "796194912465909", name: "L3A9", kind: "personal", currency: "USD", pixels: ["1693276409004593", "1184530629974612"] },
    { id: "3712757899043650", name: "L3A4", kind: "personal", currency: "USD", pixels: null },
    { id: "1306348530321309", name: "L3A8", kind: "personal", currency: "USD", pixels: null },
    { id: "1779940055831443", name: "L3A6", kind: "personal", currency: "USD", pixels: null },
    { id: "1635614067189984", name: "L3A7", kind: "personal", currency: "USD", pixels: null, pageRevoked: true },
    { id: "2313829705488751", name: "L3A5", kind: "personal", currency: "USD", pixels: null },
    { id: "426472413446384", name: "Juan Miguel S. Bernardo", kind: "personal", currency: "PHP", pixels: null },
    { id: "343643318385126", name: "L3A2", kind: "personal", currency: "USD", pixels: null },
    { id: "3950356461902900", name: "JMS1", kind: "bm", biz: "Juan Miguel S.", currency: "USD", pixels: ["2457052461465059", "1524646825519080"] },
  ];

  const SOURCE = {
    account: "JMS1 · 3950356461902900",
    campaign: "Juan1 Lang Retry",
    status: "PAUSED",
    currency: "USD",
    adsets: 3,
    ads: 12,
    creatives: 9,
    media: 14,
    budgetPerAdset: 50,
    catalog: "Juan Miguel S.",
    page: "Chelsea Daniam",
  };

  const MEDIA_FILES = [
    { name: "reel_01.mp4", size: "11.4 МБ", kind: "видео" },
    { name: "reel_02.mp4", size: "9.8 МБ", kind: "видео" },
    { name: "static_a.jpg", size: "412 КБ", kind: "изображение" },
    { name: "static_b.jpg", size: "388 КБ", kind: "изображение" },
    { name: "… ещё 10 файлов", size: "16.3 МБ", kind: "" },
  ];

  const CSS = `
  #${ROOT_ID}{position:${EMBED ? "fixed" : "relative"};${EMBED ? "inset:0;" : ""}z-index:2147483647;
    font-family:"Segoe UI","Trebuchet MS",sans-serif;pointer-events:none}
  #${ROOT_ID} *{box-sizing:border-box}
  #${ROOT_ID} .panel{position:absolute;top:16px;right:16px;bottom:16px;width:900px;display:flex;
    flex-direction:column;background:#1a1a1a;color:#f5f5f5;border:2px solid #ffc107;border-radius:10px;
    box-shadow:0 12px 40px rgba(0,0,0,.7);pointer-events:auto;font-size:12.5px;overflow:hidden}
  #${ROOT_ID} .panel.centered{left:50%;right:auto;transform:translateX(-50%)}
  #${ROOT_ID} .head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #333;
    background:linear-gradient(180deg,#242400,#1a1a1a)}
  #${ROOT_ID} .mark{width:26px;height:26px;flex:0 0 auto;border-radius:7px;background:#ffc107;color:#1a1a1a;
    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}
  #${ROOT_ID} .head h1{margin:0;font-size:15px;color:#ffc107;letter-spacing:.02em}
  #${ROOT_ID} .head .ver{color:#8a8a8a;font-size:10px;letter-spacing:.05em}
  #${ROOT_ID} .head .right{margin-left:auto;display:flex;gap:6px;align-items:center}
  #${ROOT_ID} .tabs{display:flex;gap:4px;padding:8px 12px 0;border-bottom:1px solid #333}
  #${ROOT_ID} .tab{padding:6px 12px;border-radius:6px 6px 0 0;color:#9a9a9a;background:#202020;border:1px solid #333;
    border-bottom:none;font-size:11.5px;cursor:pointer}
  #${ROOT_ID} .tab.active{color:#1a1a1a;background:#ffc107;border-color:#ffc107;font-weight:600}
  #${ROOT_ID} .body{flex:1;overflow:auto;padding:12px}
  #${ROOT_ID} .pane{display:flex;flex-direction:column;min-height:100%}
  #${ROOT_ID} .run-card{display:flex;flex-direction:column;flex:1 1 auto}
  #${ROOT_ID} .run-card .console{flex:1 1 auto;min-height:96px;max-height:none}
  #${ROOT_ID} .card{background:#212121;border:1px solid #383838;border-radius:8px;padding:10px 12px;margin-bottom:10px}
  #${ROOT_ID} .card h2{margin:0 0 9px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#ffc107;
    display:flex;align-items:center;gap:8px}
  #${ROOT_ID} .card h2 .count{color:#9a9a9a;text-transform:none;letter-spacing:0;font-weight:400}
  #${ROOT_ID} .row{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
  #${ROOT_ID} .field{display:flex;flex-direction:column;gap:3px;flex:1;min-width:170px}
  #${ROOT_ID} .field span{font-size:10px;color:#9a9a9a;letter-spacing:.04em}
  #${ROOT_ID} select,#${ROOT_ID} input[type=text],#${ROOT_ID} input[type=file]{
    background:#2a2a2a;color:#f5f5f5;border:1px solid #383838;border-radius:5px;padding:5px 7px;font:inherit;font-size:11.5px}
  #${ROOT_ID} input[type=file]{padding:4px}
  #${ROOT_ID} button{background:#2a2a2a;color:#f5f5f5;border:1px solid #383838;border-radius:5px;padding:5px 10px;
    font:inherit;font-size:11.5px;cursor:pointer}
  #${ROOT_ID} button:hover:not(:disabled){border-color:#ffc107;color:#ffc107}
  #${ROOT_ID} button:disabled{opacity:.45;cursor:not-allowed}
  #${ROOT_ID} button.primary{background:#ffc107;border-color:#ffc107;color:#1a1a1a;font-weight:600}
  #${ROOT_ID} button.primary:hover:not(:disabled){filter:brightness(1.08);color:#1a1a1a}
  #${ROOT_ID} button.danger{border-color:rgba(239,68,68,.55);color:#fca5a5}
  #${ROOT_ID} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px;margin-top:9px}
  #${ROOT_ID} .stat{background:#1c1c1c;border:1px solid #333;border-radius:6px;padding:6px 8px}
  #${ROOT_ID} .stat b{display:block;font-size:15px;color:#fff}
  #${ROOT_ID} .stat span{font-size:10px;color:#9a9a9a}
  #${ROOT_ID} .note{font-size:10.5px;color:#8a8a8a;line-height:1.5;margin:8px 0 0}
  #${ROOT_ID} .note b{color:#cfcfcf}
  #${ROOT_ID} table{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed}
  #${ROOT_ID} th,#${ROOT_ID} td{text-align:left;padding:5px 7px;border-bottom:1px solid #2b2b2b;vertical-align:middle;
    overflow-wrap:anywhere}
  #${ROOT_ID} th{color:#b9b9b9;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:600;
    background:#1d1d1d;position:sticky;top:0}
  #${ROOT_ID} .t-targets{min-width:600px}
  #${ROOT_ID} .t-preview{min-width:660px}
  #${ROOT_ID} .t-targets th:first-child,#${ROOT_ID} .t-targets td:first-child{width:30px;padding-right:0}
  #${ROOT_ID} .t-targets th:nth-child(2){width:30%}
  #${ROOT_ID} .t-targets th:nth-child(3){width:13%}
  #${ROOT_ID} .t-targets th:nth-child(4){width:19%}
  #${ROOT_ID} .t-targets th:nth-child(5){width:19%}
  #${ROOT_ID} .t-targets th:nth-child(6){width:19%}
  #${ROOT_ID} .t-preview th:nth-child(1){width:22%}
  #${ROOT_ID} .t-preview th:nth-child(2){width:16%}
  #${ROOT_ID} .t-preview th:nth-child(3){width:17%}
  #${ROOT_ID} .t-preview th:nth-child(4){width:15%}
  #${ROOT_ID} .t-preview th:nth-child(5){width:9%}
  #${ROOT_ID} .t-preview th:nth-child(6){width:12%}
  #${ROOT_ID} .t-preview th:nth-child(7){width:9%}
  #${ROOT_ID} .who{font-size:11.5px}
  #${ROOT_ID} .who .id{display:block;color:#777;font-size:9.5px;letter-spacing:.02em}
  #${ROOT_ID} select.pix{width:100%;font-size:10.5px;padding:3px 5px}
  #${ROOT_ID} .chip{display:inline-block;font-size:10px;padding:2px 7px;border-radius:999px;border:1px solid #3d3d3d;
    color:#a8a8a8;white-space:nowrap;margin:1px 2px 1px 0}
  #${ROOT_ID} .chip.bm{border-color:rgba(255,193,7,.45);color:#ffc107}
  #${ROOT_ID} .chip.ok{border-color:rgba(34,197,94,.5);color:#86efac}
  #${ROOT_ID} .chip.warn{border-color:rgba(245,158,11,.5);color:#fcd34d}
  #${ROOT_ID} .chip.err{border-color:rgba(239,68,68,.5);color:#fca5a5}
  #${ROOT_ID} .chip.info{border-color:rgba(56,189,248,.5);color:#7dd3fc}
  #${ROOT_ID} .scroll{max-height:250px;overflow:auto;border:1px solid #383838;border-radius:6px;
    scrollbar-width:thin;scrollbar-color:#5a5a5a #202020;scrollbar-gutter:stable}
  #${ROOT_ID} .scroll::-webkit-scrollbar{width:9px}
  #${ROOT_ID} .scroll::-webkit-scrollbar-thumb{background:#4b4b4b;border-radius:6px}
  #${ROOT_ID} .bar{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:9px;flex-wrap:wrap}
  #${ROOT_ID} .bar .right{display:flex;gap:6px;align-items:center}
  #${ROOT_ID} .progress{height:5px;background:#303030;border-radius:999px;overflow:hidden;margin:9px 0 5px}
  #${ROOT_ID} .progress > i{display:block;height:100%;width:0;background:#ffc107;transition:width .25s}
  #${ROOT_ID} .job{display:grid;grid-template-columns:1fr auto;gap:4px;padding:6px 9px;border-bottom:1px solid #2b2b2b}
  #${ROOT_ID} .job:last-child{border-bottom:none}
  #${ROOT_ID} .job .ph{color:#9a9a9a;font-size:10.5px;margin-top:2px}
  #${ROOT_ID} .job.done .ph{color:#86efac}
  #${ROOT_ID} .job.fail .ph{color:#fca5a5}
  #${ROOT_ID} .job.rollback .ph{color:#fcd34d}
  #${ROOT_ID} .job.queued{opacity:.55}
  #${ROOT_ID} .console{background:#141414;border:1px solid #2b2b2b;border-radius:6px;padding:7px 9px;margin-top:9px;
    font-family:Consolas,monospace;font-size:10.5px;color:#bfbfbf;max-height:110px;overflow:auto}
  #${ROOT_ID} .console div{white-space:pre-wrap}
  #${ROOT_ID} details{border:1px solid #333;border-radius:6px;padding:6px 9px;margin-top:9px;background:#1d1d1d}
  #${ROOT_ID} summary{cursor:pointer;font-size:11px;color:#cfcfcf}
  #${ROOT_ID} .logs{display:flex;flex-direction:column;border-top:1px solid #333;background:#191919}
  #${ROOT_ID} .logs .lhead{display:flex;align-items:center;gap:8px;padding:6px 12px;font-size:11px;color:#9a9a9a}
  #${ROOT_ID} .logs .lhead .right{margin-left:auto;display:flex;gap:6px}
  #${ROOT_ID} .logs textarea{background:#141414;color:#c9c9c9;border:none;border-top:1px solid #2b2b2b;
    height:96px;resize:vertical;font-family:Consolas,monospace;font-size:10.5px;padding:7px 9px;width:100%}
  #${ROOT_ID} .menu{position:absolute;top:44px;right:52px;background:#242424;border:1px solid #444;border-radius:7px;
    padding:5px;display:flex;flex-direction:column;gap:3px;z-index:5;min-width:180px}
  #${ROOT_ID} .menu button{text-align:left;border-color:transparent;background:transparent}
  #${ROOT_ID} .hidden{display:none !important}
  #${ROOT_ID} .hintline{font-size:10.5px;color:#8a8a8a;margin-top:6px;line-height:1.5}
  #${ROOT_ID} .result{font-size:11px;color:#86efac;margin-top:8px}
  #${ROOT_ID} .am{position:absolute;inset:0;background:#f0f2f5;color:#1c2b33;font-family:"Segoe UI",sans-serif;
    overflow:hidden}
  #${ROOT_ID} .am .top{height:44px;background:#fff;border-bottom:1px solid #dfe3e8;display:flex;align-items:center;
    gap:14px;padding:0 16px;font-size:13px}
  #${ROOT_ID} .am .dot{width:22px;height:22px;border-radius:50%;background:#1877f2}
  #${ROOT_ID} .am .pill{background:#e7f0fd;color:#1877f2;border-radius:999px;padding:3px 9px;font-size:11px}
  #${ROOT_ID} .am .rail{position:absolute;top:44px;left:0;bottom:0;width:52px;background:#fff;border-right:1px solid #dfe3e8;
    display:flex;flex-direction:column;align-items:center;gap:14px;padding-top:14px}
  #${ROOT_ID} .am .rail i{width:22px;height:22px;border-radius:5px;background:#e4e6eb}
  #${ROOT_ID} .am .main{position:absolute;top:44px;left:52px;right:0;bottom:0;padding:14px 18px;overflow:hidden}
  #${ROOT_ID} .am h3{margin:0 0 4px;font-size:19px}
  #${ROOT_ID} .am .sub{color:#606770;font-size:12px;margin-bottom:12px}
  #${ROOT_ID} .am .tabs2{display:flex;gap:18px;border-bottom:1px solid #dfe3e8;font-size:13px;margin-bottom:10px}
  #${ROOT_ID} .am .tabs2 span{padding:8px 0;color:#606770}
  #${ROOT_ID} .am .tabs2 span.on{color:#1877f2;border-bottom:2px solid #1877f2;font-weight:600}
  #${ROOT_ID} .am .toolbar2{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
  #${ROOT_ID} .am .btn2{background:#fff;border:1px solid #ccd0d5;border-radius:6px;padding:6px 10px;font-size:12px}
  #${ROOT_ID} .am .btn2.blue{background:#1877f2;border-color:#1877f2;color:#fff;font-weight:600}
  #${ROOT_ID} .am .empty{border:1px solid #dfe3e8;border-radius:8px;background:#fff;height:230px;display:flex;
    align-items:center;justify-content:center;color:#8a8d91;font-size:13px}
  #${ROOT_ID} .am .ghost{opacity:.35;margin-top:10px}
  #${ROOT_ID} .am .ghost div{height:11px;background:#e4e6eb;border-radius:4px;margin-bottom:9px}
  #${ROOT_ID} .viz{position:absolute;left:24px;top:16px;background:#1a1a1a;color:#f5f5f5;border:1px solid #444;
    border-radius:8px;padding:10px 12px;font-size:11px;display:flex;gap:10px;align-items:center;pointer-events:auto}
  #${ROOT_ID} .viz b{color:#ffc107}
  `;

  const style = document.createElement("style");
  style.id = "adreplica-prototype-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.id = ROOT_ID;
  if (!EMBED) root.style.cssText = "position:relative;min-height:100vh;background:#f0f2f5";
  root.innerHTML = `
    ${EMBED ? "" : amBackdrop()}
    <div class="panel">
      <div class="head">
        <div class="mark">A</div>
        <div>
          <h1>AdReplica</h1>
          <div class="ver">261026b1 · full interface prototype</div>
        </div>
        <div class="right">
          <span class="chip warn">макет</span>
          <button class="layout-toggle" title="Ширина панели: реальная 580 · компромисс 760 · прототип 900">сбоку 900</button>
          <button class="gear" title="Service">⚙</button>
          <button class="close" title="Close">✕</button>
        </div>
        <div class="menu hidden">
          <button>Clear Drafts</button>
          <button>Load previous version</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab" data-tab="export">Export</button>
        <button class="tab" data-tab="import">Import</button>
        <button class="tab active" data-tab="clone">Clone</button>
      </div>
      <div class="body">
        ${panelExport()}
        ${panelImport()}
        ${panelClone()}
      </div>
      <div class="logs">
        <div class="lhead"><span>Log</span><div class="right"><button class="dl">Download log</button></div></div>
        <textarea readonly></textarea>
      </div>
    </div>`;
  document.body.appendChild(root);

  const q = (sel) => root.querySelector(sel);
  const qa = (sel) => [...root.querySelectorAll(sel)];

  const state = {
    selected: new Set(),
    pixelChoice: {},
    preflighted: false,
    running: false,
    stop: false,
    jobs: [],
    logs: [],
  };

  // default pixel per account: first known pixel, otherwise "create"
  for (const a of ACCOUNTS) state.pixelChoice[a.id] = a.pixels?.[0] || "__create__";

  function log(line) {
    state.logs.push(line);
    q(".logs textarea").value = state.logs.join("\n");
    q(".logs textarea").scrollTop = q(".logs textarea").scrollHeight;
  }

  function amBackdrop() {
    return `<div class="am">
      <div class="top"><div class="dot"></div><b>Ads Manager</b><span class="pill">Opportunity score 100</span>
        <span style="color:#606770">act_1117375422709051</span></div>
      <div class="rail"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="main">
        <h3>Campaigns</h3>
        <div class="sub">Juan1 Lang Retry · PAUSED · Daily budget $50.00</div>
        <div class="tabs2"><span class="on">Campaigns</span><span>Ad sets</span><span>Ads</span></div>
        <div class="toolbar2"><span class="btn2 blue">+ Create</span><span class="btn2">Duplicate</span>
          <span class="btn2">Edit</span><span class="btn2">A/B test</span><span class="btn2">More</span></div>
        <div class="empty">Select a campaign row to open the AdReplica panel</div>
        <div class="ghost"><div style="width:60%"></div><div style="width:80%"></div><div style="width:45%"></div></div>
      </div>
    </div>`;
  }

  function panelExport() {
    return `<div class="pane hidden" data-pane="export">
      <section class="card">
        <h2>Экспорт кампании</h2>
        <div class="row">
          <label class="field"><span>Кабинет</span>
            <select><option>JMS1 · 3950356461902900</option><option>L3A3 · 974116454358643</option></select></label>
          <label class="field"><span>Кампания</span>
            <select><option>Juan1 Lang Retry · PAUSED</option><option>AdReplica Catalog Source · PAUSED</option></select></label>
        </div>
        <div class="bar">
          <div class="hintline">Сохраняет JSON-пакет и медиафайлы на диск — для импорта в другой кабинет или бэкапа.</div>
          <div class="right"><button class="primary do-export">Export</button></div>
        </div>
        <div class="result export-result hidden"></div>
      </section>
    </div>`;
  }

  function panelImport() {
    return `<div class="pane hidden" data-pane="import">
      <section class="card">
        <h2>Импорт кампании из файла</h2>
        <div class="row">
          <label class="field"><span>Кабинет</span>
            <select><option>L3A3 · 974116454358643</option><option>JMS1 · 3950356461902900</option></select></label>
          <label class="field"><span>Export JSON</span>
            <input type="file" accept=".json,application/json" /></label>
        </div>
        <div class="row" style="margin-top:8px">
          <label class="field"><span>Название кампании</span>
            <input type="text" placeholder="По умолчанию — имя из пакета" /></label>
          <label class="field"><span>Режим</span>
            <select><option>PAUSED</option><option>DRAFT</option><option>ACTIVE</option></select></label>
        </div>
        <details open><summary>Маппинги для этого кабинета</summary>
          <div class="row" style="margin-top:8px">
            <label class="field"><span>Страница (source → target)</span>
              <select><option>Chelsea Daniam → Chelsea Daniam</option><option>Не выбрана</option></select></label>
            <label class="field"><span>Пиксель</span>
              <select><option>1621554896153020 (L3A3 pixel)</option>
                <option>Создать новый (в кабинете уже есть — переиспользуем)</option></select></label>
            <label class="field"><span>Каталог</span><select><option>— (в кабинете нет BM)</option></select></label>
          </div>
        </details>
        <div class="bar">
          <div class="hintline">Медиа из пакета загружаются в кабинет заново, если файлов нет в библиотеке.</div>
          <div class="right"><button class="primary do-import">Import</button></div>
        </div>
        <div class="result import-result hidden"></div>
      </section>
    </div>`;
  }

  function panelClone() {
    return `<div class="pane" data-pane="clone">
      <section class="card card-src">
        <h2>1 · Что клонируем</h2>
        <div class="row">
          <label class="field"><span>Кабинет-источник</span>
            <select><option>${SOURCE.account}</option><option>L3A3 · 974116454358643</option></select></label>
          <label class="field"><span>Кампания</span>
            <select><option>${SOURCE.campaign} · ${SOURCE.status}</option><option>AdReplica Catalog Source · PAUSED</option></select></label>
        </div>
        <div class="grid">
          <div class="stat"><b>${SOURCE.adsets}</b><span>адсета</span></div>
          <div class="stat"><b>${SOURCE.ads}</b><span>объявлений</span></div>
          <div class="stat"><b>${SOURCE.creatives}</b><span>креативов</span></div>
          <div class="stat"><b>${SOURCE.media}</b><span>медиафайлов</span></div>
          <div class="stat"><b>$${SOURCE.budgetPerAdset}</b><span>бюджет / адсет</span></div>
          <div class="stat"><b>1</b><span>каталог</span></div>
        </div>
        <p class="note"><b>Креатив</b> — объект creative: заголовок, текст, CTA, ссылка и привязка к странице.<br />
          <b>Медиа</b> — сами файлы (видео и изображения), которые копируются в каждый кабинет отдельно.<br />
          Один креатив может ссылаться на несколько медиафайлов, поэтому счётчики разные.</p>
        <details><summary>Медиа в пакете (${SOURCE.media} ${plural(SOURCE.media, "файл", "файла", "файлов")} · 38.4 МБ)</summary>
          <table style="margin-top:8px"><thead><tr><th>Файл</th><th>Тип</th><th>Размер</th></tr></thead><tbody>
            ${MEDIA_FILES.map((f) => `<tr><td>${f.name}</td><td>${f.kind}</td><td>${f.size}</td></tr>`).join("")}
          </tbody></table>
        </details>
        <div class="row" style="margin-top:9px">
          <label class="field"><span>Название кампании в кабинетах</span>
            <input type="text" value="${SOURCE.campaign} — copy" /></label>
          <label class="field"><span>Режим клона</span>
            <select><option>PAUSED</option><option>DRAFT</option><option>ACTIVE</option></select></label>
        </div>
      </section>

      <section class="card card-targets">
        <h2>2 · Куда клонируем <span class="count">— только активные кабинеты</span></h2>
        <div class="scroll">
          <table class="t-targets">
            <thead><tr>
              <th><input type="checkbox" class="master" title="Выбрать все" /></th>
              <th>Кабинет</th>
              <th>Тип</th>
              <th>Пиксель</th>
              <th>Каталог</th>
              <th>Валюта</th>
            </tr></thead>
            <tbody class="targets"></tbody>
          </table>
        </div>
        <div class="bar">
          <div class="hintline selcount">Выбрано 0 из ${ACCOUNTS.length}</div>
          <div class="right">
            <button class="show-preview" disabled>Предпросмотр</button>
            <button class="primary clone" disabled>Клонировать</button>
          </div>
        </div>
      </section>

      <section class="card hidden preview-card">
        <h2>3 · Предпросмотр маппингов <span class="count">— ничего не создаётся</span></h2>
        <div class="scroll" style="max-height:230px">
          <table class="t-preview">
            <thead><tr><th>Кабинет</th><th>Страница</th><th>Пиксель</th><th>Каталог</th><th>Режим</th>
              <th>Бюджет</th><th>Риск</th></tr></thead>
            <tbody class="preview-body"></tbody>
          </table>
        </div>
        <div class="hintline preview-hint"></div>
      </section>

      <section class="card hidden run-card">
        <h2>4 · Выполнение <span class="count">— последовательно, по одному кабинету</span></h2>
        <div class="progress"><i></i></div>
        <div class="row" style="gap:14px">
          <div class="hintline">готово <b style="color:#86efac" class="c-done">0</b></div>
          <div class="hintline">откат <b style="color:#fcd34d" class="c-rollback">0</b></div>
          <div class="hintline">в очереди <b class="c-queue">0</b></div>
          <div class="hintline">сейчас <b class="c-now">—</b></div>
        </div>
        <div class="scroll" style="max-height:220px;margin-top:9px">
          <div class="jobs"></div>
        </div>
        <div class="console"></div>
        <div class="bar">
          <div class="hintline runhint">Если кабинет падает, созданное в нём удаляется автоматически.</div>
          <div class="right">
            <button class="edit-selection" disabled>Изменить выбор</button>
            <button class="danger stop">Стоп</button>
            <button class="retry" disabled>Повторить ошибки</button>
            <button class="reset">Сбросить</button>
          </div>
        </div>
      </section>
    </div>`;
  }

  function renderTargets() {
    const body = q(".targets");
    body.innerHTML = ACCOUNTS.map((a) => {
      const pixOptions = (a.pixels || []).length
        ? a.pixels.map((p) => `<option value="${p}" ${state.pixelChoice[a.id] === p ? "selected" : ""}>${p}</option>`).join("")
          + `<option value="__create__" ${state.pixelChoice[a.id] === "__create__" ? "selected" : ""}>Создать новый (есть — переиспользуем)</option>`
        : `<option value="__create__">Нет пикселя → создать новый</option>`;
      const conv = a.currency === SOURCE.currency
        ? `<span class="chip">${a.currency}</span>`
        : `<span class="chip warn">${a.currency} · пересчёт ×${USD_PHP}</span>`;
      const catalog = a.kind === "bm"
        ? `<span class="chip ok">копия в ${a.biz}</span>`
        : `<span class="chip">—</span>`;
      const kind = a.kind === "bm" ? `<span class="chip bm">БМ</span>` : `<span class="chip">личный</span>`;
      return `<tr data-id="${a.id}">
        <td><input type="checkbox" class="pick" ${state.selected.has(a.id) ? "checked" : ""} /></td>
        <td><div class="who">${a.name}<span class="id">${a.id}</span></div></td>
        <td>${kind}</td>
        <td><select class="pix">${pixOptions}</select></td>
        <td>${catalog}</td>
        <td>${conv}</td>
      </tr>`;
    }).join("");

    qa(".pick").forEach((cb) => {
      cb.onchange = () => {
        const id = cb.closest("tr").dataset.id;
        cb.checked ? state.selected.add(id) : state.selected.delete(id);
        afterSelection();
      };
    });
    qa("select.pix").forEach((sel) => {
      sel.onchange = () => {
        state.pixelChoice[sel.closest("tr").dataset.id] = sel.value;
        if (state.preflighted) renderPreview();
      };
    });
    afterSelection();
  }

  function afterSelection() {
    const n = state.selected.size;
    q(".selcount").textContent = `Выбрано ${n} из ${ACCOUNTS.length}`;
    q(".clone").textContent = n ? `Клонировать в ${n} ${plural(n, "кабинет", "кабинета", "кабинетов")}` : "Клонировать";
    q(".clone").disabled = n === 0 || state.running;
    q(".show-preview").disabled = n === 0 || state.running;
    const master = q(".master");
    master.checked = n > 0 && n === ACCOUNTS.length;
    master.indeterminate = n > 0 && n < ACCOUNTS.length;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function budgetFor(a) {
    if (a.currency === SOURCE.currency) return `$${SOURCE.budgetPerAdset.toFixed(2)} / день`;
    return `${Math.round(SOURCE.budgetPerAdset * USD_PHP)} ${a.currency} / день`;
  }

  function renderPreview() {
    state.preflighted = true;
    q(".preview-card").classList.remove("hidden");
    const chosen = ACCOUNTS.filter((a) => state.selected.has(a.id));
    q(".preview-body").innerHTML = chosen.map((a) => {
      const pix = state.pixelChoice[a.id];
      const risk = [];
      if (a.pageRevoked) risk.push(`<span class="chip err">страница отозвана</span>`);
      if (a.currency !== SOURCE.currency) risk.push(`<span class="chip warn">пересчёт бюджета</span>`);
      if (pix === "__create__") risk.push((a.pixels || []).length
        ? `<span class="chip info">переиспользуем пиксель</span>`
        : `<span class="chip info">создадим пиксель</span>`);
      else risk.push(`<span class="chip ok">пиксель выбран</span>`);
      if (a.kind !== "bm") risk.push(`<span class="chip">каталог недоступен</span>`);
      return `<tr>
        <td><div class="who">${a.name}<span class="id">${a.id}</span></div></td>
        <td>${SOURCE.page}</td>
        <td>${pix === "__create__" ? "новый (POST adspixels)" : pix}</td>
        <td>${a.kind === "bm" ? "копия в " + a.biz : "—"}</td>
        <td>${a.kind === "bm" ? "DRAFT" : "PAUSED"}</td>
        <td>${budgetFor(a)}</td>
        <td>${risk.join("")}</td>
      </tr>`;
    }).join("");
    q(".preview-hint").textContent = `Проверено ${chosen.length} кабинетов. Пиксель Meta разрешает один на кабинет: где он уже есть — берём существующий.`;
    log(`preflight: ${chosen.length} кабинетов, ошибок 0`);
  }

  const PHASES = ["пакет", "медиа", "пиксель", "кампания", "адсеты", "объявления", "проверка"];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function renderJobs() {
    q(".jobs").innerHTML = state.jobs.map((j) => `<div class="job ${j.state}">
      <div><b>${j.account.name}</b> <span style="color:#777;font-size:10px">· ${j.account.id}</span>
        <div class="ph">${j.phaseText || "в очереди"}</div></div>
      <div>${j.state === "done" ? `<span class="chip ok">готово</span>`
        : j.state === "fail" ? `<span class="chip err">ошибка</span>`
        : j.state === "rollback" ? `<span class="chip warn">откат выполнен</span>`
        : j.state === "running" ? `<span class="chip info">идёт</span>`
        : j.state === "cancelled" ? `<span class="chip warn">отменено</span>`
        : `<span class="chip">в очереди</span>`}</div>
    </div>`).join("");
    const done = state.jobs.filter((j) => j.state === "done").length;
    const rolled = state.jobs.filter((j) => j.state === "rollback").length;
    q(".c-done").textContent = done;
    q(".c-rollback").textContent = rolled;
    q(".c-queue").textContent = state.jobs.filter((j) => j.state === "queued").length;
    const active = state.jobs.find((j) => j.state === "running");
    q(".c-now").textContent = active ? active.account.name : "—";
    q(".run-card .progress > i").style.width = state.jobs.length
      ? Math.round(((done + rolled) / state.jobs.length) * 100) + "%" : "0";
    q(".retry").disabled = !rolled || state.running;
  }

  async function runJob(job) {
    job.state = "running";
    const failsAt = job.account.pageRevoked ? "объявления" : null;
    for (const phase of PHASES) {
      if (state.stop) { job.state = "cancelled"; job.phaseText = "остановлено"; renderJobs(); return; }
      job.phaseText = phase + "…";
      renderJobs();
      await sleep(240 + Math.random() * 260);
      if (failsAt && phase === failsAt) {
        log(`[${job.account.name}] ошибка на «${phase}»: страница недоступна для кабинета (#200)`);
        job.phaseText = "ошибка: страница недоступна (#200) → удаляю созданное";
        job.state = "fail";
        renderJobs();
        await sleep(500);
        log(`[${job.account.name}] откат: кампания удалена, 3 адсета, 12 объявлений, 14 медиа — очищено`);
        job.state = "rollback";
        job.phaseText = "ошибка на объявлениях · созданное в кабинете удалено";
        renderJobs();
        return;
      }
    }
    job.state = "done";
    job.phaseText = `кампания 12023${job.account.id.slice(-6)} · 3 адсета · 12 объявлений`;
    log(`[${job.account.name}] клонировано: кампания 12023${job.account.id.slice(-6)}`);
    renderJobs();
  }

  async function startClone() {
    if (state.running || !state.selected.size) return;
    if (!state.preflighted) renderPreview();
    state.running = true;
    state.stop = false;
    q(".card-src").classList.add("hidden");
    q(".card-targets").classList.add("hidden");
    q(".preview-card").classList.add("hidden");
    q(".run-card").classList.remove("hidden");
    q(".run-card").scrollIntoView({ block: "nearest" });
    q(".stop").disabled = false;
    q(".edit-selection").disabled = true;
    state.jobs = ACCOUNTS.filter((a) => state.selected.has(a.id))
      .map((a) => ({ account: a, state: "queued", phaseText: "" }));
    renderJobs();
    for (const job of state.jobs) {
      if (state.stop) { job.state = "cancelled"; renderJobs(); continue; }
      await runJob(job);
    }
    state.running = false;
    q(".stop").disabled = true;
    q(".edit-selection").disabled = false;
    const done = state.jobs.filter((j) => j.state === "done").length;
    const rolled = state.jobs.filter((j) => j.state === "rollback").length;
    const cancelled = state.jobs.filter((j) => j.state === "cancelled").length;
    q(".runhint").textContent = `Итог: готово ${done}, откат ${rolled}`
      + (cancelled ? `, отменено ${cancelled}` : "") + ". Неупавшие кабинеты не затрагиваются.";
    log(`итог: готово ${done}, откат ${rolled}${cancelled ? `, отменено ${cancelled}` : ""}`);
    afterSelection();
    renderJobs();
  }

  qa(".tab").forEach((tab) => {
    tab.onclick = () => {
      qa(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      qa(".pane").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== tab.dataset.tab));
    };
  });
  const LAYOUTS = [
    { w: 900, centered: false, name: "сбоку 900" },
    { w: 580, centered: true, name: "центр 580 (как сейчас)" },
    { w: 760, centered: true, name: "центр 760" },
  ];
  let layoutIdx = 0;
  q(".layout-toggle").onclick = () => {
    layoutIdx = (layoutIdx + 1) % LAYOUTS.length;
    const layout = LAYOUTS[layoutIdx];
    const panel = q(".panel");
    panel.classList.toggle("centered", layout.centered);
    panel.style.width = layout.w + "px";
    q(".layout-toggle").textContent = layout.name;
    if (state.preflighted) renderPreview();
  };
  q(".gear").onclick = () => q(".menu").classList.toggle("hidden");
  q(".close").onclick = () => root.remove();
  q(".master").onchange = (e) => {
    state.selected.clear();
    if (e.target.checked) ACCOUNTS.forEach((a) => state.selected.add(a.id));
    renderTargets();
  };
  q(".show-preview").onclick = () => { renderPreview(); q(".preview-card").scrollIntoView({ block: "nearest" }); };
  q(".clone").onclick = startClone;
  q(".stop").onclick = () => { state.stop = true; q(".stop").disabled = true; };
  q(".edit-selection").onclick = () => {
    q(".card-src").classList.remove("hidden");
    q(".card-targets").classList.remove("hidden");
    if (state.preflighted) q(".preview-card").classList.remove("hidden");
    q(".card-src").scrollIntoView({ block: "nearest" });
  };
  q(".reset").onclick = () => {
    state.jobs = [];
    state.preflighted = false;
    q(".run-card").classList.add("hidden");
    q(".preview-card").classList.add("hidden");
    q(".card-src").classList.remove("hidden");
    q(".card-targets").classList.remove("hidden");
    q(".console").innerHTML = "";
    q(".runhint").textContent = "Если кабинет падает, созданное в нём удаляется автоматически.";
  };
  q(".retry").onclick = () => {
    const failed = state.jobs.filter((j) => j.state === "rollback").map((j) => j.account);
    state.selected = new Set(failed.map((a) => a.id));
    renderTargets();
    state.jobs = [];
    startClone();
  };
  q(".dl").onclick = () => log("log сохранён в файл (в реальном AdReplica — скачивание txt)");
  q(".do-export").onclick = () => {
    const el = q(".export-result");
    el.classList.remove("hidden");
    el.textContent = "Готово: campaign_12023918643.json · 14 медиафайлов · 38.4 МБ сохранено в загрузки";
    log("export: JMS1 · Juan1 Lang Retry → campaign_12023918643.json");
  };
  q(".do-import").onclick = () => {
    const el = q(".import-result");
    el.classList.remove("hidden");
    el.textContent = "Готово: кампания 12023918777 создана из пакета · 3 адсета · 12 объявлений · PAUSED";
    log("import: пакет → L3A3 · 974116454358643, кампания 12023918777");
  };

  renderTargets();
  log("AdReplica 261026b1 · прототип интерфейса");
  if (!EMBED) {
    const viz = document.createElement("div");
    viz.className = "viz";
    viz.innerHTML = `<span><b>Макет</b> — интерфейс AdReplica поверх Ads Manager</span>`;
    root.appendChild(viz);
  }
  window.__adreplicaPrototype = { state, renderPreview, startClone };
  return "mounted";
})();
