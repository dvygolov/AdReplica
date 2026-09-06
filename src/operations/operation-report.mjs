const ENTITY_TYPES = [
  "campaign",
  "adset",
  "ad",
  "creative",
  "image",
  "video",
  "pixel",
  "catalog",
  "product",
  "product_set",
  "feed",
];

/** Serializable journal. It contains resource IDs and outcomes, never credentials. */
export class OperationReport {
  constructor({
    kind,
    accountId,
    sourceAccountId,
    campaignName,
    mode,
    packageData,
  }) {
    this.id = `adreplica-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    this.kind = kind;
    this.accountId = accountId || "";
    this.sourceAccountId = sourceAccountId || "";
    this.campaignName = campaignName || "";
    this.mode = mode || "";
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.status = "running";
    this.expected = {
      campaign: packageData ? 1 : 0,
      adset: packageData?.adsets?.length || 0,
      ad: packageData?.ads?.length || 0,
    };
    this.created = [];
    this.skipped = [];
    this.issues = [];
    this.validation = null;
    this.activation = "not_requested";
    this.resources = [];
  }

  record(type, id, name = "", extra = {}) {
    if (!ENTITY_TYPES.includes(type) || !id || String(id) === "undefined")
      throw new Error(`Missing created ${type} ID.`);
    const row = { type, id: String(id), name: String(name || ""), ...extra };
    const existing = this.created.find(
      (item) => item.type === type && item.id === row.id,
    );
    if (existing) Object.assign(existing, row);
    else this.created.push(row);
    return row;
  }

  skip(ad, reason) {
    this.skipped.push({
      id: String(ad?.id || ""),
      name: String(ad?.name || ""),
      reason: String(reason),
    });
  }
  issue(message, { uncertain = false, stage = "operation" } = {}) {
    this.issues.push({ message: String(message), uncertain, stage });
  }
  markRemoved(ids) {
    const removed = new Set(ids.map(String));
    for (const item of this.created)
      if (removed.has(item.id) || removed.has(item.fragmentId))
        item.removed = true;
  }
  counts() {
    return Object.fromEntries(
      ["campaign", "adset", "ad"].map((type) => [
        type,
        this.kind === "export"
          ? this.exported?.[type] || 0
          : this.created.filter((x) => x.type === type && !x.removed).length,
      ]),
    );
  }
  isComplete() {
    const counts = this.counts();
    return (
      ["campaign", "adset", "ad"].every(
        (type) => counts[type] === this.expected[type],
      ) &&
      this.expected.ad > 0 &&
      !this.skipped.length
    );
  }

  finish(success, { cancelled = false } = {}) {
    if (this.finishedAt) return this;
    this.finishedAt = new Date().toISOString();
    const incomplete = this.kind !== "export" && !this.isComplete();
    const remaining =
      this.created.some((x) => !x.removed) || Boolean(this.exported);
    this.status =
      this.issues.some((x) => x.uncertain) || this.validation?.pending
        ? "needs_review"
        : cancelled
          ? remaining
            ? "partial"
            : "cancelled"
          : success &&
              !incomplete &&
              !this.validation?.invalid &&
              !this.issues.length &&
              !this.skipped.length
            ? "success"
            : remaining
              ? "partial"
              : "failed";
    return this;
  }

  toJSON() {
    return JSON.parse(JSON.stringify({ ...this, counts: this.counts() }));
  }
  toText() {
    const data = this.toJSON();
    return [
      `AdReplica ${data.kind}: ${data.status}`,
      `Account: ${data.accountId}; source: ${data.sourceAccountId}; mode: ${data.mode}`,
      `Campaign: ${data.campaignName}`,
      ...Object.entries(data.expected).map(
        ([type, n]) => `${type}: ${data.counts[type]}/${n}`,
      ),
      ...data.created.map(
        (x) =>
          `${x.removed ? "REMOVED" : "CREATED"} ${x.type} ${x.id} ${x.name}`,
      ),
      ...data.skipped.map((x) => `SKIPPED ${x.name || x.id}: ${x.reason}`),
      ...data.issues.map(
        (x) =>
          `${x.uncertain ? "UNCONFIRMED" : "ISSUE"} ${x.stage}: ${x.message}`,
      ),
      `Activation: ${data.activation}`,
      `Validation: ${JSON.stringify(data.validation)}`,
      ...data.resources.map((x) => `RESOURCE ${x.type} ${x.id}: ${x.action}`),
    ].join("\n");
  }
}
