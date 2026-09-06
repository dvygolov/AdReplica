export function parseGraphError(error) {
  if (!error) return null;
  if (typeof error === "object") {
    if (error.error) {
      return error.error;
    }
    // graphFetch throws Error instances whose message is a JSON string;
    // unwrap it so error classifiers can see code/subcode/message fields.
    const message =
      typeof error.message === "string" ? error.message.trim() : "";
    if (message.startsWith("{") || message.startsWith("[")) {
      try {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage && typeof parsedMessage === "object") {
          return parsedMessage.error || parsedMessage;
        }
      } catch (_parseError) {
        // Plain-text message; fall through to the normalized shape below.
      }
    }
    if (
      message ||
      error.code !== undefined ||
      error.error_subcode !== undefined
    ) {
      return {
        code: error.code,
        error_subcode: error.error_subcode,
        message,
      };
    }
    return error;
  }
  try {
    return JSON.parse(String(error).replace(/^Error:\s*/, ""));
  } catch (_parseError) {
    return null;
  }
}

export function getGraphErrorSubcode(error) {
  const parsed = parseGraphError(error);
  return Number(parsed?.error_subcode || parsed?.error?.error_subcode || 0);
}

export function isDirectAdCreativeGateError(error) {
  const parsed = parseGraphError(error);
  const code = Number(parsed?.code || parsed?.error?.code || 0);
  const haystack = JSON.stringify(parsed || error || "");
  return code === 3 && /neko_direct_api_enable/i.test(haystack);
}

export function isVideoNotReadyError(error) {
  const parsed = parseGraphError(error);
  const haystack = JSON.stringify(parsed || error || "");
  return (
    getGraphErrorSubcode(error) === 1885252 ||
    /video not ready for use in an ad|video is still being processed/i.test(
      haystack,
    )
  );
}

export function isImageNotFoundError(error) {
  const parsed = parseGraphError(error);
  const code = Number(parsed?.code || parsed?.error?.code || 0);
  const haystack = JSON.stringify(parsed || error || "");
  return (
    code === 100 &&
    (getGraphErrorSubcode(error) === 2446386 ||
      /Image Not Found|image you selected is not available/i.test(haystack))
  );
}

export function isGenericAdCreativeCreateFailure(error) {
  const parsed = parseGraphError(error);
  const code = Number(parsed?.code || parsed?.error?.code || 0);
  const haystack = JSON.stringify(parsed || error || "");
  return (
    code === 100 &&
    (getGraphErrorSubcode(error) === 1487390 ||
      /Adcreative Create Failed/i.test(haystack))
  );
}

export function creativePayloadHasVideo(payload) {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  if (payload.object_story_spec?.video_data?.video_id) {
    return true;
  }
  return (
    Array.isArray(payload.asset_feed_spec?.videos) &&
    payload.asset_feed_spec.videos.some((item) => item?.video_id)
  );
}

export function summarizeCreativePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  const afs = payload.asset_feed_spec || {};
  const osp = payload.object_story_spec || {};
  return {
    hasAssetFeedSpec: Boolean(payload.asset_feed_spec),
    assetImages: Array.isArray(afs.images) ? afs.images.length : 0,
    assetVideos: Array.isArray(afs.videos) ? afs.videos.length : 0,
    assetBodies: Array.isArray(afs.bodies) ? afs.bodies.length : 0,
    assetTitles: Array.isArray(afs.titles) ? afs.titles.length : 0,
    assetLinkUrls: Array.isArray(afs.link_urls) ? afs.link_urls.length : 0,
    hasObjectStorySpec: Boolean(payload.object_story_spec),
    hasLinkData: Boolean(osp.link_data),
    hasVideoData: Boolean(osp.video_data),
    pageId: String(osp.page_id || ""),
  };
}

export function isTransientNetworkFetchError(error) {
  const message = String(error?.message || error || "");
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed|aborterror/i.test(
    message,
  );
}

export function formatPrivateGraphqlError(error) {
  const message = String(error?.message || error || "");
  if (!message) {
    return "";
  }
  try {
    const parsed = JSON.parse(message);
    const firstError = Array.isArray(parsed) ? parsed[0] : parsed;
    return (
      [
        firstError?.summary,
        firstError?.description_raw || firstError?.description,
        firstError?.message,
      ]
        .filter(Boolean)
        .join(" / ") || message
    );
  } catch (_error) {
    return message;
  }
}
