import { AdReplicaState } from "../state/ad-replica-state.mjs";
import { OperationReport } from "./operation-report.mjs";

/** Clone selections while preserving binary file objects. Session caches are rebuilt. */
function snapshot(value) {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Blob) return value;
  if (value instanceof Map)
    return new Map([...value].map(([key, item]) => [key, snapshot(item)]));
  if (value instanceof Set) return new Set(value);
  if (Array.isArray(value)) return value.map(snapshot);
  if (value instanceof Date) return new Date(value);
  if (value instanceof Promise) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, snapshot(item)]),
  );
}

export class OperationContext {
  constructor(kind, uiState, options = {}) {
    this.kind = kind;
    this.options = snapshot(options);
    this.state = Object.assign(new AdReplicaState(), snapshot(uiState));
    this.state.uiReady = false;
    this.state.busy = false;
    this.state.busyDepth = 0;
    this.state.operationActive = false;
    this.state.accountContextCache = {};
    this.state.pageIdentityProvisionCache = new Map();
    this.state.pageBackedThreadsProvisionCache = new Map();
    this.state.tempIdCursor = null;
    this.state.lastOperationReport = null;
    const cloning = kind === "clone";
    this.settings = Object.freeze({
      kind,
      accountId: cloning
        ? uiState.cloneTargetAccountId
        : kind === "export"
          ? uiState.exportAccountId
          : uiState.importAccountId,
      sourceAccountId: cloning
        ? uiState.cloneSourceAccountId
        : uiState.importPackage?.source?.accountId,
      campaignName: cloning
        ? uiState.cloneCampaignName
        : uiState.importCampaignName,
      mode: (cloning ? uiState.cloneAsDraft : uiState.importAsDraft)
        ? "DRAFT"
        : cloning
          ? uiState.cloneStatus
          : uiState.importStatus,
    });
    this.report = new OperationReport({
      ...this.settings,
      packageData: cloning ? uiState.clonePackage : uiState.importPackage,
    });
    this.state.operationReport = this.report;
  }

  useSession(state) {
    this.state.token = state.token;
    this.state.privateTokens = { ...state.privateTokens };
    this.state.sessionReady = state.sessionReady;
    this.state.loadingSession = false;
    this.state.accounts = snapshot(state.accounts);
  }
}
