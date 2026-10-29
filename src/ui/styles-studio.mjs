export function buildStudioStyles(appId) {
  return `
      /* --- wide studio layout: 760px centred shell ------------------------- */
      #${appId} .sk-shell {
        width: 100%;
        max-width: 760px;
        margin: 0 auto;
        max-height: calc(100vh - 36px);
        display: flex;
        flex-direction: column;
        background: #1b1b1b;
        border: 1px solid #3a3a3a;
        border-radius: 12px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
        overflow: hidden;
      }
      #${appId} .sk-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        margin: 0;
        border-bottom: 1px solid #333;
        background: linear-gradient(180deg, #262600, #1e1e1e 70%);
      }
      #${appId} .sk-brand { display: flex; align-items: center; gap: 10px; }
      #${appId} .sk-brand h2 { margin: 0; font-size: 17px; letter-spacing: 0.2px; }
      #${appId} .sk-build { font-size: 11px; color: #8a8a8a; }
      #${appId} .sk-head-right { display: flex; align-items: center; gap: 6px; }
      #${appId} .sk-lang {
        display: inline-flex;
        gap: 2px;
        padding: 2px;
        border: 1px solid #3d3d3d;
        border-radius: 8px;
        background: #141414;
      }
      #${appId} .sk-lang button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 7px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #b9b9b9;
        font-size: 11px;
        cursor: pointer;
      }
      #${appId} .sk-lang button.sk-active { background: #2f2f2f; color: #ffd400; }
      #${appId} .sk-lang svg { display: block; border-radius: 2px; }
      #${appId} .sk-icon {
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid #3d3d3d;
        border-radius: 8px;
        background: #232323;
        color: #cfcfcf;
        font-size: 14px;
        cursor: pointer;
      }
      #${appId} .sk-icon:hover { background: #2f2f2f; color: #ffd400; }
      /* Stage: the panel and the optional log dock are centred together, so
         opening the dock pushes the panel's left edge further left. */
      #${appId} .sk-stage {
        display: flex;
        align-items: stretch;
        justify-content: center;
        gap: 14px;
      }
      #${appId} .sk-shell { flex: 0 1 760px; min-width: 0; margin: 0; }
      #${appId} .sk-dock {
        pointer-events: auto;
        align-self: stretch;
        flex: 0 0 560px;
        width: 560px;
        max-width: calc(100vw - 40px);
        max-height: calc(100vh - 36px);
        display: flex;
        flex-direction: column;
        background: #1b1b1b;
        border: 1px solid #3a3a3a;
        border-radius: 12px;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
        overflow: hidden;
      }
      #${appId} .sk-dock.sk-hidden { display: none !important; }
      #${appId} .sk-dock-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid #333;
        background: linear-gradient(180deg, #262600, #1e1e1e 70%);
      }
      #${appId} .sk-dock-head span {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #ffd400;
      }
      #${appId} .sk-dock button {
        width: auto;
        padding: 7px 12px;
        font-size: 12px;
      }
      #${appId} .sk-dock .sk-log-area {
        flex: 1 1 auto;
        min-height: 120px;
        height: 0;
        width: 100%;
        border: 0;
        border-radius: 0;
        background: #141414;
        resize: none;
        /* Long log lines wrap instead of forcing a sideways scroll. */
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        word-break: break-word;
        overflow-x: hidden;
      }
      #${appId} .sk-head { position: relative; }
      /* Service menu: a proper card hanging under the gear, never outside the panel. */
      #${appId} .sk-menu {
        position: absolute;
        top: calc(100% - 2px);
        right: 86px;
        z-index: 200;
        width: 320px;
        max-width: calc(100% - 32px);
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 10px;
        border: 1px solid #3d3d3d;
        border-radius: 10px;
        background: #232323;
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.55);
        pointer-events: auto;
      }
      #${appId} .sk-menu.sk-hidden { display: none !important; }
      #${appId} .sk-menu button {
        width: 100%;
        text-align: left;
        padding: 9px 12px;
        border: 1px solid #3a3a3a;
        border-radius: 8px;
        background: #2b2b2b;
        color: #eaeaea;
        font-size: 13px;
        font-weight: 600;
      }
      #${appId} .sk-menu button:hover:not(:disabled) {
        background: #343434;
        color: #ffd400;
      }
      #${appId} .sk-menu [role="status"] {
        padding: 0 4px;
        font-size: 11px;
        line-height: 1.45;
        color: #9a9a9a;
      }
      #${appId} .sk-tabs {
        display: flex;
        gap: 4px;
        padding: 0 16px;
        margin: 0;
        border-bottom: 1px solid #333;
        background: #1e1e1e;
      }
      #${appId} .sk-tab {
        padding: 11px 14px;
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
        background: transparent;
        color: #9a9a9a;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      #${appId} .sk-tab.sk-tab-active { color: #ffd400; border-bottom-color: #ffd400; }
      #${appId} .sk-body { padding: 14px 16px 18px; overflow: auto; flex: 1 1 auto; }
      #${appId} .sk-card {
        background: #212121;
        border: 1px solid #383838;
        border-radius: 10px;
        padding: 12px 14px 14px;
        margin: 0 0 12px;
      }
      #${appId} .sk-sec {
        display: flex;
        align-items: baseline;
        gap: 8px;
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: #ffd400;
      }
      #${appId} .sk-count { font-size: 11px; font-weight: 500; color: #8f8f8f; text-transform: none; letter-spacing: 0; }
      #${appId} .sk-stats {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 6px;
        margin: 10px 0 8px;
      }
      #${appId} .sk-stat-note {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 12px;
        border-style: dashed;
        background: #181818;
        color: #9a9a9a;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .sk-stat-note > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .sk-spin-dot {
        flex: 0 0 auto;
        width: 13px;
        height: 13px;
        border: 2px solid rgba(255, 212, 0, 0.22);
        border-top-color: #ffd400;
        border-radius: 50%;
        animation: sk-spin 0.8s linear infinite;
      }
      #${appId} .sk-stat {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 7px 8px;
      }
      #${appId} .sk-stat b { display: block; font-size: 14px; color: #f2f2f2; }
      #${appId} .sk-stat span { font-size: 10px; color: #8f8f8f; text-transform: uppercase; letter-spacing: 0.3px; }
      #${appId} .sk-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
      #${appId} .sk-tbl th {
        position: sticky;
        top: 0;
        z-index: 1;
        text-align: left;
        padding: 7px 8px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.4px;
        text-transform: uppercase;
        color: #8f8f8f;
        border-bottom: 1px solid #383838;
        background: #1c1c1c;
      }
      #${appId} .sk-tbl td { padding: 7px 8px; border-bottom: 1px solid #2e2e2e; vertical-align: middle; }
      #${appId} .sk-tbl tr:last-child td { border-bottom: 0; }
      #${appId} .sk-tbl tr.sk-sel td { background: #242113; }
      #${appId} .sk-chk { width: 38px; text-align: center; cursor: pointer; }
      /* One control height for the whole target table: page, pixel, catalog, rate. */
      #${appId} .sk-tbl .sk-pix,
      #${appId} .sk-tbl .sk-cat,
      #${appId} .sk-tbl .sk-fp-btn,
      #${appId} .sk-tbl .sk-rate {
        box-sizing: border-box;
        height: 40px;
        border-radius: 8px;
        font-size: 13px;
      }
      #${appId} .sk-tbl .sk-pix,
      #${appId} .sk-tbl .sk-cat {
        padding: 0 10px;
        background: #232323;
        color: #eee;
        border: 1px solid #4a4a4a;
      }
      #${appId} .sk-tbl .sk-fp-btn { padding: 0 10px; }
      /* Checkboxes must stay clickable at a glance. */
      #${appId} .sk-chk input[type="checkbox"] {
        width: 20px;
        height: 20px;
        margin: 0;
        accent-color: #ffd400;
        cursor: pointer;
        vertical-align: middle;
      }
      #${appId} .sk-who { display: flex; flex-direction: column; gap: 1px; }
      #${appId} .sk-id { font-size: 10px; color: #7d7d7d; font-family: "Consolas", monospace; }
      #${appId} .sk-chip {
        display: inline-block;
        padding: 2px 7px;
        border-radius: 999px;
        border: 1px solid #3d3d3d;
        background: #1a1a1a;
        color: #b9b9b9;
        font-size: 10px;
        white-space: nowrap;
      }
      #${appId} .sk-chip.sk-ok { border-color: #2f6b35; color: #7ee08c; background: #16251a; }
      #${appId} .sk-chip.sk-warn { border-color: #6b5a2f; color: #ffd66b; background: #262115; }
      #${appId} .sk-chip.sk-err { border-color: #6b2f2f; color: #ff8f8f; background: #251616; }
      #${appId} .sk-scroll { max-height: 260px; overflow: auto; border: 1px solid #333; border-radius: 8px; }
      #${appId} .sk-empty { padding: 14px; text-align: center; color: #8f8f8f; font-size: 12px; }
      #${appId} .sk-pix { min-width: 130px; font-size: 11px; padding: 4px 6px; }
      #${appId} .sk-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 10px;
        flex-wrap: wrap;
      }
      #${appId} .sk-bar-right { display: flex; gap: 6px; }
      #${appId} .sk-hint { font-size: 11px; color: #8f8f8f; }
      #${appId} button.sk-info {
        width: 16px;
        height: 16px;
        padding: 0;
        border: 1px solid #4a4a4a;
        border-radius: 50%;
        background: #262626;
        color: #ffd400;
        font-size: 10px;
        font-weight: 700;
        line-height: 1;
        cursor: pointer;
      }
      /* The global "button:hover turns yellow" rule made the glyph invisible:
         keep the idle look on hover and paint the highlight ourselves. */
      #${appId} button.sk-info:hover,
      #${appId} button.sk-info:focus {
        background: #262626;
        color: #ffd400;
        outline: none;
      }
      #${appId} button.sk-info.sk-info-on,
      #${appId} button.sk-info.sk-info-on:hover {
        background: #ffd400;
        border-color: #ffd400;
        color: #111;
      }
      #${appId} .sk-macros-pop {
        position: relative;
        margin-top: 6px;
        padding: 8px 10px;
        border: 1px solid #3d3d3d;
        border-radius: 8px;
        background: #171717;
        font-size: 11px;
        line-height: 1.6;
      }
      #${appId} .sk-macros-pop code {
        padding: 1px 5px;
        border-radius: 4px;
        background: #262626;
        color: #ffd400;
        font-family: "Consolas", monospace;
      }
      #${appId} .sk-progress {
        height: 6px;
        margin: 4px 0 10px;
        border-radius: 999px;
        background: #141414;
        overflow: hidden;
      }
      #${appId} .sk-progress i {
        display: block;
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #b89a00, #ffd400);
        transition: width 0.25s ease;
      }
      #${appId} .sk-run-stats {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-bottom: 8px;
        font-size: 11px;
        color: #9a9a9a;
      }
      #${appId} .sk-run-stats b { color: #f2f2f2; }
      #${appId} .sk-job {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        padding: 7px 10px;
        border-bottom: 1px solid #2e2e2e;
        font-size: 12px;
      }
      #${appId} .sk-job:last-child { border-bottom: 0; }
      #${appId} .sk-job-ph { font-size: 10px; color: #8f8f8f; }
      #${appId} .sk-job-msg { margin-top: 2px; font-size: 11px; color: #c9a3a3; }
      #${appId} .sk-job-id { font-size: 10px; color: #6f6f6f; font-family: "Consolas", monospace; }
      #${appId} .sk-job.sk-success b { color: #7ee08c; }
      #${appId} .sk-job.sk-failed b { color: #ff8f8f; }
      #${appId} .sk-job.sk-running b { color: #ffd400; }
      #${appId} .sk-console {
        margin-top: 8px;
        max-height: 90px;
        overflow: auto;
        padding: 8px 10px;
        border-radius: 8px;
        background: #101010;
        border: 1px solid #2e2e2e;
        color: #9a9a9a;
        font-family: "Consolas", monospace;
        font-size: 10px;
        white-space: pre-wrap;
      }
      #${appId} .sk-console:empty { display: none; }
      #${appId} .sk-media-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 11px; border-bottom: 1px solid #262626; }
      #${appId} .sk-logs { border-top: 1px solid #333; background: #1c1c1c; }
      #${appId} .sk-log-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; cursor: pointer; font-size: 11px; color: #9a9a9a; text-transform: uppercase; letter-spacing: 0.4px; }
      #${appId} .sk-log-area { border-radius: 0; border: 0; border-top: 1px solid #2e2e2e; margin: 0; height: 110px; }
      #${appId} .sk-ok { color: #7ee08c; }
      #${appId} .sk-warn { color: #ffd66b; }
      #${appId} .sk-err { color: #ff8f8f; }
      #${appId} .sk-tab.sk-tab-active,
      #${appId} .sk-tab.sk-active {
        color: #ffd400;
        border-bottom: 2px solid #ffd400;
      }
      #${appId} .sk-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 16px;
        border-top: 1px solid #333;
        background: #1e1e1e;
      }
      #${appId} button.sk-primary {
        background: #ffd400;
        border: 1px solid #ffd400;
        color: #141400;
        font-weight: 700;
      }
      #${appId} button.sk-primary:hover:not(:disabled) { background: #ffe14d; }
      #${appId} button.sk-danger {
        background: #2a1717;
        border: 1px solid #6b2f2f;
        color: #ff9a9a;
      }
      #${appId} button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #${appId} details.sk-logs:not([open]) .sk-log-area { display: none; }
      #${appId} details.sk-logs > summary { list-style: none; }
      #${appId} details.sk-logs > summary::-webkit-details-marker { display: none; }
      /* compact rhythm + readable secondary text */
      #${appId} .sk-card { padding: 10px 12px 12px; margin-bottom: 10px; }
      #${appId} .sk-stat-note {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 9px 12px;
        border-style: dashed;
        background: #181818;
        color: #9a9a9a;
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .sk-stat-note > span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${appId} .sk-spin-dot {
        flex: 0 0 auto;
        width: 13px;
        height: 13px;
        border: 2px solid rgba(255, 212, 0, 0.22);
        border-top-color: #ffd400;
        border-radius: 50%;
        animation: sk-spin 0.8s linear infinite;
      }
      #${appId} .sk-stat { padding: 6px 8px; }
      #${appId} .sk-stat b { font-size: 13px; }
      #${appId} .sk-stat span { font-size: 9.5px; color: #a0a0a0; }
      #${appId} .sk-hint,
      #${appId} .sk-build,
      #${appId} .sk-count,
      #${appId} .sk-tbl th,
      #${appId} .sk-job-ph,
      #${appId} .sk-id { color: #a0a0a0; }
      #${appId} .sk-body::-webkit-scrollbar,
      #${appId} .sk-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
      #${appId} .sk-body::-webkit-scrollbar-thumb,
      #${appId} .sk-scroll::-webkit-scrollbar-thumb {
        background: #4a4a4a;
        border-radius: 6px;
      }
      #${appId} .sk-body::-webkit-scrollbar-track,
      #${appId} .sk-scroll::-webkit-scrollbar-track { background: #171717; }
      #${appId} .sk-sec { margin-bottom: 8px; }
      #${appId} .sk-summary {
        font-size: 12px;
        color: #cfcfcf;
        padding: 6px 8px;
        border: 1px dashed #3d3d3d;
        border-radius: 8px;
        background: #1b1b1b;
      }
      #${appId} .sk-tbl tr.sk-sel td { background: #2f2c14; }
      #${appId} .sk-tbl tr.sk-sel td:first-child {
        box-shadow: inset 3px 0 0 #ffd400;
      }
      #${appId} .sk-scroll {
        box-shadow: inset 0 -14px 14px -14px rgba(0, 0, 0, 0.8);
      }
      #${appId} details.sk-logs { background: #191919; }
      #${appId} details.sk-logs > summary { padding: 7px 16px; }
      /* row fields share the width evenly; only explicit .sk-narrow stays fixed */
      #${appId} .sk-row { align-items: flex-end; gap: 12px; }
      #${appId} .sk-row > .sk-field { flex: 1 1 0; min-width: 0; margin-bottom: 0; }
      #${appId} .sk-row > .sk-field.sk-narrow { flex: 0 0 200px; }
      #${appId} .sk-row > .sk-field.sk-source-account { flex: 0 0 260px; }
      #${appId} .sk-field > select,
      #${appId} .sk-field > input[type="text"],
      #${appId} .sk-field > input[type="file"] {
        width: 100%;
        height: 40px;
        box-sizing: border-box;
        padding: 0 10px;
        font-size: 13px;
      }
      #${appId} .sk-field > input[type="file"] {
        padding: 5px 10px;
        color: #c8c8c8;
      }
      #${appId} .sk-field > input[type="file"]::file-selector-button {
        height: 28px;
        margin-right: 10px;
        padding: 0 12px;
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        background: #2a2a2a;
        color: #e8e8e8;
        font: inherit;
        cursor: pointer;
      }
      #${appId} .sk-field > input[type="file"]::file-selector-button:hover {
        background: #343434;
      }
      #${appId} .sk-bar .sk-primary,
      #${appId} .sk-bar .sk-secondary {
        min-width: 220px;
        padding-left: 20px;
        padding-right: 20px;
      }
      #${appId} .sk-log-head { cursor: pointer; }
      #${appId} .sk-log-t {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      #${appId} .sk-chev {
        display: block;
        color: #cfcfcf;
        transition: transform 0.15s ease;
      }
      #${appId} details.sk-logs[open] .sk-chev { transform: rotate(90deg); }
      #${appId} .sk-report-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
      }
      #${appId} .sk-report-head h3 { margin: 0; font-size: 13px; color: #ffd400; }
      #${appId} button.sk-done {
        border-color: #2f6b35;
        color: #7ee08c;
        background: #16251a;
      }
      /* the finished-operation verdict takes over the panel until it is closed */
      #${appId} .sk-overlay {
        position: absolute;
        inset: 0;
        z-index: 70;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(0, 0, 0, 0.68);
        backdrop-filter: blur(1.5px);
      }
      #${appId} .sk-overlay button {
        min-width: 0;
      }
      #${appId} .sk-report-card {
        width: min(440px, 100%);
        max-height: calc(100% - 16px);
        overflow: auto;
        margin: 0;
        border: 1px solid #5a5a5a;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.65);
      }
      #${appId} .sk-report-card .sk-report-meta {
        color: #cfcfcf;
        line-height: 1.45;
        margin-bottom: 6px;
      }
      #${appId} .sk-report-card .sk-actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        margin-top: 10px;
      }
      #${appId} .sk-report-card .sk-actions button {
        background: #2a2a2a;
        color: #e8e8e8;
        border: 1px solid #4a4a4a;
        font-weight: 600;
      }
      #${appId} .sk-report-card .sk-actions button:hover { background: #343434; }
      #${appId} .sk-report-card .sk-actions button.sk-primary {
        margin-left: auto;
        background: #ffd400;
        color: #141400;
        border-color: #ffd400;
      }
      #${appId} .sk-report-card .sk-actions button.sk-primary:hover { background: #ffe033; }
      /* fan page cell: avatar + listbox, because a native select cannot show a logo */
      #${appId} .sk-fp-cell { position: relative; min-width: 130px; }
      #${appId} .sk-fp-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        max-width: 168px;
        height: 40px;
        padding: 0 10px;
        border: 1px solid #4a4a4a;
        border-radius: 6px;
        background: #232323;
        color: #eee;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      #${appId} .sk-fp-btn:hover { background: #2c2c2c; }
      #${appId} .sk-fp-btn .sk-fp-name {
        flex: 1 1 auto;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${appId} .sk-caret { color: #9a9a9a; font-size: 10px; }
      #${appId} .sk-fp-ico {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 5px;
        overflow: hidden;
        background: #3a3a3a;
        color: #ffd400;
        font-size: 11px;
        font-weight: 700;
      }
      #${appId} .sk-fp-ico img { width: 100%; height: 100%; object-fit: cover; display: block; }
      #${appId} .sk-fp-ico.sk-fp-auto { color: #bdbdbd; font-size: 9px; }
      #${appId} .sk-fp-pop {
        /* fixed, not absolute: the kabinet table scrolls and would clip it */
        position: fixed;
        z-index: 2147483000;
        top: 0;
        left: 0;
        margin-top: 4px;
        width: 260px;
        max-height: 240px;
        overflow: auto;
        padding: 4px;
        border: 1px solid #4a4a4a;
        border-radius: 8px;
        background: #1e1e1e;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
      }
      #${appId} .sk-fp-item {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        padding: 5px 6px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #eee;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      #${appId} .sk-fp-item:hover { background: #2d2d2d; }
      #${appId} .sk-fp-item.sk-on { background: #332b00; }
      #${appId} .sk-fp-item .sk-fp-name {
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      #${appId} .sk-pix { width: 112px; }
      #${appId} .sk-cat { width: 142px; }
      #${appId} .sk-tbl td select { max-width: 100%; }
      #${appId} .sk-cur { white-space: nowrap; }
      #${appId} .sk-cur .sk-chip { padding: 2px 6px; font-size: 11px; }
      #${appId} .sk-tbl th, #${appId} .sk-tbl td { padding: 6px 6px; }
      #${appId} .sk-cur .sk-chip { cursor: help; }
      #${appId} .sk-rate {
        width: 66px;
        margin-left: 4px;
        height: 24px;
        padding: 0 4px;
        border: 1px solid #4a4a4a;
        border-radius: 5px;
        background: #232323;
        color: #eee;
        font-size: 11px;
      }
      #${appId} .sk-mass-list {
        max-height: 240px;
        overflow: auto;
        margin: 8px 0;
        font-size: 12px;
      }
      #${appId} .sk-mass-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        padding: 4px 2px;
        border-bottom: 1px solid #2a2a2a;
      }
      #${appId} .sk-mass-row span { color: #bdbdbd; }
      #${appId} .sk-mass-row.sk-success span { color: #7ee08c; }
      #${appId} .sk-mass-row.sk-failed span { color: #ff9a9a; }
      /* ---- collapsed: the window morphs into the mark pinned to the corner ---- */
      #${appId} .sk-shell { transition: opacity .16s ease, transform .16s ease; }
      #${appId} .sk-mini {
        display: none;
        position: fixed;
        top: 0;
        right: 0;
        width: 54px;
        height: 54px;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: 1px solid #4a4a4a;
        border-radius: 14px;
        background: #1b1b1b;
        box-shadow: 0 10px 26px rgba(0, 0, 0, 0.55);
        cursor: grab;
        touch-action: none;
        pointer-events: auto;
      }
      #${appId} .sk-mini:active { cursor: grabbing; }
      #${appId} .sk-mini:hover { border-color: #ffd400; }
      #${appId} .sk-mini .sk-mark { width: 32px; height: 32px; }
      #${appId}.sk-min .sk-mini { display: inline-flex; }
      #${appId}.sk-min .sk-dock { display: none !important; }
      #${appId}.sk-min .sk-shell {
        opacity: 0;
        visibility: hidden;
        transform: scale(0.86);
        pointer-events: none;
      }
      #${appId} .sk-minimize { font-weight: 700; line-height: 1; padding-bottom: 3px; }
      /* ---- account search in the target section header ---- */
      #${appId} .sk-search {
        width: 190px;
        height: 28px;
        margin-left: 10px;
        padding: 0 9px;
        border: 1px solid #3c3c3c;
        border-radius: 7px;
        background: #202020;
        color: #eee;
        font-size: 12px;
        font-family: inherit;
      }
      #${appId} .sk-search::placeholder { color: #7d7d7d; }
      #${appId} .sk-search:focus { outline: none; border-color: #ffd400; }
      #${appId} .sk-note {
        margin-top: 8px;
        color: #9d8a4a;
        font-size: 11px;
        line-height: 1.35;
      }
      /* ---- account type as an icon with a tooltip ---- */
      #${appId} .sk-acc { display: inline-flex; align-items: center; gap: 8px; }
      #${appId} .sk-acc-ico {
        flex: 0 0 auto;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 5px;
        font-size: 10px;
        font-weight: 700;
        cursor: help;
      }
      #${appId} .sk-acc-ico.sk-bm { background: #2b3a2b; color: #8fe08f; border: 1px solid #3f5a3f; }
      #${appId} .sk-acc-ico.sk-personal { background: #2a2a2a; color: #9a9a9a; border: 1px solid #3c3c3c; }
      /* loading: the whole window dims, only the wheel stays lit and centered */
      #${appId} .sk-loading {
        position: absolute;
        inset: 0;
        z-index: 60;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10, 10, 10, 0.72);
        pointer-events: auto;
      }
      #${appId} .sk-loading.sk-hidden { display: none !important; }
      #${appId} .sk-loading .sk-spinner {
        width: 52px;
        height: 52px;
        border-width: 5px;
      }
      @media (max-width: 800px) {
        #${appId} { inset: 10px; }
        #${appId} .sk-shell { max-height: calc(100vh - 20px); }
        #${appId} .sk-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        #${appId} .sk-summary-grid { grid-template-columns: 1fr; }
        #${appId} .sk-row { flex-direction: column; align-items: stretch; }
      }
    `;
}

/** Source switch: one labelled toggle, campaign on the left, JSON on the right. */
export const SOURCE_SWITCH_STYLES = `
#fb-sk-ad-replica .sk-source-row { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; }
#fb-sk-ad-replica .sk-source-label { height: 40px; padding: 0; border: 0; background: transparent; color: #8f8f8f; font: inherit; font-weight: 600; cursor: pointer; }
#fb-sk-ad-replica .sk-source-label.is-on { color: #ffd400; }
#fb-sk-ad-replica .sk-source-label { font-size: 13px; letter-spacing: .01em; }
#fb-sk-ad-replica .sk-source-label:not(.is-on):hover { background: transparent; color: #d0d0d0; }
#fb-sk-ad-replica .sk-switch { position: relative; flex: 0 0 auto; width: 52px; height: 28px; padding: 0; border: 1px solid #3a3a3a; border-radius: 999px; background: #1b1b1b; cursor: pointer; transition: background .18s ease, border-color .18s ease; }
#fb-sk-ad-replica .sk-switch-knob { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #ffd400; transition: left .18s ease, background .18s ease; }
#fb-sk-ad-replica .sk-source-row[data-kind="json"] .sk-switch { background: #1b1b1b; border-color: #ffd400; }
#fb-sk-ad-replica .sk-source-row[data-kind="json"] .sk-switch-knob { left: 29px; }
.sk-drop { display: flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center; padding: 14px; margin-bottom: 8px; border: 1.5px dashed #3a3a3a; border-radius: 11px; background: #1a1a1a; color: #8f8f8f; text-align: center; cursor: pointer; }
.sk-drop:hover { border-color: #ffd400; }
.sk-drop b { color: #ececec; font-weight: 600; }
.sk-drop input[type="file"] { display: none; }
`;

/** Media slot table for a JSON package: chips, expected names, per-slot pick. */
export const MEDIA_SLOT_STYLES = `
.sk-chip { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 6px; background: #2a2a2a; color: #bdbdbd; font-size: 11px; }
.sk-chip-ok { background: #16351f; color: #6ee7a8; }
.sk-chip-warn { background: #3a2323; color: #ff9a9a; }
.sk-file { font-family: ui-monospace, monospace; font-size: 11px; color: #bdbdbd; }
#app .sk-tbl .sk-select { height: 30px; width: 100%; }
`;
