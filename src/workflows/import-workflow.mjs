import {
  hasCampaignLevelBudget,
  packageHasDayParting,
} from "../domain/budget.mjs";
import {
  getSourcePageId,
  materializePageMappedPackage,
  materializePixelMappedPackage,
  resolveMutuallyExclusiveStoryImageFields,
} from "../domain/creative.mjs";
import { materializeCatalogMappedPackage } from "../domain/package.mjs";
import { createDraftImportTransaction } from "../domain/draft-values.mjs";
import { normalizeImportOptions } from "../domain/options.mjs";
import { OperationReport } from "../operations/operation-report.mjs";

/** ImportWorkflow. Dependencies are supplied by the application composition root. */
export class ImportWorkflow {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.importPackage = this.importPackage.bind(this);
  }

  async importPackage(options) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { setBusy } = this.dependencies.panelView;
    const { initializeSession } = this.dependencies.sessionService;
    const { fetchAccountContext } = this.dependencies.accountContextService;
    const { enforceImportModeConstraints, refreshImportAccountContext } =
      this.dependencies.mappingController;
    const { runMediaPreflightAndApplyDecision } =
      this.dependencies.mediaPreflight;
    const {
      resetPageIdentityProvisionCache,
      preflightImportCreativeIdentities,
    } = this.dependencies.identityService;
    const { shiftPackageScheduleForImport } = this.dependencies.scheduleService;
    const { resolveCreativeImport, resolveCreativeDraftPayload } =
      this.dependencies.creativeService;
    const { createCampaign, createAdset, createAd, activateCampaign } =
      this.dependencies.directWriter;
    const { getCurrentDraftId } = this.dependencies.draftRepository;
    const { rollbackDraftImport } = this.dependencies.draftRecovery;
    const { ensureDraftInstagramIdentityParity, logDraftValidation } =
      this.dependencies.draftValidation;
    const { createCampaignDraft, createAdsetDraft, createAdDraft } =
      this.dependencies.draftWriter;
    const { resolvePixelMap } = this.dependencies.pixelService;
    const { prepareCatalogMappingsForImport } =
      this.dependencies.catalogMappingService;
    const { askToReloadResult } = this.dependencies.dialogs;
    const importOptions = normalizeImportOptions(options);
    const reloadOnSuccess = importOptions.reloadOnSuccess !== false;
    const originalImportPackage = state.importPackage;
    const report = (state.operationReport ||= new OperationReport({
      kind: "import",
      accountId: state.importAccountId,
      campaignName: state.importCampaignName,
      mode: state.importAsDraft ? "DRAFT" : state.importStatus,
      packageData: originalImportPackage,
    }));
    if (!state.importPackage) {
      log("warn", "Select a package JSON first.");
      return false;
    }
    if (!state.importAccountId) {
      log("warn", "Select an account for import first.");
      return false;
    }
    if (!state.importPackage.ads?.length) {
      const message =
        "This package contains no ads. Export a campaign with ads before importing.";
      report.issue(message, { stage: "preflight" });
      log("warn", message);
      return false;
    }
    setBusy(true);
    try {
      await initializeSession();
      await refreshImportAccountContext();
      resetPageIdentityProvisionCache();
      enforceImportModeConstraints();
      report.mode = state.importAsDraft ? "DRAFT" : state.importStatus;
      if (importOptions.pageMappings) {
        state.importPageMappings = {
          ...state.importPageMappings,
          ...importOptions.pageMappings,
        };
      }
      if (importOptions.pixelMappings) {
        state.importPixelMappings = {
          ...state.importPixelMappings,
          ...importOptions.pixelMappings,
        };
      }
      if (importOptions.catalogMappings) {
        state.importCatalogMappings = {
          ...state.importCatalogMappings,
          ...importOptions.catalogMappings,
        };
      }
      const importContext = await fetchAccountContext(state.importAccountId);
      state.importPackage = shiftPackageScheduleForImport(
        materializePageMappedPackage(
          originalImportPackage,
          state.importPageMappings,
        ),
      );

      // Derive special_ad_category_country from adset targeting if missing
      const campaign = state.importPackage.campaign;
      if (
        campaign.special_ad_categories?.length &&
        !campaign.special_ad_category_country
      ) {
        const countries = new Set();
        for (const adset of state.importPackage.adsets || []) {
          for (const c of adset.targeting?.geo_locations?.countries || []) {
            countries.add(c);
          }
        }
        if (countries.size) {
          campaign.special_ad_category_country = [...countries];
          log(
            "info",
            `Detected countries for special ad category: ${campaign.special_ad_category_country.join(", ")}`,
          );
        }
      }

      const mediaCache = {
        images: new Map(),
        imageUrls: new Map(),
        videos: new Map(),
      };
      const mediaPreflight = await runMediaPreflightAndApplyDecision(
        state.importPackage,
        state.importAccountId,
        mediaCache,
        importOptions,
      );
      if (!mediaPreflight.proceed) {
        state.operationCancelled = true;
        return false;
      }
      state.importPackage = mediaPreflight.packageData;
      const keptIds = new Set(
        state.importPackage.ads.map((ad) => String(ad.id)),
      );
      for (const ad of originalImportPackage.ads)
        if (!keptIds.has(String(ad.id)))
          report.skip(ad, "Excluded after media preflight.");
      if (!(state.importPackage.ads || []).length) {
        log(
          "warn",
          "Import stopped: media preflight left no valid ads to copy.",
        );
        return false;
      }

      await preflightImportCreativeIdentities(
        state.importAccountId,
        state.importPackage,
      );

      const catalogPlan =
        await this.dependencies.catalogMappingService.planCatalogMappingsForImport(
          state.importPackage,
          importContext,
          state.importCatalogMappings,
        );
      if (
        catalogPlan.some((item) => item.mode !== "reuse") &&
        importOptions.confirmCatalogChanges !== true
      ) {
        const accepted =
          await this.dependencies.dialogs.confirmCatalogPlan(catalogPlan);
        if (!accepted) {
          state.operationCancelled = true;
          return false;
        }
      }
      const preparedCatalogs = await prepareCatalogMappingsForImport(
        state.importPackage,
        importContext,
        state.importCatalogMappings,
      );
      state.importCatalogMappings = preparedCatalogs.catalogMappings;
      state.importPackage = materializeCatalogMappedPackage(
        state.importPackage,
        preparedCatalogs.catalogMappings,
        preparedCatalogs.productSetMappings,
      );

      const pixelMap = await resolvePixelMap(state.importAccountId);
      state.importPackage = materializePixelMappedPackage(
        state.importPackage,
        pixelMap,
      );
      const adsetMap = new Map();
      const creativeMap = new Map();

      if (state.importAsDraft) {
        const draftId = await getCurrentDraftId(state.importAccountId);
        const draftTransaction = createDraftImportTransaction(
          state.importAccountId,
          draftId,
        );
        try {
          const packageHasCampaignBudget = hasCampaignLevelBudget(
            state.importPackage.campaign,
          );
          const effectiveHasDayParting =
            packageHasDayParting(state.importPackage) &&
            !packageHasCampaignBudget;
          const draftCampaignId = await createCampaignDraft(
            state.importAccountId,
            draftId,
            state.importPackage.campaign,
            { hasDayParting: effectiveHasDayParting, draftTransaction },
          );
          const draftAdContext = new Map();

          for (const adset of state.importPackage.adsets) {
            const newAdsetId = await createAdsetDraft(
              state.importAccountId,
              draftId,
              draftCampaignId,
              adset,
              pixelMap,
              {
                hasCampaignBudget: packageHasCampaignBudget,
                campaignBidStrategy: state.importPackage.campaign?.bid_strategy,
                draftTransaction,
              },
            );
            adsetMap.set(String(adset.id), newAdsetId);
            log("info", `Draft adset created: ${adset.name}`);
          }

          for (const ad of state.importPackage.ads) {
            const creative = state.importPackage.creatives.find(
              (item) => String(item.id) === String(ad?.creative?.id),
            );
            if (!creative) {
              report.skip(ad, "Creative is missing from the package.");
              log(
                "warn",
                `Ad ${ad.name} skipped: creative ${ad?.creative?.id} not found in package.`,
              );
              continue;
            }
            if (!creativeMap.has(creative.id)) {
              const creativePayload = await resolveCreativeDraftPayload(
                state.importAccountId,
                creative,
                mediaCache,
              );
              if (!creativePayload) {
                creativeMap.set(creative.id, null);
              } else {
                creativeMap.set(creative.id, creativePayload);
              }
            }
            const draftCreative = creativeMap.get(creative.id);
            const adsetDraftId = adsetMap.get(String(ad?.adset?.id));
            if (!draftCreative || !adsetDraftId) {
              report.skip(ad, "Draft creative or ad set was not prepared.");
              log(
                "warn",
                `Ad ${ad.name} skipped: failed to build draft creative/adset.`,
              );
              continue;
            }
            resolveMutuallyExclusiveStoryImageFields(draftCreative);
            const sourcePageId = getSourcePageId(creative);
            const mappedPageId =
              state.importPageMappings[sourcePageId] || sourcePageId;
            const newDraftAdId = await createAdDraft(
              state.importAccountId,
              draftId,
              draftCampaignId,
              adsetDraftId,
              ad,
              draftCreative,
              { draftTransaction },
            );
            const context = {
              adId: String(newDraftAdId),
              adName: ad.name,
              pageId: String(mappedPageId || ""),
              creativeId: String(creative.id || ""),
              tempId: "",
            };
            draftAdContext.set(`id:${context.adId}`, context);
            draftAdContext.set(
              `name:${String(context.adName || "")
                .trim()
                .toLowerCase()}`,
              context,
            );
            log("info", `Draft ad created: ${ad.name}`);
          }

          const identityValidation = await ensureDraftInstagramIdentityParity(
            state.importAccountId,
            draftId,
            draftAdContext,
            draftTransaction,
          );
          if (identityValidation?.unresolvedCount)
            report.issue(
              `${identityValidation.unresolvedCount} draft identities remain unresolved.`,
              { stage: "identity" },
            );
          report.validation = await logDraftValidation(
            state.importAccountId,
            draftId,
            draftTransaction,
          );
          if (
            !report.isComplete() ||
            report.validation?.invalid ||
            report.validation?.pending ||
            report.issues.length
          )
            return false;
          log(
            "info",
            "Draft updated. Existing unpublished campaigns were preserved.",
          );
        } catch (error) {
          try {
            const rollback = await rollbackDraftImport(
              state.importAccountId,
              draftId,
              draftTransaction,
            );
            report.markRemoved(
              report.created
                .filter((item) => item.draftId === String(draftId))
                .map((item) => item.id),
            );
            log(
              "info",
              `Rolled back current draft import: ${rollback.deletedCount} fragment${rollback.deletedCount === 1 ? "" : "s"} deleted; existing draft content preserved.`,
            );
          } catch (rollbackError) {
            report.issue(rollbackError.message, {
              uncertain: true,
              stage: "rollback",
            });
            log(
              "error",
              "Current draft import rollback was incomplete; existing draft fragments were not targeted.",
              String(rollbackError),
            );
          }
          throw error;
        }
      } else {
        const newCampaignId = await createCampaign(
          state.importAccountId,
          state.importPackage.campaign,
        );
        log("info", `Campaign created: ${newCampaignId}`);
        const packageHasCampaignBudget = hasCampaignLevelBudget(
          state.importPackage.campaign,
        );

        for (const adset of state.importPackage.adsets) {
          const newAdsetId = await createAdset(
            state.importAccountId,
            newCampaignId,
            adset,
            pixelMap,
            {
              hasCampaignBudget: packageHasCampaignBudget,
              campaignBidStrategy: state.importPackage.campaign?.bid_strategy,
            },
          );
          adsetMap.set(String(adset.id), newAdsetId);
          log("info", `Adset created: ${adset.name}`);
        }

        for (const ad of state.importPackage.ads) {
          const creative = state.importPackage.creatives.find(
            (item) => String(item.id) === String(ad?.creative?.id),
          );
          if (!creative) {
            report.skip(ad, "Creative is missing from the package.");
            log(
              "warn",
              `Ad ${ad.name} skipped: creative ${ad?.creative?.id} not found.`,
            );
            continue;
          }
          if (!creativeMap.has(creative.id)) {
            const creativeId = await resolveCreativeImport(
              state.importAccountId,
              creative,
              mediaCache,
            );
            creativeMap.set(creative.id, creativeId || null);
          }
          const newCreativeId = creativeMap.get(creative.id);
          const newAdsetId = adsetMap.get(String(ad?.adset?.id));
          if (!newCreativeId || !newAdsetId) {
            report.skip(ad, "Creative or ad set was not prepared.");
            log("warn", `Ad ${ad.name} skipped: creative/adset not prepared.`);
            continue;
          }
          await createAd(state.importAccountId, newAdsetId, ad, newCreativeId);
          log("info", `Ad created: ${ad.name}`);
        }

        if (!report.isComplete()) {
          report.issue(
            "The campaign was only partially imported; it remains paused.",
          );
          return false;
        }
        if (state.importStatus === "ACTIVE")
          await activateCampaign(newCampaignId);
        log("info", "Import complete.");
      }
      if (reloadOnSuccess) {
        askToReloadResult(
          state.importAsDraft
            ? "Draft updated. Reload Ads Manager to show the unpublished changes?"
            : "Import is complete. Reload Ads Manager to show the new entities?",
          state.importAccountId,
        );
      }
      return true;
    } catch (error) {
      report.issue(error?.message || error, {
        uncertain: Boolean(error?.uncertain),
      });
      log("error", "Import error.", String(error));
      return false;
    } finally {
      state.importPackage = originalImportPackage;
      setBusy(false);
    }
  }
}
