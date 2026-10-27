export function buildAdReplicaStyles(appId) {
  return `
      #${appId} {
        position: fixed;
        inset: 18px;
        z-index: 2147483647;
        pointer-events: none;
        font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      }
      #${appId} * { box-sizing: border-box; }
      #${appId} .sk-shell {
        position: relative;
        max-width: 580px;
        margin: 0 auto;
        background: #1a1a1a;
        color: #f5f5f5;
        border: 2px solid #ffc107;
        border-radius: 10px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
        padding: 18px;
        pointer-events: auto;
        overflow: auto;
        max-height: calc(100vh - 36px);
      }
      #${appId} .sk-head {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      #${appId} .sk-title-row {
        display: inline-flex;
        align-items: center;
        gap: 10px;
      }
      #${appId} .sk-mark {
        width: 34px;
        height: 34px;
        display: block;
        flex: 0 0 auto;
        filter: drop-shadow(0 6px 14px rgba(255, 193, 7, 0.18));
      }
      #${appId} .sk-head h2 {
        margin: 0;
        color: #ffc107;
        font-size: 22px;
        letter-spacing: 0.02em;
      }
      #${appId} .sk-build {
        font-size: 11px;
        font-weight: 400;
        color: #888;
        letter-spacing: 0.04em;
      }
      #${appId} .sk-byline {
        display: block;
        font-size: 12px;
        color: #ffc107;
        text-decoration: none;
        opacity: 0.7;
        margin-top: 2px;
      }
      #${appId} .sk-byline:hover { opacity: 1; text-decoration: underline; }
      #${appId} .sk-head-actions {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        position: relative;
        flex-shrink: 0;
      }
      #${appId} .sk-actions,
      #${appId} .sk-row,
      #${appId} .sk-log-head {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
      }
      #${appId} .sk-loading-overlay {
        position: absolute;
        inset: 0;
        border-radius: 10px;
        background: rgba(20, 20, 20, 0.92);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
      }
      #${appId} .sk-spinner {
        width: 48px;
        height: 48px;
        border: 4px solid rgba(255, 193, 7, 0.2);
        border-top-color: #ffc107;
        border-radius: 50%;
        animation: sk-spin 0.8s linear infinite;
      }
      @keyframes sk-spin { to { transform: rotate(360deg); } }
      #${appId} .sk-close {
        width: 30px !important;
        height: 30px;
        padding: 0 !important;
        border-radius: 50% !important;
        background: #333 !important;
        border: 1px solid #555 !important;
        color: #ccc !important;
        font-size: 16px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-weight: 400 !important;
      }
      #${appId} .sk-close:hover {
        background: #555 !important;
        color: #fff !important;
      }
      #${appId} .sk-service-button {
        width: 30px !important;
        height: 30px;
        padding: 0 !important;
        border-radius: 50% !important;
        background: #333 !important;
        border: 1px solid #555 !important;
        color: #ccc !important;
        font-size: 17px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-weight: 400 !important;
      }
      #${appId} .sk-service-button:hover,
      #${appId} .sk-service-button.sk-active {
        background: #555 !important;
        color: #fff !important;
      }
      #${appId} .sk-service-menu {
        position: absolute;
        top: 36px;
        right: 38px;
        min-width: 176px;
        padding: 6px;
        border-radius: 8px;
        border: 1px solid #555;
        background: #222;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
        z-index: 20;
      }
      #${appId} .sk-service-menu button {
        width: 100% !important;
        justify-content: flex-start;
        background: transparent !important;
        color: #f5f5f5 !important;
        border: 0 !important;
        padding: 9px 10px !important;
        text-align: left;
        font-weight: 600 !important;
      }
      #${appId} .sk-service-menu button:hover:not(:disabled) {
        background: rgba(255, 193, 7, 0.12) !important;
        color: #ffc107 !important;
      }
      #${appId} .sk-version-note {
        max-width: 280px;
        padding: 6px 10px 9px;
        color: #bbb;
        font-size: 12px;
        line-height: 1.4;
      }
      #${appId} .sk-tabs {
        display: flex;
        margin-bottom: 0;
        border-bottom: 2px solid #ffc107;
      }
      #${appId} .sk-tab {
        width: auto !important;
        padding: 8px 24px !important;
        background: #2a2a2a !important;
        border: 2px solid #ffc107 !important;
        border-bottom: none !important;
        border-radius: 8px 8px 0 0 !important;
        font-weight: 600 !important;
        font-size: 14px !important;
        color: #999 !important;
        cursor: pointer;
        margin-right: 2px;
        position: relative;
        top: 2px;
      }
      #${appId} .sk-tab.sk-tab-active {
        background: #1a1a1a !important;
        color: #ffc107 !important;
        border-bottom: 2px solid #1a1a1a !important;
      }
      #${appId} .sk-tab-panel { margin-top: 14px; }
      #${appId} .sk-hidden { display: none !important; }
      #${appId} .sk-mass-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 320px;
        overflow: auto;
        margin-top: 12px;
        padding-right: 4px;
      }
      #${appId} .sk-mass-row {
        display: grid;
        grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) auto;
        align-items: center;
        gap: 8px;
        background: #1d1d1d;
        border: 1px solid #3a3a3a;
        border-radius: 6px;
        padding: 6px 9px;
      }
      #${appId} .sk-mass-row.sk-mass-off { opacity: 0.55; }
      #${appId} .sk-mass-pick {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }
      #${appId} .sk-mass-pick input { width: auto; }
      #${appId} .sk-mass-id {
        display: block;
        color: #777;
        font-size: 11px;
      }
      #${appId} .sk-mass-row select { padding: 6px 8px; font-size: 12px; }
      #${appId} .sk-mass-progress {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-top: 12px;
      }
      #${appId} .sk-mass-result {
        display: grid;
        grid-template-columns: minmax(120px, 1fr) auto;
        gap: 4px 10px;
        border-left: 3px solid #555;
        background: #1d1d1d;
        border-radius: 4px;
        padding: 6px 9px;
        font-size: 12px;
      }
      #${appId} .sk-mass-result em {
        grid-column: 1 / -1;
        color: #d0a0a0;
        font-style: normal;
        font-size: 11px;
      }
      #${appId} .sk-mass-success { border-left-color: #4caf50; }
      #${appId} .sk-mass-failed { border-left-color: #e57373; }
      #${appId} .sk-mass-skipped { border-left-color: #ffb74d; }
      #${appId} .sk-mass-running { border-left-color: #64b5f6; }
      #${appId} .sk-badge-warn { color: #ffb74d; border-color: #ffb74d; }
      #${appId} .sk-card > .sk-actions {
        margin-top: 18px;
        justify-content: flex-start;
        flex-wrap: wrap;
      }
      #${appId} .sk-operation-report,
      #${appId} .sk-logs { margin-top: 14px; }
      #${appId} .sk-operation-report h3 {
        color: #ffc107;
        font-size: 16px;
        margin: 0 0 10px;
      }
      #${appId} .sk-operation-report p { margin: 12px 0; }
      #${appId} .sk-operation-report summary { cursor: pointer; }
      #${appId} .sk-card,
      #${appId} .sk-logs {
        background: #222;
        border: 1px solid #444;
        border-radius: 8px;
        padding: 14px;
      }
      #${appId} button,
      #${appId} select,
      #${appId} input {
        width: 100%;
        border-radius: 6px;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #f5f5f5;
        padding: 10px 12px;
        font-size: 14px;
      }
      #${appId} button {
        width: auto;
        cursor: pointer;
        background: #ffc107;
        color: #111;
        border: none;
        font-weight: 700;
      }
      #${appId} button:hover:not(:disabled) {
        background: #ffca28;
      }
      #${appId} button.sk-secondary {
        background: #2a2a2a;
        color: #e8e8e8;
        border: 1px solid #4a4a4a;
      }
      #${appId} button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #${appId} .sk-status,
      #${appId} .sk-note,
      #${appId} .sk-empty,
      #${appId} .sk-creative-file,
      #${appId} .sk-summary-grid span {
        color: #aaa;
        font-size: 13px;
      }
      #${appId} .sk-clone-summary {
        margin: 8px 0 14px;
      }
      #${appId} .sk-clone-summary strong {
        color: #f5f5f5;
      }
      #${appId} .sk-warning {
        color: #f4c36b;
        margin-bottom: 8px;
      }
      #${appId} .sk-inline-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 72px;
        padding: 14px 16px;
        margin: 8px 0 14px;
        border: 1px solid #3f3f3f;
        border-radius: 8px;
        background: #262626;
        color: #c8c8c8;
        font-size: 13px;
      }
      #${appId} .sk-inline-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 193, 7, 0.25);
        border-top-color: #ffc107;
        border-radius: 50%;
        animation: sk-spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      #${appId} .sk-field {
        display: grid;
        gap: 6px;
        margin-bottom: 10px;
      }
      #${appId} .sk-inline {
        flex: 1;
        margin-bottom: 0;
      }
      #${appId} .sk-check {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }
      #${appId} .sk-check input {
        width: auto;
      }
      #${appId} .sk-compact {
        align-items: end;
      }
      #${appId} .sk-summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      #${appId} .sk-summary-grid > div:first-child { grid-column: 1 / -1; }
      #${appId} .sk-summary-grid div {
        background: #2a2a2a;
        border-radius: 8px;
        padding: 10px;
        display: grid;
        gap: 6px;
      }
      #${appId} .sk-subtitle {
        font-size: 12px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: #ffc107;
        margin-bottom: 10px;
      }
      #${appId} .sk-mapping-block + .sk-mapping-block {
        margin-top: 14px;
      }
      #${appId} .sk-creative-row {
        display: grid;
        gap: 8px;
        padding: 10px;
        background: #2a2a2a;
        border-radius: 8px;
      }
      #${appId} .sk-creative-row + .sk-creative-row {
        margin-top: 8px;
      }
      #${appId} .sk-creative-info {
        display: grid;
        gap: 4px;
      }
      #${appId} .sk-creative-name {
        display: flex;
        gap: 8px;
        align-items: center;
        font-weight: 600;
      }
      #${appId} .sk-file-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: fit-content;
        min-width: 104px;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid #595959;
        background: #1e1e1e;
        color: #f5f5f5;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
      }
      #${appId} .sk-file-trigger:hover {
        border-color: #ffc107;
      }
      #${appId} .sk-file-input {
        display: none;
      }
      #${appId} .sk-badge {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        padding: 2px 7px;
        border-radius: 4px;
        flex-shrink: 0;
      }
      #${appId} .sk-badge-image {
        background: rgba(59, 130, 246, 0.25);
        color: #93c5fd;
      }
      #${appId} .sk-badge-video {
        background: rgba(168, 85, 247, 0.25);
        color: #d8b4fe;
      }
      #${appId} .sk-log-summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
      }
      #${appId} .sk-log-summary::-webkit-details-marker {
        display: none;
      }
      #${appId} .sk-log-summary::before {
        content: "▸";
        color: #ffc107;
        font-size: 13px;
        line-height: 1;
        transition: transform 0.16s ease;
      }
      #${appId} .sk-logs[open] .sk-log-summary::before {
        transform: rotate(90deg);
      }
      #${appId} .sk-log-summary span {
        margin-right: auto;
      }
      #${appId} .sk-log-download {
        flex-shrink: 0;
        padding: 6px 10px;
        font-size: 12px;
      }
      #${appId} .sk-log-area {
        width: 100%;
        height: 150px;
        margin-top: 10px;
        resize: vertical;
        background: #111;
        color: #ccc;
        border: 1px solid #444;
        border-radius: 6px;
        padding: 8px;
        font-family: "Consolas", "Courier New", monospace;
        font-size: 11px;
        line-height: 1.4;
        white-space: pre;
        overflow: auto;
      }
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
      #${appId} .sk-chk { width: 28px; text-align: center; }
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
      #${appId} .sk-info {
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
        box-sizing: border-box;
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
      @media (max-width: 800px) {
        #${appId} { inset: 10px; }
        #${appId} .sk-shell { max-height: calc(100vh - 20px); }
        #${appId} .sk-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        #${appId} .sk-summary-grid { grid-template-columns: 1fr; }
        #${appId} .sk-row { flex-direction: column; align-items: stretch; }
      }
    `;
}
