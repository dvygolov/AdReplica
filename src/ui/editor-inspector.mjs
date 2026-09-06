/** EditorInspector. Dependencies are supplied by the application composition root. */
export class EditorInspector {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.buildAdsManagerAccountUrl = this.buildAdsManagerAccountUrl.bind(this);
    this.parsePreviewPayloadFromUrl =
      this.parsePreviewPayloadFromUrl.bind(this);
    this.inspectDynamicCreativeEditorState =
      this.inspectDynamicCreativeEditorState.bind(this);
  }

  buildAdsManagerAccountUrl(accountId) {
    const url = new URL(window.location.href);
    url.pathname = "/adsmanager/manage/campaigns";
    if (accountId) {
      url.searchParams.set("act", String(accountId));
    }
    return url.toString();
  }

  parsePreviewPayloadFromUrl(url) {
    if (!url) {
      return null;
    }
    try {
      const parsed = new URL(url);
      const read = (key) => {
        const raw = parsed.searchParams.get(key);
        return raw ? JSON.parse(raw) : null;
      };
      return {
        creative: read("creative"),
        campaign: read("campaign"),
        campaignGroup: read("campaign_group"),
      };
    } catch (_error) {
      return null;
    }
  }

  inspectDynamicCreativeEditorState(editorWindow) {
    const { parsePreviewPayloadFromUrl } = this;
    try {
      const text = String(editorWindow?.document?.body?.innerText || "");
      const previewUrl =
        editorWindow?.performance
          ?.getEntriesByType("resource")
          ?.map((entry) => entry.name)
          ?.filter((url) => url.includes("/ads/ad_preview/render_props/"))
          ?.slice(-1)?.[0] || "";
      const preview = parsePreviewPayloadFromUrl(previewUrl);
      const creative = preview?.creative || null;
      return {
        text,
        previewUrl,
        hasDynamicEnabled: text.includes("Dynamic creative is enabled"),
        hasFormatSection: /(?:^|\n)Format(?:\s|\n)/.test(text),
        hasUseFacebookPage: text.includes("Use Facebook Page"),
        hasSelectInstagramAccount: text.includes("Select an Instagram account"),
        instagramActorId: String(
          creative?.object_story_spec?.instagram_actor_id || "",
        ),
        instagramUserId: String(
          creative?.object_story_spec?.instagram_user_id || "",
        ),
        hasDestinationSpec: Boolean(
          creative?.destination_spec?.native_commerce_experience?.shop
            ?.action_metadata,
        ),
      };
    } catch (_error) {
      return {
        text: "",
        previewUrl: "",
        hasDynamicEnabled: false,
        hasFormatSection: false,
        hasUseFacebookPage: false,
        hasSelectInstagramAccount: false,
        instagramActorId: "",
        instagramUserId: "",
        hasDestinationSpec: false,
      };
    }
  }
}
