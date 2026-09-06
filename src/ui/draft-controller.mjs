/** DraftController. Dependencies are supplied by the application composition root. */
export class DraftController {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.clearCurrentAccountDrafts = this.clearCurrentAccountDrafts.bind(this);
  }

  async clearCurrentAccountDrafts() {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { setBusy } = this.dependencies.panelView;
    const { initializeSession } = this.dependencies.sessionService;
    const { getServiceDraftAccountId, getAccountDisplayLabel } =
      this.dependencies.accountController;
    const { clearDraftsForAccount } = this.dependencies.draftRepository;
    const { askToReloadResult } = this.dependencies.dialogs;
    if (state.busy) {
      log("warn", "Another operation is already in progress.");
      return false;
    }
    const accountId = getServiceDraftAccountId();
    if (!accountId) {
      log("warn", "Cannot clear drafts: no Ads Manager account detected.");
      return false;
    }
    const label = getAccountDisplayLabel(accountId);
    const confirmed = window.confirm(
      `Clear all unpublished draft fragments for ${label}?\n\n` +
        "This only deletes Ads Manager drafts. Published campaigns, ad sets, ads, creatives, pixels, pages, and media are not touched.",
    );
    if (!confirmed) {
      log("info", "Draft cleanup cancelled.");
      return false;
    }
    setBusy(true);
    try {
      await initializeSession();
      log("info", `Clearing drafts for ${label}...`);
      const summary = await clearDraftsForAccount(accountId);
      log(
        "info",
        `Draft cleanup complete: ${summary.deletedCount} fragment${summary.deletedCount === 1 ? "" : "s"} deleted from ${summary.draftCount} draft${summary.draftCount === 1 ? "" : "s"}.`,
      );
      askToReloadResult(
        "Drafts cleared. Reload Ads Manager to refresh unpublished changes?",
        accountId,
      );
      return true;
    } catch (error) {
      log("error", "Draft cleanup error.", String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
}
