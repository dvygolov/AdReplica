import {
  buildShiftedScheduleWindow,
  hasPositiveBudget,
} from "../domain/schedule.mjs";
import { deepClone } from "../utils/object.mjs";

/** ScheduleService. Dependencies are supplied by the application composition root. */
export class ScheduleService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.shiftPackageScheduleForImport =
      this.shiftPackageScheduleForImport.bind(this);
    this.cleanTargeting = this.cleanTargeting.bind(this);
  }

  shiftPackageScheduleForImport(packageData) {
    const { state } = this.dependencies;
    if (!packageData || !state.importPreserveSchedule) {
      return packageData;
    }
    const next = deepClone(packageData);
    const nowAnchor = new Date(Date.now() + 5 * 60 * 1000);
    const sourceCampaign = packageData.campaign || {};
    const targetCampaign = next.campaign || {};
    const campaignUsesLifetime = hasPositiveBudget(
      sourceCampaign.lifetime_budget,
    );
    const campaignWindow = buildShiftedScheduleWindow(
      sourceCampaign.start_time,
      sourceCampaign.stop_time,
      {
        anchor: nowAnchor,
        requireEnd: campaignUsesLifetime,
      },
    );

    if (campaignWindow.start) {
      targetCampaign.start_time = campaignWindow.start;
    }
    if (campaignWindow.end) {
      targetCampaign.stop_time = campaignWindow.end;
    } else if (state.importPreserveSchedule && sourceCampaign.stop_time) {
      delete targetCampaign.stop_time;
    }

    next.adsets = (next.adsets || []).map((adset, index) => {
      const sourceAdset = packageData.adsets?.[index] || {};
      const shifted = deepClone(adset);
      const adsetUsesLifetime =
        hasPositiveBudget(sourceAdset.lifetime_budget) || campaignUsesLifetime;
      const adsetWindow = buildShiftedScheduleWindow(
        sourceAdset.start_time || sourceCampaign.start_time,
        sourceAdset.end_time || sourceCampaign.stop_time,
        {
          anchor: nowAnchor,
          requireEnd: adsetUsesLifetime,
        },
      );
      if (adsetWindow.start) {
        shifted.start_time = adsetWindow.start;
      }
      if (adsetWindow.end) {
        shifted.end_time = adsetWindow.end;
      } else if (sourceAdset.end_time) {
        delete shifted.end_time;
      }
      return shifted;
    });

    return next;
  }

  cleanTargeting(targeting, itemName) {
    const { log } = this.dependencies.logging;
    if (!targeting || typeof targeting !== "object") return targeting;
    const next = deepClone(targeting);
    if (next.custom_audiences) {
      delete next.custom_audiences;
      log("warn", `Removed custom_audiences from targeting for ${itemName}.`);
    }
    if (next.excluded_custom_audiences) {
      delete next.excluded_custom_audiences;
      log(
        "warn",
        `Removed excluded_custom_audiences from targeting for ${itemName}.`,
      );
    }
    return next;
  }
}
