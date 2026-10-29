/** Panel translations. English is the default; the choice is persisted. */

const LANG_KEY = "adreplica.panel.lang";

const DICT = {
  en: {
    "lang.ru": "Русский",
    "lang.en": "English",
    ver: "build {version}",
    "btn.service": "Service",
    "btn.log": "Log panel",
    "btn.close": "Close",
    "btn.minimize": "Collapse",
    "btn.restore": "Open AdReplica",
    "clone.search": "Search by name or ID",
    "menu.clearDrafts": "Clear Drafts",
    "menu.prevVersion": "Load previous version",
    "tab.export": "Export",
    "tab.import": "Import",
    "tab.clone": "Clone",

    "field.account": "Ad account",
    "field.sourceAccount": "Source ad account",
    "field.campaign": "Campaign",
    "field.sourceCampaign": "Source campaign",
    "field.campaignName": "Campaign name",
    "field.template": "Campaign name template",
    "field.importMode": "Import mode",
    "field.mode": "Clone mode",
    "field.fanPage": "Facebook page",
    "field.pixel": "Pixel",
    "field.catalog": "Catalog",
    "field.currency": "Currency",
    "field.type": "Type",
    "field.file": "File",
    "field.kind": "Type",
    "field.size": "Size",
    "field.budget": "Budget",
    "field.risk": "Risk",

    "clone.s1": "1 · What to clone",
    "clone.s2": "2 · Where to clone",
    "clone.s2note": "active accounts only",
    "clone.s3": "3 · Mapping preview",
    "clone.s3note": "nothing is created",
    "clone.s4": "4 · Run",
    "clone.s4note": "sequential, one account at a time",
    "clone.hint":
      "Select the target accounts in the table, then clone. A failed account is rolled back and the batch continues.",
    "log.empty": "The operation log will appear here after the first run.",
    "clone.collapse": "Collapse or expand the source block",
    "clone.loading": "Loading the source campaign package...",
    "clone.mediaSummary": "Source media ({count})",
    "clone.mappings": "Page, pixel and catalog mapping",
    "clone.targetsHint": "{n} of {total} accounts selected",
    "clone.targetsNone": "No active ad accounts found.",

    "stat.adsets": "ad sets",
    "stat.ads": "ads",
    "stat.creatives": "creatives",
    "stat.media": "media",
    "stat.budget": "daily budget",
    "stat.catalogs": "catalogs",

    "btn.export": "Export",
    "btn.import": "Import",
    "btn.clone": "Clone",
    "btn.preview": "Preview mappings",
    "btn.stop": "Stop",
    "btn.retry": "Retry failed",
    "btn.retryN": "Retry {n} failed",
    "btn.reset": "Reset",

    "opt.reuseExisting": "Reuse existing pixel",
    "opt.noPixel": "Auto",
    "opt.noPixelHint": "Reuse the existing pixel or create a new one",
    "opt.noCatalog": "Auto",
    "opt.noCatalogHint":
      "Auto — the catalog from the source package, only if this cabinet can see it",
    "opt.noCatalogs": "No catalogs",
    "opt.noCatalogsHint":
      "This cabinet has no catalogs, so a catalog campaign cannot be cloned here: open a cabinet that can see the source catalog, or copy the catalog into its Business Manager first.",
    "opt.copyCatalog": "Copy to BM {bm}",
    "opt.autoPage": "Auto (page from source)",
    "opt.autoPageShort": "Auto",
    "currency.tooltip":
      "Currency differs from the source ({from} → {to}). The budget is converted at {rate}.",
    "currency.same": "Same currency as the source ({cur}): no conversion.",
    "opt.notSelected": "Not selected",
    "opt.createPixel": "Create a new pixel",

    "chip.bm": "BM · {biz}",
    "chip.source": "source",
    "chip.personal": "personal",
    "currency.auto": "auto rate",
    "currency.convert": "{cur} · rate {rate}",

    "run.progress": "progress",
    "run.done": "done",
    "run.rolled": "rolled back",
    "run.queued": "queued",
    "run.current": "current",
    "run.running": "running…",
    "run.hint": "Stop finishes the current account; nothing else is touched.",

    "job.queued": "queued",
    "job.running": "cloning…",
    "job.success": "cloned",
    "job.failed": "failed · rolled back",
    "job.skipped": "skipped",
    "job.cancelled": "cancelled",

    "export.hint": "Export saves the campaign JSON and its media files.",
    "import.hint": "Import recreates the campaign in the selected account.",
    "import.json": "Export JSON file",

    "macros.title": "Name macros",
    "macros.hint": "Use them in the campaign name template:",
    "macros.source": "source campaign name",
    "macros.account": "target account name",
    "macros.accountId": "target account id",
    "macros.currency": "target account currency",
    "macros.mode": "clone mode (DRAFT / PAUSED / ACTIVE)",
    "macros.index": "sequence number of the target (1, 2, 3 …)",
    "macros.date": "today, YYYY-MM-DD",

    "risk.noBm": "no BM",
    "risk.noPage": "page missing",
    "risk.ok": "ready",

    "logs.title": "Log",
    "logs.download": "Download log",
    "logs.dockEmpty": "Nothing logged yet.",
    "report.kind.export": "Export",
    "report.kind.import": "Import",
    "report.kind.clone": "Clone",
    "report.status.success": "completed",
    "report.status.partial": "partially completed",
    "report.status.failed": "failed",
    "report.status.cancelled": "cancelled",
    "report.status.needs_review": "needs verification",
    "report.account": "account {id}",
    "report.details": "Details and remaining objects",
    "report.download": "Download report",
    "report.reload": "Open in Ads Manager",
    "report.ok": "OK",
    "report.close": "Close",
    "report.mass.title": "Mass clone",
    "report.mass.counters":
      "cloned {cloned} · failed {failed} · skipped {skipped}",
    "targets.noPayment":
      "{n} cabinet(s) hidden: no payment method, Meta refuses ads there",
    "rate.manual": "rate",
    "rate.autoHint": "Meta rate: {rate}",
    "currency.none": "нет курса",
    "status.loading": "Looking for access_token…",
    "status.ready": "Session ready",
    "status.missing": "Session not loaded",
    "status.busy": "operation in progress",
  },

  ru: {
    "lang.ru": "Русский",
    "lang.en": "English",
    ver: "сборка {version}",
    "btn.service": "Сервис",
    "btn.log": "Панель лога",
    "btn.close": "Закрыть",
    "btn.minimize": "Свернуть",
    "btn.restore": "Открыть AdReplica",
    "clone.search": "Поиск по имени или ID",
    "menu.clearDrafts": "Очистить драфты",
    "menu.prevVersion": "Загрузить предыдущую версию",
    "tab.export": "Экспорт",
    "tab.import": "Импорт",
    "tab.clone": "Клон",

    "field.account": "Рекламный кабинет",
    "field.sourceAccount": "Кабинет-источник",
    "field.campaign": "Кампания",
    "field.sourceCampaign": "Кампания-источник",
    "field.campaignName": "Название кампании",
    "field.template": "Шаблон названия кампании",
    "field.importMode": "Режим импорта",
    "field.mode": "Режим клона",
    "field.fanPage": "Страница Facebook",
    "field.pixel": "Пиксель",
    "field.catalog": "Каталог",
    "field.currency": "Валюта",
    "field.type": "Тип",
    "field.file": "Файл",
    "field.kind": "Тип",
    "field.size": "Размер",
    "field.budget": "Бюджет",
    "field.risk": "Риск",

    "clone.s1": "1 · Что клонируем",
    "clone.s2": "2 · Куда клонируем",
    "clone.s2note": "только активные кабинеты",
    "clone.s3": "3 · Предпросмотр маппингов",
    "clone.s3note": "ничего не создаётся",
    "clone.s4": "4 · Выполнение",
    "clone.s4note": "последовательно, по одному кабинету",
    "clone.hint":
      "Отметьте кабинеты в таблице и запустите клонирование. Упавший кабинет откатывается, очередь продолжается.",
    "clone.mediaSummary": "Медиа источника ({count})",
    "clone.mappings": "Маппинг страниц, пикселей и каталогов",
    "clone.targetsHint": "выбрано {n} из {total} кабинетов",
    "clone.targetsNone": "Активных рекламных кабинетов не найдено.",

    "stat.adsets": "адсетов",
    "stat.ads": "объявлений",
    "stat.creatives": "креативов",
    "stat.media": "медиа",
    "stat.budget": "дневной бюджет",
    "stat.catalogs": "каталогов",

    "btn.export": "Экспорт",
    "btn.import": "Импорт",
    "btn.clone": "Клонировать",
    "btn.preview": "Сопоставления",
    "btn.stop": "Стоп",
    "btn.retry": "Повторить упавшие",
    "btn.retryN": "Повторить упавшие ({n})",
    "btn.reset": "Сбросить",

    "opt.reuseExisting": "Переиспользовать пиксель",
    "opt.noPixel": "Авто",
    "opt.noPixelHint":
      "Переиспользовать существующий пиксель или создать новый",
    "opt.noCatalog": "Авто",
    "opt.noCatalogHint":
      "Авто — каталог из пакета-источника, но только если этот кабинет его видит",
    "opt.noCatalogs": "Нет каталогов",
    "opt.noCatalogsHint":
      "В кабинете нет ни одного каталога, поэтому кампанию с каталогом сюда склонировать нельзя: нужен кабинет, который видит исходный каталог, либо сначала скопировать каталог в его Business Manager.",
    "opt.copyCatalog": "Копировать в BM {bm}",
    "opt.autoPage": "Авто (страница из источника)",
    "opt.autoPageShort": "Авто",
    "currency.tooltip":
      "Валюта отличается от источника ({from} → {to}). Бюджет будет пересчитан по курсу {rate}.",
    "currency.same":
      "Валюта совпадает с источником ({cur}): пересчёта не будет.",
    "log.empty": "Журнал операций появится здесь после первого запуска.",
    "clone.collapse": "Свернуть или развернуть блок источника",
    "clone.loading": "Загружаем пакет кампании-источника...",
    "opt.notSelected": "Не выбрано",
    "opt.createPixel": "Создать новый пиксель",

    "chip.bm": "БМ · {biz}",
    "chip.source": "источник",
    "chip.personal": "личный",
    "currency.auto": "курс автоматически",
    "currency.convert": "{cur} · курс {rate}",

    "run.progress": "прогресс",
    "run.done": "готово",
    "run.rolled": "откатано",
    "run.queued": "в очереди",
    "run.current": "текущий",
    "run.running": "выполняется…",
    "run.hint": "Стоп завершит текущий кабинет, остальные не тронет.",

    "job.queued": "в очереди",
    "job.running": "клонируется…",
    "job.success": "готово",
    "job.failed": "ошибка · откатано",
    "job.skipped": "пропущен",
    "job.cancelled": "отменён",

    "export.hint": "Экспорт сохраняет JSON кампании и её медиафайлы.",
    "import.hint": "Импорт воссоздаёт кампанию в выбранном кабинете.",
    "import.json": "JSON-файл экспорта",

    "macros.title": "Макросы названия",
    "macros.hint": "Используйте их в шаблоне названия кампании:",
    "macros.source": "название кампании-источника",
    "macros.account": "название целевого кабинета",
    "macros.accountId": "id целевого кабинета",
    "macros.currency": "валюта целевого кабинета",
    "macros.mode": "режим клона (DRAFT / PAUSED / ACTIVE)",
    "macros.index": "порядковый номер кабинета (1, 2, 3 …)",
    "macros.date": "сегодняшняя дата, ГГГГ-ММ-ДД",

    "risk.noBm": "нет БМ",
    "risk.noPage": "нет страницы",
    "risk.ok": "готов",

    "logs.title": "Лог",
    "logs.download": "Скачать лог",
    "logs.dockEmpty": "Пока пусто.",
    "report.kind.export": "Экспорт",
    "report.kind.import": "Импорт",
    "report.kind.clone": "Клонирование",
    "report.status.success": "выполнено",
    "report.status.partial": "выполнено частично",
    "report.status.failed": "ошибка",
    "report.status.cancelled": "отменено",
    "report.status.needs_review": "требует проверки",
    "report.account": "кабинет {id}",
    "report.details": "Детали и оставшиеся объекты",
    "report.download": "Скачать отчёт",
    "report.reload": "Открыть в Ads Manager",
    "report.ok": "Ок",
    "report.close": "Закрыть",
    "report.mass.title": "Массовое клонирование",
    "report.mass.counters":
      "склонировано {cloned} · с ошибкой {failed} · пропущено {skipped}",
    "targets.noPayment": "скрыто кабинетов без платёжного метода: {n}",
    "rate.manual": "курс",
    "rate.autoHint": "Курс из Meta: {rate}",
    "currency.none": "нет курса",
    "status.loading": "Ищем access_token…",
    "status.ready": "Сессия готова",
    "status.missing": "Сессия не загружена",
    "status.busy": "выполняется операция",
  },
};

export const FLAGS = {
  ru: `<svg viewBox="0 0 60 36" width="18" height="11" aria-hidden="true"><rect width="60" height="12" fill="#fff"/><rect y="12" width="60" height="12" fill="#0039A6"/><rect y="24" width="60" height="12" fill="#D52B1E"/></svg>`,
  en: `<svg viewBox="0 0 60 36" width="18" height="11" aria-hidden="true"><rect width="60" height="36" fill="#012169"/><path d="M0,0 60,36 M60,0 0,36" stroke="#fff" stroke-width="7"/><path d="M0,0 60,36 M60,0 0,36" stroke="#C8102E" stroke-width="3"/><path d="M30,0 V36 M0,18 H60" stroke="#fff" stroke-width="11"/><path d="M30,0 V36 M0,18 H60" stroke="#C8102E" stroke-width="6"/></svg>`,
};

let lang = "en";
try {
  const stored = localStorage.getItem(LANG_KEY);
  if (stored === "ru" || stored === "en") lang = stored;
} catch {
  /* storage can be unavailable in a sandboxed frame */
}

export function getLang() {
  return lang;
}

export function setLang(next) {
  lang = next === "ru" ? "ru" : "en";
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* ignore */
  }
  return lang;
}

export function t(key, vars) {
  const value = DICT[lang]?.[key] ?? DICT.en[key] ?? key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : match,
  );
}

const RU_STAT_FORMS = {
  "stat.adsets": ["группа объявлений", "группы объявлений", "групп объявлений"],
  "stat.ads": ["объявление", "объявления", "объявлений"],
  "stat.creatives": ["креатив", "креатива", "креативов"],
  "stat.media": ["медиафайл", "медиафайла", "медиафайлов"],
  "stat.catalogs": ["каталог", "каталога", "каталогов"],
};

/** Plural-aware label for the source summary tiles. */
export function statLabel(key, count) {
  if (lang !== "ru" || !RU_STAT_FORMS[key]) return t(key);
  const n = Math.abs(Number(count) || 0) % 100;
  const n1 = n % 10;
  const forms = RU_STAT_FORMS[key];
  if (n > 10 && n < 20) return forms[2];
  if (n1 === 1) return forms[0];
  if (n1 >= 2 && n1 <= 4) return forms[1];
  return forms[2];
}

function ruForm(n, forms) {
  const value = Math.abs(Number(n) || 0) % 100;
  const last = value % 10;
  if (value > 10 && value < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** "Clone to 3 accounts" with correct Russian plural. */
export function cloneToLabel(count) {
  if (lang === "ru") {
    return `Клонировать в ${count} ${ruForm(count, [
      "кабинет",
      "кабинета",
      "кабинетов",
    ])}`;
  }
  return `Clone to ${count} account${Number(count) === 1 ? "" : "s"}`;
}

/** Compact plural form for the collapsed summary line. */
export function smallLabel(key, count) {
  const n = Number(count) || 0;
  if (lang === "ru") return statLabel(key, n);
  const english = {
    "stat.adsets": ["ad set", "ad sets"],
    "stat.ads": ["ad", "ads"],
    "stat.creatives": ["creative", "creatives"],
    "stat.media": ["media file", "media files"],
    "stat.catalogs": ["catalog", "catalogs"],
  }[key];
  if (!english) return t(key);
  return n === 1 ? english[0] : english[1];
}
