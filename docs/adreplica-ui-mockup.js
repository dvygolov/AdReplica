/**
 * AdReplica — full interface prototype (EN/RU).
 *
 * Renders the whole panel (Export / Import / Clone + Logs + service menu) with the
 * mass-clone flow redesigned per the review:
 *   - no "active/all/none" buttons: one master checkbox in the table header;
 *   - only active ad accounts are listed (disabled ones are not shown at all);
 *   - per-account pixel choice with a sensible default;
 *   - currency mismatch is cloned with a budget conversion;
 *   - strictly sequential run;
 *   - a failed account is rolled back automatically (created objects deleted).
 *
 * Language: flag switch left of the service gear, English by default, the choice
 * is stored in localStorage so the next load opens in the same language.
 *
 * Standalone: open the html wrapper, a mock Ads Manager backdrop is drawn.
 * Injected: evaluated inside a real Ads Manager tab, the backdrop is skipped and
 * the panel sits centred in the viewport (760 px wide — the narrowest centred
 * width at which the target table still fits without horizontal scrolling).
 *
 * Account ids, names, business managers, currencies and known pixels come from a
 * live YellowFox profile; pixel state for unprobed accounts is marked as demo.
 */
(() => {
  const EMBED = window.location.protocol !== "file:";
  const ROOT_ID = "adreplica-full-prototype";
  const LANG_KEY = "adreplica.prototype.lang";
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById("adreplica-prototype-style")?.remove();

  const USD_PHP = 58.5;
  const PANEL_WIDTH = 760;

  const ACCOUNTS = [
    {
      id: "974116454358643",
      name: "L3A3",
      kind: "personal",
      currency: "USD",
      pixels: ["1621554896153020"],
    },
    {
      id: "796194912465909",
      name: "L3A9",
      kind: "personal",
      currency: "USD",
      pixels: ["1693276409004593", "1184530629974612"],
    },
    {
      id: "3712757899043650",
      name: "L3A4",
      kind: "personal",
      currency: "USD",
      pixels: null,
    },
    {
      id: "1306348530321309",
      name: "L3A8",
      kind: "personal",
      currency: "USD",
      pixels: null,
    },
    {
      id: "1779940055831443",
      name: "L3A6",
      kind: "personal",
      currency: "USD",
      pixels: null,
    },
    {
      id: "1635614067189984",
      name: "L3A7",
      kind: "personal",
      currency: "USD",
      pixels: null,
      pageRevoked: true,
    },
    {
      id: "2313829705488751",
      name: "L3A5",
      kind: "personal",
      currency: "USD",
      pixels: null,
    },
    {
      id: "426472413446384",
      name: "Juan Miguel S. Bernardo",
      kind: "personal",
      currency: "PHP",
      pixels: null,
    },
    {
      id: "343643318385126",
      name: "L3A2",
      kind: "personal",
      currency: "USD",
      pixels: null,
    },
    {
      id: "3950356461902900",
      name: "JMS1",
      kind: "bm",
      biz: "Juan Miguel S.",
      currency: "USD",
      pixels: ["2457052461465059", "1524646825519080"],
    },
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
    page: "Chelsea Daniam",
  };

  const MEDIA_FILES = [
    { name: "reel_01.mp4", size: "11.4 MB", kind: "video" },
    { name: "reel_02.mp4", size: "9.8 MB", kind: "video" },
    { name: "static_a.jpg", size: "412 KB", kind: "image" },
    { name: "static_b.jpg", size: "388 KB", kind: "image" },
    { name: "reel_03.mp4", size: "16.3 MB", kind: "video" },
    { name: "static_c.jpg", size: "301 KB", kind: "image" },
  ];

  const I18N = {
    en: {
      ver: "261026b1 · full interface prototype",
      "badge.prototype": "prototype",
      "btn.gear": "Service",
      "btn.close": "Close",
      "menu.clearDrafts": "Clear Drafts",
      "menu.prevVersion": "Load previous version",
      "tab.export": "Export",
      "tab.import": "Import",
      "tab.clone": "Clone",
      "logs.title": "Log",
      "logs.download": "Download log",
      "lang.ru": "Russian",
      "lang.en": "English",
      "log.started": "AdReplica 261026b1 · interface prototype",
      "log.saved":
        "log saved to a file (the shipped AdReplica downloads a txt)",

      "export.title": "Export campaign",
      "export.hint":
        "Saves the JSON package and media files to disk — to import into another account or keep a backup.",
      "export.result":
        "Done: campaign_12023918643.json · 14 media files · 38.4 MB saved to downloads",
      "import.title": "Import campaign from file",
      "import.json": "Export JSON",
      "import.hint":
        "Package media is uploaded again when the account library does not have the files.",
      "import.result":
        "Done: campaign 12023918777 created from the package · 3 ad sets · 12 ads · PAUSED",
      "import.mappings": "Mappings for this account",
      "import.packageLog":
        "import: package → L3A3 · 974116454358643, campaign 12023918777",
      "export.log":
        "export: JMS1 · Juan1 Lang Retry → campaign_12023918643.json",

      "field.account": "Account",
      "field.sourceAccount": "Source Account",
      "field.campaign": "Campaign",
      "field.campaignName": "Campaign name",
      "field.campaignNameTargets": "Campaign name in targets",
      "field.mode": "Mode",
      "field.cloneMode": "Clone mode",
      "field.fanPage": "Fan page (source → target)",
      "field.pixel": "Pixel",
      "field.catalog": "Catalog",
      "field.file": "File",
      "field.kind": "Kind",
      "field.size": "Size",
      "field.type": "Type",
      "field.currency": "Currency",
      "field.budget": "Budget",
      "field.risk": "Risk",
      "ph.packageName": "Defaults to the package name",
      "opt.notSelected": "Not selected",
      "opt.createPixel": "Create new (account already has one — reuse it)",
      "opt.noPixel": "No pixel → create new",
      "opt.reuseExisting": "Create new (reuse the existing one)",
      "opt.noBm": "— (no BM in this account)",

      "clone.sec1": "1 · What to clone",
      "clone.sec2": "2 · Where to clone",
      "clone.sec2note": "— active accounts only",
      "clone.sec3": "3 · Mapping preview",
      "clone.sec3note": "— nothing is created",
      "clone.sec4": "4 · Run",
      "clone.sec4note": "— sequential, one account at a time",
      "stat.adsets": "ad sets",
      "stat.ads": "ads",
      "stat.creatives": "creatives",
      "stat.media": "media files",
      "stat.budget": "budget / ad set",
      "stat.catalog": "catalog",
      "media.summary": "Media in the package ({count} files · 38.4 MB)",
      "kind.video": "video",
      "kind.image": "image",
      "type.personal": "personal",
      "type.bm": "BM",
      "catalog.copyInto": "copy into {biz}",
      "currency.convert": "{cur} · convert ×{rate}",
      "master.title": "Select all",
      "sel.count": "Selected {n} of {total}",
      "btn.preview": "Preview",
      "btn.clone": "Clone",
      "btn.cloneTo": "Clone to {n} accounts",
      "btn.stop": "Stop",
      "btn.retry": "Retry failed accounts",
      "btn.reset": "Reset",
      "preview.newPixel": "new (POST adspixels)",
      "risk.pageRevoked": "page revoked",
      "risk.budgetConverted": "budget converted",
      "risk.reusingPixel": "reusing the pixel",
      "risk.creatingPixel": "will create a pixel",
      "risk.pixelSelected": "pixel selected",
      "risk.noCatalog": "no catalog",
      "preview.hint":
        "Checked {n} accounts. Meta allows one pixel per account: an existing one is reused.",
      "preview.log": "preflight: {n} accounts, 0 errors",
      "budget.day": "${amount} / day",
      "budget.dayForeign": "{amount} {cur} / day",
      "run.done": "done",
      "run.rolled": "rolled back",
      "run.queued": "queued",
      "run.current": "current",
      "run.hint": "If an account fails, whatever was created in it is deleted.",
      "run.result": "Result: {done} done, {rolled} rolled back.",
      "run.resultCancel":
        "Result: {done} done, {rolled} rolled back, {cancelled} cancelled.",
      "run.untouched": "Successful accounts are untouched.",
      "run.logResult": "result: {done} done, {rolled} rolled back",
      "run.logResultCancel":
        "result: {done} done, {rolled} rolled back, {cancelled} cancelled",
      "job.queued": "queued",
      "job.step": "{phase}…",
      "job.stopped": "stopped",
      "job.failPage":
        "failed: page not available (#200) → deleting created objects",
      "job.failedOnAds": "failed on ads · created objects deleted",
      "job.done": "campaign {id} · 3 ad sets · 12 ads",
      "phase.package": "package",
      "phase.media": "media",
      "phase.pixel": "pixel",
      "phase.campaign": "campaign",
      "phase.adsets": "ad sets",
      "phase.ads": "ads",
      "phase.verify": "verify",
      "state.done": "done",
      "state.failed": "failed",
      "state.rolled": "rolled back",
      "state.running": "running",
      "state.cancelled": "cancelled",
      "state.queued": "queued",
      "log.cloned": "[{account}] cloned: campaign {id}",
      "log.failPage":
        '[{account}] failed on "{phase}": page not available for the account (#200)',
      "log.rollback":
        "[{account}] rollback: campaign deleted, 3 ad sets, 12 ads, 14 media — cleaned",
      "backdrop.hint": "Select a campaign row to open the AdReplica panel",
      "viz.text": "the AdReplica interface over Ads Manager",
    },
    ru: {
      ver: "261026b1 · прототип интерфейса",
      "badge.prototype": "макет",
      "btn.gear": "Сервис",
      "btn.close": "Закрыть",
      "menu.clearDrafts": "Очистить черновики",
      "menu.prevVersion": "Загрузить предыдущую версию",
      "tab.export": "Экспорт",
      "tab.import": "Импорт",
      "tab.clone": "Клон",
      "logs.title": "Журнал",
      "logs.download": "Скачать журнал",
      "lang.ru": "Русский",
      "lang.en": "English",
      "log.started": "AdReplica 261026b1 · прототип интерфейса",
      "log.saved":
        "журнал сохранён в файл (в реальном AdReplica — скачивание txt)",

      "export.title": "Экспорт кампании",
      "export.hint":
        "Сохраняет JSON-пакет и медиафайлы на диск — для импорта в другой кабинет или бэкапа.",
      "export.result":
        "Готово: campaign_12023918643.json · 14 медиафайлов · 38.4 МБ сохранено в загрузки",
      "import.title": "Импорт кампании из файла",
      "import.json": "Export JSON",
      "import.hint":
        "Медиа из пакета загружаются в кабинет заново, если файлов нет в библиотеке.",
      "import.result":
        "Готово: кампания 12023918777 создана из пакета · 3 адсета · 12 объявлений · PAUSED",
      "import.mappings": "Маппинги для этого кабинета",
      "import.packageLog":
        "импорт: пакет → L3A3 · 974116454358643, кампания 12023918777",
      "export.log":
        "экспорт: JMS1 · Juan1 Lang Retry → campaign_12023918643.json",

      "field.account": "Кабинет",
      "field.sourceAccount": "Кабинет-источник",
      "field.campaign": "Кампания",
      "field.campaignName": "Название кампании",
      "field.campaignNameTargets": "Название кампании в кабинетах",
      "field.mode": "Режим",
      "field.cloneMode": "Режим клона",
      "field.fanPage": "Страница (source → target)",
      "field.pixel": "Пиксель",
      "field.catalog": "Каталог",
      "field.file": "Файл",
      "field.kind": "Тип",
      "field.size": "Размер",
      "field.type": "Тип",
      "field.currency": "Валюта",
      "field.budget": "Бюджет",
      "field.risk": "Риск",
      "ph.packageName": "По умолчанию — имя из пакета",
      "opt.notSelected": "Не выбрана",
      "opt.createPixel": "Создать новый (в кабинете уже есть — переиспользуем)",
      "opt.noPixel": "Нет пикселя → создать новый",
      "opt.reuseExisting": "Создать новый (переиспользуем существующий)",
      "opt.noBm": "— (в кабинете нет BM)",

      "clone.sec1": "1 · Что клонируем",
      "clone.sec2": "2 · Куда клонируем",
      "clone.sec2note": "— только активные кабинеты",
      "clone.sec3": "3 · Предпросмотр маппингов",
      "clone.sec3note": "— ничего не создаётся",
      "clone.sec4": "4 · Выполнение",
      "clone.sec4note": "— последовательно, по одному кабинету",
      "stat.adsets": "адсета",
      "stat.ads": "объявлений",
      "stat.creatives": "креативов",
      "stat.media": "медиафайлов",
      "stat.budget": "бюджет / адсет",
      "stat.catalog": "каталог",
      "media.summary": "Медиа в пакете ({count} файлов · 38.4 МБ)",
      "kind.video": "видео",
      "kind.image": "изображение",
      "type.personal": "личный",
      "type.bm": "БМ",
      "catalog.copyInto": "копия в {biz}",
      "currency.convert": "{cur} · пересчёт ×{rate}",
      "master.title": "Выбрать все",
      "sel.count": "Выбрано {n} из {total}",
      "btn.preview": "Предпросмотр",
      "btn.clone": "Клонировать",
      "btn.cloneTo": "Клонировать в {n} кабинетов",
      "btn.stop": "Стоп",
      "btn.retry": "Повторить упавшие",
      "btn.reset": "Сбросить",
      "preview.newPixel": "новый (POST adspixels)",
      "risk.pageRevoked": "страница отозвана",
      "risk.budgetConverted": "пересчёт бюджета",
      "risk.reusingPixel": "переиспользуем пиксель",
      "risk.creatingPixel": "создадим пиксель",
      "risk.pixelSelected": "пиксель выбран",
      "risk.noCatalog": "каталог недоступен",
      "preview.hint":
        "Проверено {n} кабинетов. Пиксель Meta разрешает один на кабинет: где он уже есть — берём существующий.",
      "preview.log": "preflight: {n} кабинетов, ошибок 0",
      "budget.day": "{amount} / день",
      "budget.dayForeign": "{amount} {cur} / день",
      "run.done": "готово",
      "run.rolled": "откат",
      "run.queued": "в очереди",
      "run.current": "сейчас",
      "run.hint":
        "Если кабинет падает, созданное в нём удаляется автоматически.",
      "run.result": "Итог: готово {done}, откат {rolled}.",
      "run.resultCancel":
        "Итог: готово {done}, откат {rolled}, отменено {cancelled}.",
      "run.untouched": "Неупавшие кабинеты не затрагиваются.",
      "run.logResult": "итог: готово {done}, откат {rolled}",
      "run.logResultCancel":
        "итог: готово {done}, откат {rolled}, отменено {cancelled}",
      "job.queued": "в очереди",
      "job.step": "{phase}…",
      "job.stopped": "остановлено",
      "job.failPage": "ошибка: страница недоступна (#200) → удаляю созданное",
      "job.failedOnAds": "ошибка на объявлениях · созданное в кабинете удалено",
      "job.done": "кампания {id} · 3 адсета · 12 объявлений",
      "phase.package": "пакет",
      "phase.media": "медиа",
      "phase.pixel": "пиксель",
      "phase.campaign": "кампания",
      "phase.adsets": "адсеты",
      "phase.ads": "объявления",
      "phase.verify": "проверка",
      "state.done": "готово",
      "state.failed": "ошибка",
      "state.rolled": "откат выполнен",
      "state.running": "идёт",
      "state.cancelled": "отменено",
      "state.queued": "в очереди",
      "log.cloned": "[{account}] клонировано: кампания {id}",
      "log.failPage":
        "[{account}] ошибка на «{phase}»: страница недоступна для кабинета (#200)",
      "log.rollback":
        "[{account}] откат: кампания удалена, 3 адсета, 12 объявлений, 14 медиа — очищено",
      "backdrop.hint": "Выберите кампанию, чтобы открыть панель AdReplica",
      "viz.text": "интерфейс AdReplica поверх Ads Manager",
    },
  };

  const readLang = () => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === "en" || stored === "ru") return stored;
    } catch {
      /* storage may be blocked (file:, third-party context) */
    }
    return "en";
  };

  let lang = readLang();
  const t = (key, vars) => {
    const template = I18N[lang]?.[key] ?? I18N.en[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] === undefined ? "" : String(vars[k]),
    );
  };

  const CSS = `
  #${ROOT_ID}{position:${EMBED ? "fixed" : "relative"};${EMBED ? "inset:0;" : ""}z-index:2147483647;
    font-family:"Segoe UI","Trebuchet MS",sans-serif;pointer-events:none}
  #${ROOT_ID} *{box-sizing:border-box}
  #${ROOT_ID} .panel{position:absolute;top:16px;bottom:16px;left:50%;transform:translateX(-50%);
    width:${PANEL_WIDTH}px;display:flex;
    flex-direction:column;background:#1a1a1a;color:#f5f5f5;border:2px solid #ffc107;border-radius:10px;
    box-shadow:0 12px 40px rgba(0,0,0,.7);pointer-events:auto;font-size:12.5px;overflow:hidden}
  #${ROOT_ID} .head{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #333;
    background:linear-gradient(180deg,#242400,#1a1a1a)}
  #${ROOT_ID} .mark{width:26px;height:26px;flex:0 0 auto;border-radius:7px;background:#ffc107;color:#1a1a1a;
    display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px}
  #${ROOT_ID} .head h1{margin:0;font-size:15px;color:#ffc107;letter-spacing:.02em}
  #${ROOT_ID} .head .ver{color:#8a8a8a;font-size:10px;letter-spacing:.05em}
  #${ROOT_ID} .head .right{margin-left:auto;display:flex;gap:6px;align-items:center}
  #${ROOT_ID} .lang{display:flex;gap:3px;padding:2px;background:#141414;border:1px solid #3a3a3a;border-radius:7px}
  #${ROOT_ID} .lang button{display:flex;align-items:center;justify-content:center;padding:2px 3px;line-height:0;
    border:1px solid transparent;background:transparent;opacity:.42;border-radius:4px;cursor:pointer}
  #${ROOT_ID} .lang button:hover{opacity:.85}
  #${ROOT_ID} .lang button.active{opacity:1;background:#2f2f2f;border-color:#ffc107}
  #${ROOT_ID} .lang button svg{display:block;border-radius:1px;outline:1px solid rgba(255,255,255,.18)}
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
  #${ROOT_ID} table{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed}
  #${ROOT_ID} th,#${ROOT_ID} td{text-align:left;padding:5px 7px;border-bottom:1px solid #2b2b2b;vertical-align:middle;
    overflow-wrap:anywhere}
  #${ROOT_ID} th{color:#b9b9b9;font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:600;
    background:#1d1d1d;position:sticky;top:0}
  #${ROOT_ID} .t-targets{min-width:600px}
  #${ROOT_ID} .t-preview{min-width:690px}
  #${ROOT_ID} .t-targets th:first-child,#${ROOT_ID} .t-targets td:first-child{width:30px;padding-right:0}
  #${ROOT_ID} .t-targets th:nth-child(2){width:30%}
  #${ROOT_ID} .t-targets th:nth-child(3){width:13%}
  #${ROOT_ID} .t-targets th:nth-child(4){width:19%}
  #${ROOT_ID} .t-targets th:nth-child(5){width:19%}
  #${ROOT_ID} .t-targets th:nth-child(6){width:19%}
  #${ROOT_ID} .t-preview th:nth-child(1){width:19%}
  #${ROOT_ID} .t-preview th:nth-child(2){width:11%}
  #${ROOT_ID} .t-preview th:nth-child(3){width:16%}
  #${ROOT_ID} .t-preview th:nth-child(4){width:13%}
  #${ROOT_ID} .t-preview th:nth-child(5){width:8%}
  #${ROOT_ID} .t-preview th:nth-child(6){width:11%}
  #${ROOT_ID} .t-preview th:nth-child(7){width:22%}
  #${ROOT_ID} .preview-body td{padding:4px 6px;font-size:11px}
  #${ROOT_ID} .preview-body .chip{font-size:9.5px;padding:1px 5px;margin:1px 2px 1px 0}
  #${ROOT_ID} .preview-body .who .id{font-size:9px}
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

  const state = {
    selected: new Set(),
    pixelChoice: {},
    preflighted: false,
    running: false,
    stop: false,
    jobs: [],
    logs: [],
    tab: "clone",
  };
  for (const a of ACCOUNTS)
    state.pixelChoice[a.id] = a.pixels?.[0] || "__create__";

  let root = null;
  const q = (sel) => root.querySelector(sel);
  const qa = (sel) => [...root.querySelectorAll(sel)];

  function log(key, vars) {
    state.logs.push({ key, vars });
    if (root) renderLogs();
  }

  function renderLogs() {
    const area = q(".logs textarea");
    area.value = state.logs.map((entry) => t(entry.key, entry.vars)).join("\n");
    area.scrollTop = area.scrollHeight;
  }

  const chip = (text, cls) => `<span class="chip ${cls || ""}">${text}</span>`;

  function amBackdrop() {
    return `<div class="am">
      <div class="top"><div class="dot"></div><b>Ads Manager</b><span class="pill">Opportunity score 100</span>
        <span style="color:#606770">act_1117375422709051</span></div>
      <div class="rail"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="main">
        <h3>Campaigns</h3>
        <div class="sub">${SOURCE.campaign} · ${SOURCE.status} · Daily budget $${SOURCE.budgetPerAdset}.00</div>
        <div class="tabs2"><span class="on">Campaigns</span><span>Ad sets</span><span>Ads</span></div>
        <div class="toolbar2"><span class="btn2 blue">+ Create</span><span class="btn2">Duplicate</span>
          <span class="btn2">Edit</span><span class="btn2">A/B test</span><span class="btn2">More</span></div>
        <div class="empty">${t("backdrop.hint")}</div>
        <div class="ghost"><div style="width:60%"></div><div style="width:80%"></div><div style="width:45%"></div></div>
      </div>
    </div>`;
  }

  const FLAGS = {
    ru: `<svg viewBox="0 0 60 36" width="18" height="11" aria-hidden="true"><rect width="60" height="12" fill="#fff"/>
      <rect y="12" width="60" height="12" fill="#0039A6"/><rect y="24" width="60" height="12" fill="#D52B1E"/></svg>`,
    en: `<svg viewBox="0 0 60 36" width="18" height="11" aria-hidden="true"><rect width="60" height="36" fill="#012169"/>
      <path d="M0,0 60,36 M60,0 0,36" stroke="#fff" stroke-width="7"/>
      <path d="M0,0 60,36 M60,0 0,36" stroke="#C8102E" stroke-width="3"/>
      <path d="M30,0 V36 M0,18 H60" stroke="#fff" stroke-width="11"/>
      <path d="M30,0 V36 M0,18 H60" stroke="#C8102E" stroke-width="6"/></svg>`,
  };

  function shell() {
    const flags = ["ru", "en"]
      .map(
        (
          code,
        ) => `<button class="flag${lang === code ? " active" : ""}" data-lang="${code}"
        title="${t("lang." + code)}" aria-pressed="${lang === code}">${FLAGS[code]}</button>`,
      )
      .join("");
    return `${EMBED ? "" : amBackdrop()}
    <div class="panel">
      <div class="head">
        <div class="mark">A</div>
        <div>
          <h1>AdReplica</h1>
          <div class="ver">${t("ver")}</div>
        </div>
        <div class="right">
          ${chip(t("badge.prototype"), "warn")}
          <div class="lang">${flags}</div>
          <button class="gear" title="${t("btn.gear")}">⚙</button>
          <button class="close" title="${t("btn.close")}">✕</button>
        </div>
        <div class="menu hidden">
          <button>${t("menu.clearDrafts")}</button>
          <button>${t("menu.prevVersion")}</button>
        </div>
      </div>
      <div class="tabs">
        <button class="tab${state.tab === "export" ? " active" : ""}" data-tab="export">${t("tab.export")}</button>
        <button class="tab${state.tab === "import" ? " active" : ""}" data-tab="import">${t("tab.import")}</button>
        <button class="tab${state.tab === "clone" ? " active" : ""}" data-tab="clone">${t("tab.clone")}</button>
      </div>
      <div class="body">
        ${panelExport()}
        ${panelImport()}
        ${panelClone()}
      </div>
      <div class="logs">
        <div class="lhead"><span>${t("logs.title")}</span>
          <div class="right"><button class="dl">${t("logs.download")}</button></div></div>
        <textarea readonly></textarea>
      </div>
    </div>`;
  }

  function panelExport() {
    return `<div class="pane${state.tab === "export" ? "" : " hidden"}" data-pane="export">
      <section class="card">
        <h2>${t("export.title")}</h2>
        <div class="row">
          <label class="field"><span>${t("field.account")}</span>
            <select><option>${SOURCE.account}</option><option>L3A3 · 974116454358643</option></select></label>
          <label class="field"><span>${t("field.campaign")}</span>
            <select><option>${SOURCE.campaign} · ${SOURCE.status}</option><option>AdReplica Catalog Source · PAUSED</option></select></label>
        </div>
        <div class="bar">
          <div class="hintline">${t("export.hint")}</div>
          <div class="right"><button class="primary do-export">${t("tab.export")}</button></div>
        </div>
        <div class="result export-result hidden"></div>
      </section>
    </div>`;
  }

  function panelImport() {
    return `<div class="pane${state.tab === "import" ? "" : " hidden"}" data-pane="import">
      <section class="card">
        <h2>${t("import.title")}</h2>
        <div class="row">
          <label class="field"><span>${t("field.account")}</span>
            <select><option>L3A3 · 974116454358643</option><option>${SOURCE.account}</option></select></label>
          <label class="field"><span>${t("import.json")}</span>
            <input type="file" accept=".json,application/json" /></label>
        </div>
        <div class="row" style="margin-top:8px">
          <label class="field"><span>${t("field.campaignName")}</span>
            <input type="text" placeholder="${t("ph.packageName")}" /></label>
          <label class="field"><span>${t("field.mode")}</span>
            <select><option>PAUSED</option><option>DRAFT</option><option>ACTIVE</option></select></label>
        </div>
        <details open><summary>${t("import.mappings")}</summary>
          <div class="row" style="margin-top:8px">
            <label class="field"><span>${t("field.fanPage")}</span>
              <select><option>${SOURCE.page} → ${SOURCE.page}</option><option>${t("opt.notSelected")}</option></select></label>
            <label class="field"><span>${t("field.pixel")}</span>
              <select><option>1621554896153020 (L3A3 pixel)</option>
                <option>${t("opt.createPixel")}</option></select></label>
            <label class="field"><span>${t("field.catalog")}</span><select><option>${t("opt.noBm")}</option></select></label>
          </div>
        </details>
        <div class="bar">
          <div class="hintline">${t("import.hint")}</div>
          <div class="right"><button class="primary do-import">${t("tab.import")}</button></div>
        </div>
        <div class="result import-result hidden"></div>
      </section>
    </div>`;
  }

  function panelClone() {
    return `<div class="pane${state.tab === "clone" ? "" : " hidden"}" data-pane="clone">
      <section class="card card-src">
        <h2>${t("clone.sec1")}</h2>
        <div class="row">
          <label class="field"><span>${t("field.sourceAccount")}</span>
            <select><option>${SOURCE.account}</option><option>L3A3 · 974116454358643</option></select></label>
          <label class="field"><span>${t("field.campaign")}</span>
            <select><option>${SOURCE.campaign} · ${SOURCE.status}</option><option>AdReplica Catalog Source · PAUSED</option></select></label>
        </div>
        <div class="grid">
          <div class="stat"><b>${SOURCE.adsets}</b><span>${t("stat.adsets")}</span></div>
          <div class="stat"><b>${SOURCE.ads}</b><span>${t("stat.ads")}</span></div>
          <div class="stat"><b>${SOURCE.creatives}</b><span>${t("stat.creatives")}</span></div>
          <div class="stat"><b>${SOURCE.media}</b><span>${t("stat.media")}</span></div>
          <div class="stat"><b>$${SOURCE.budgetPerAdset}</b><span>${t("stat.budget")}</span></div>
          <div class="stat"><b>1</b><span>${t("stat.catalog")}</span></div>
        </div>
        <details><summary>${t("media.summary", { count: SOURCE.media })}</summary>
          <table style="margin-top:8px"><thead><tr><th>${t("field.file")}</th><th>${t("field.kind")}</th>
            <th>${t("field.size")}</th></tr></thead><tbody>
            ${MEDIA_FILES.map(
              (
                f,
              ) => `<tr><td>${f.name}</td><td>${f.kind ? t("kind." + f.kind) : ""}</td>
              <td>${f.size}</td></tr>`,
            ).join("")}
          </tbody></table>
        </details>
        <div class="row" style="margin-top:9px">
          <label class="field"><span>${t("field.campaignNameTargets")}</span>
            <input type="text" value="${SOURCE.campaign} — copy" /></label>
          <label class="field"><span>${t("field.cloneMode")}</span>
            <select><option>PAUSED</option><option>DRAFT</option><option>ACTIVE</option></select></label>
        </div>
      </section>

      <section class="card card-targets">
        <h2>${t("clone.sec2")} <span class="count">${t("clone.sec2note")}</span></h2>
        <div class="scroll">
          <table class="t-targets">
            <thead><tr>
              <th><input type="checkbox" class="master" title="${t("master.title")}" /></th>
              <th>${t("field.account")}</th>
              <th>${t("field.type")}</th>
              <th>${t("field.pixel")}</th>
              <th>${t("field.catalog")}</th>
              <th>${t("field.currency")}</th>
            </tr></thead>
            <tbody class="targets"></tbody>
          </table>
        </div>
        <div class="bar">
          <div class="hintline selcount"></div>
          <div class="right">
            <button class="show-preview" disabled>${t("btn.preview")}</button>
            <button class="primary clone" disabled>${t("btn.clone")}</button>
          </div>
        </div>
      </section>

      <section class="card hidden preview-card">
        <h2>${t("clone.sec3")} <span class="count">${t("clone.sec3note")}</span></h2>
        <div class="scroll" style="max-height:230px">
          <table class="t-preview">
            <thead><tr><th>${t("field.account")}</th><th>${t("field.fanPage")}</th><th>${t("field.pixel")}</th>
              <th>${t("field.catalog")}</th><th>${t("field.mode")}</th><th>${t("field.budget")}</th>
              <th>${t("field.risk")}</th></tr></thead>
            <tbody class="preview-body"></tbody>
          </table>
        </div>
        <div class="hintline preview-hint"></div>
      </section>

      <section class="card hidden run-card">
        <h2>${t("clone.sec4")} <span class="count">${t("clone.sec4note")}</span></h2>
        <div class="progress"><i></i></div>
        <div class="row" style="gap:14px">
          <div class="hintline">${t("run.done")} <b style="color:#86efac" class="c-done">0</b></div>
          <div class="hintline">${t("run.rolled")} <b style="color:#fcd34d" class="c-rollback">0</b></div>
          <div class="hintline">${t("run.queued")} <b class="c-queue">0</b></div>
          <div class="hintline">${t("run.current")} <b class="c-now">—</b></div>
        </div>
        <div class="scroll" style="max-height:220px;margin-top:9px">
          <div class="jobs"></div>
        </div>
        <div class="console"></div>
        <div class="bar">
          <div class="hintline runhint">${t("run.hint")}</div>
          <div class="right">
            <button class="danger stop">${t("btn.stop")}</button>
            <button class="retry" disabled>${t("btn.retry")}</button>
            <button class="reset">${t("btn.reset")}</button>
          </div>
        </div>
      </section>
    </div>`;
  }

  function renderTargets() {
    q(".targets").innerHTML = ACCOUNTS.map((a) => {
      const chosen = state.pixelChoice[a.id];
      const pixOptions = (a.pixels || []).length
        ? a.pixels
            .map(
              (p) =>
                `<option value="${p}" ${chosen === p ? "selected" : ""}>${p}</option>`,
            )
            .join("") +
          `<option value="__create__" ${chosen === "__create__" ? "selected" : ""}>${t("opt.reuseExisting")}</option>`
        : `<option value="__create__">${t("opt.noPixel")}</option>`;
      const conv =
        a.currency === SOURCE.currency
          ? chip(a.currency)
          : chip(
              t("currency.convert", { cur: a.currency, rate: USD_PHP }),
              "warn",
            );
      const catalog =
        a.kind === "bm"
          ? chip(t("catalog.copyInto", { biz: a.biz }), "ok")
          : chip("—");
      const kind =
        a.kind === "bm" ? chip(t("type.bm"), "bm") : chip(t("type.personal"));
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
        if (state.preflighted) renderPreview(true);
      };
    });
    afterSelection();
  }

  function afterSelection() {
    const n = state.selected.size;
    q(".selcount").textContent = t("sel.count", { n, total: ACCOUNTS.length });
    q(".clone").textContent = n ? t("btn.cloneTo", { n }) : t("btn.clone");
    q(".clone").disabled = n === 0 || state.running;
    q(".show-preview").disabled = n === 0 || state.running;
    const master = q(".master");
    master.checked = n > 0 && n === ACCOUNTS.length;
    master.indeterminate = n > 0 && n < ACCOUNTS.length;
  }

  function budgetFor(a) {
    if (a.currency === SOURCE.currency) {
      return t("budget.day", {
        amount: "$" + SOURCE.budgetPerAdset.toFixed(2),
      });
    }
    return t("budget.dayForeign", {
      amount: Math.round(SOURCE.budgetPerAdset * USD_PHP),
      cur: a.currency,
    });
  }

  function renderPreview(silent) {
    state.preflighted = true;
    q(".preview-card").classList.remove("hidden");
    const chosen = ACCOUNTS.filter((a) => state.selected.has(a.id));
    q(".preview-body").innerHTML = chosen
      .map((a) => {
        const pix = state.pixelChoice[a.id];
        const risk = [];
        if (a.pageRevoked) risk.push(chip(t("risk.pageRevoked"), "err"));
        if (a.currency !== SOURCE.currency)
          risk.push(chip(t("risk.budgetConverted"), "warn"));
        if (pix === "__create__") {
          risk.push(
            chip(
              (a.pixels || []).length
                ? t("risk.reusingPixel")
                : t("risk.creatingPixel"),
              "info",
            ),
          );
        } else {
          risk.push(chip(t("risk.pixelSelected"), "ok"));
        }
        if (a.kind !== "bm") risk.push(chip(t("risk.noCatalog")));
        return `<tr>
        <td><div class="who">${a.name}<span class="id">${a.id}</span></div></td>
        <td>${SOURCE.page}</td>
        <td>${pix === "__create__" ? t("preview.newPixel") : pix}</td>
        <td>${a.kind === "bm" ? t("catalog.copyInto", { biz: a.biz }) : "—"}</td>
        <td>${a.kind === "bm" ? "DRAFT" : "PAUSED"}</td>
        <td>${budgetFor(a)}</td>
        <td>${risk.join("")}</td>
      </tr>`;
      })
      .join("");
    q(".preview-hint").textContent = t("preview.hint", { n: chosen.length });
    if (!silent) log("preview.log", { n: chosen.length });
  }

  const PHASES = [
    "package",
    "media",
    "pixel",
    "campaign",
    "adsets",
    "ads",
    "verify",
  ];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function jobPhaseText(job) {
    if (job.state === "done") return t("job.done", { id: job.campaign });
    if (job.phaseKey === "stopped") return t("job.stopped");
    if (job.phaseKey === "failPage") return t("job.failPage");
    if (job.phaseKey === "failedOnAds") return t("job.failedOnAds");
    if (job.phaseKey)
      return t("job.step", { phase: t("phase." + job.phaseKey) });
    return t("job.queued");
  }

  function renderJobs() {
    q(".jobs").innerHTML = state.jobs
      .map(
        (j) => `<div class="job ${j.state}">
      <div><b>${j.account.name}</b> <span style="color:#777;font-size:10px">· ${j.account.id}</span>
        <div class="ph">${jobPhaseText(j)}</div></div>
      <div>${
        j.state === "done"
          ? chip(t("state.done"), "ok")
          : j.state === "fail"
            ? chip(t("state.failed"), "err")
            : j.state === "rollback"
              ? chip(t("state.rolled"), "warn")
              : j.state === "running"
                ? chip(t("state.running"), "info")
                : j.state === "cancelled"
                  ? chip(t("state.cancelled"), "warn")
                  : chip(t("state.queued"))
      }</div>
    </div>`,
      )
      .join("");
    const done = state.jobs.filter((j) => j.state === "done").length;
    const rolled = state.jobs.filter((j) => j.state === "rollback").length;
    q(".c-done").textContent = done;
    q(".c-rollback").textContent = rolled;
    q(".c-queue").textContent = state.jobs.filter(
      (j) => j.state === "queued",
    ).length;
    const active = state.jobs.find((j) => j.state === "running");
    q(".c-now").textContent = active ? active.account.name : "—";
    q(".run-card .progress > i").style.width = state.jobs.length
      ? Math.round(((done + rolled) / state.jobs.length) * 100) + "%"
      : "0";
    q(".retry").disabled = !rolled || state.running;
  }

  async function runJob(job) {
    job.state = "running";
    const failsAt = job.account.pageRevoked ? "ads" : null;
    for (const phase of PHASES) {
      if (state.stop) {
        job.state = "cancelled";
        job.phaseKey = "stopped";
        renderJobs();
        return;
      }
      job.phaseKey = phase;
      renderJobs();
      await sleep(240 + Math.random() * 260);
      if (failsAt && phase === failsAt) {
        log("log.failPage", {
          account: job.account.name,
          phase: t("phase." + phase),
        });
        job.phaseKey = "failPage";
        job.state = "fail";
        renderJobs();
        await sleep(500);
        log("log.rollback", { account: job.account.name });
        job.state = "rollback";
        job.phaseKey = "failedOnAds";
        renderJobs();
        return;
      }
    }
    job.state = "done";
    job.campaign = "12023" + job.account.id.slice(-6);
    log("log.cloned", { account: job.account.name, id: job.campaign });
    renderJobs();
  }

  async function startClone() {
    if (state.running || !state.selected.size) return;
    if (!state.preflighted) renderPreview(true);
    state.running = true;
    state.stop = false;
    q(".card-src").classList.add("hidden");
    q(".card-targets").classList.add("hidden");
    q(".preview-card").classList.add("hidden");
    q(".run-card").classList.remove("hidden");
    q(".run-card").scrollIntoView({ block: "nearest" });
    q(".stop").disabled = false;
    state.jobs = ACCOUNTS.filter((a) => state.selected.has(a.id)).map((a) => ({
      account: a,
      state: "queued",
      phaseKey: null,
      campaign: null,
    }));
    renderJobs();
    for (const job of state.jobs) {
      if (state.stop) {
        job.state = "cancelled";
        renderJobs();
        continue;
      }
      await runJob(job);
    }
    state.running = false;
    q(".stop").disabled = true;
    const done = state.jobs.filter((j) => j.state === "done").length;
    const rolled = state.jobs.filter((j) => j.state === "rollback").length;
    const cancelled = state.jobs.filter((j) => j.state === "cancelled").length;
    q(".runhint").textContent =
      t(cancelled ? "run.resultCancel" : "run.result", {
        done,
        rolled,
        cancelled,
      }) +
      " " +
      t("run.untouched");
    log(cancelled ? "run.logResultCancel" : "run.logResult", {
      done,
      rolled,
      cancelled,
    });
    afterSelection();
    renderJobs();
  }

  function activateTab(name) {
    state.tab = name;
    qa(".tab").forEach((t2) =>
      t2.classList.toggle("active", t2.dataset.tab === name),
    );
    qa(".pane").forEach((p) =>
      p.classList.toggle("hidden", p.dataset.pane !== name),
    );
  }

  function restoreView() {
    activateTab(state.tab);
    renderTargets();
    if (state.preflighted) renderPreview(true);
    if (state.jobs.length) {
      const finished = !state.running;
      q(".run-card").classList.remove("hidden");
      if (finished) {
        q(".card-src").classList.add("hidden");
        q(".card-targets").classList.add("hidden");
        q(".preview-card").classList.add("hidden");
      }
      renderJobs();
    }
    renderLogs();
  }

  function bind() {
    qa(".tab").forEach((tab) => {
      tab.onclick = () => activateTab(tab.dataset.tab);
    });
    qa(".flag").forEach((btn) => {
      btn.onclick = () => {
        if (btn.dataset.lang === lang) return;
        lang = btn.dataset.lang;
        try {
          window.localStorage.setItem(LANG_KEY, lang);
        } catch {
          /* storage blocked: the choice lasts for this page only */
        }
        const scrollTop = q(".body").scrollTop;
        mount();
        q(".body").scrollTop = scrollTop;
      };
    });
    q(".gear").onclick = () => q(".menu").classList.toggle("hidden");
    q(".close").onclick = () => root.remove();
    q(".master").onchange = (event) => {
      state.selected.clear();
      if (event.target.checked)
        ACCOUNTS.forEach((a) => state.selected.add(a.id));
      renderTargets();
    };
    q(".show-preview").onclick = () => {
      renderPreview(false);
      q(".preview-card").scrollIntoView({ block: "nearest" });
    };
    q(".clone").onclick = startClone;
    q(".stop").onclick = () => {
      state.stop = true;
      q(".stop").disabled = true;
    };
    q(".reset").onclick = () => {
      state.jobs = [];
      state.preflighted = false;
      q(".run-card").classList.add("hidden");
      q(".preview-card").classList.add("hidden");
      q(".card-src").classList.remove("hidden");
      q(".card-targets").classList.remove("hidden");
      q(".console").innerHTML = "";
      q(".runhint").textContent = t("run.hint");
      afterSelection();
    };
    q(".retry").onclick = () => {
      const failed = state.jobs
        .filter((j) => j.state === "rollback")
        .map((j) => j.account);
      state.selected = new Set(failed.map((a) => a.id));
      renderTargets();
      state.jobs = [];
      startClone();
    };
    q(".dl").onclick = () => log("log.saved");
    q(".do-export").onclick = () => {
      const el = q(".export-result");
      el.classList.remove("hidden");
      el.textContent = t("export.result");
      log("export.log");
    };
    q(".do-import").onclick = () => {
      const el = q(".import-result");
      el.classList.remove("hidden");
      el.textContent = t("import.result");
      log("import.packageLog");
    };
  }

  function mount() {
    document.getElementById(ROOT_ID)?.remove();
    root = document.createElement("div");
    root.id = ROOT_ID;
    if (!EMBED)
      root.style.cssText =
        "position:relative;min-height:100vh;background:#f0f2f5";
    root.innerHTML = shell();
    document.body.appendChild(root);
    bind();
    restoreView();
  }

  const style = document.createElement("style");
  style.id = "adreplica-prototype-style";
  style.textContent = CSS;
  document.head.appendChild(style);

  if (!state.logs.length) log("log.started");
  mount();

  if (!EMBED) {
    const viz = document.createElement("div");
    viz.className = "viz";
    viz.innerHTML = `<span><b>${t("badge.prototype")}</b> — ${t("viz.text")}</span>`;
    root.appendChild(viz);
  }

  window.__adreplicaPrototype = {
    state,
    get lang() {
      return lang;
    },
    renderPreview,
    startClone,
    mount,
  };
  return "mounted:" + lang;
})();
