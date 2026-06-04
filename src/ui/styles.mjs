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
        background: #333;
        color: #ccc;
        border: 1px solid #555;
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
      @media (max-width: 640px) {
        #${appId} { inset: 10px; }
        #${appId} .sk-summary-grid { grid-template-columns: 1fr; }
        #${appId} .sk-row { flex-direction: column; align-items: stretch; }
      }
    `;
}
