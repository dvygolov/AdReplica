import { sleep } from "../utils/object.mjs";

/** VideoService. Dependencies are supplied by the application composition root. */
export class VideoService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.uploadRemoteVideo = this.uploadRemoteVideo.bind(this);
    this.uploadVideo = this.uploadVideo.bind(this);
    this.getVideoProcessingSnapshot =
      this.getVideoProcessingSnapshot.bind(this);
    this.waitForUploadedVideoProcessing =
      this.waitForUploadedVideoProcessing.bind(this);
    this.getPreferredVideoThumbnail =
      this.getPreferredVideoThumbnail.bind(this);
  }

  async uploadRemoteVideo(accountId, file) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const { getMediaFileName } = this.dependencies.downloadService;
    const { downloadRemoteMediaAsFile } = this.dependencies.imageService;
    const { uploadVideo, waitForUploadedVideoProcessing } = this;
    if (!file.sourceUrl) {
      throw new Error(
        `Remote video copy failed for ${getMediaFileName(file)}: no source URL.`,
      );
    }
    const failures = [];
    try {
      const json = await graphFetch(`act_${accountId}/advideos`, {
        method: "POST",
        query: { fields: "picture" },
        body: {
          title: getMediaFileName(file),
          file_url: file.sourceUrl,
        },
      });
      if (!json.id) {
        throw new Error("Facebook did not return video id.");
      }
      const videoId = String(json.id);
      await waitForUploadedVideoProcessing(videoId);
      log(
        "info",
        `Copied video ${getMediaFileName(file)} through Meta URL import.`,
      );
      return videoId;
    } catch (error) {
      if (error?.uncertain) throw error;
      failures.push(`file_url: ${String(error?.message || error)}`);
    }
    try {
      const downloaded = await downloadRemoteMediaAsFile(file);
      const videoId = await uploadVideo(accountId, downloaded);
      log(
        "info",
        `Copied video ${getMediaFileName(file)} through browser download fallback.`,
      );
      return videoId;
    } catch (error) {
      if (error?.uncertain) throw error;
      failures.push(`browser_download: ${String(error?.message || error)}`);
    }
    throw new Error(
      `Remote video copy failed for ${getMediaFileName(file)}. ${failures.join(" | ")}`,
    );
  }

  async uploadVideo(accountId, file) {
    const { graphFetch } = this.dependencies.graphClient;
    const { isRemoteMediaFile } = this.dependencies.downloadService;
    const { uploadRemoteVideo, waitForUploadedVideoProcessing } = this;
    if (isRemoteMediaFile(file)) {
      return uploadRemoteVideo(accountId, file);
    }
    const formData = new FormData();
    formData.append("source", file, file.name);
    const json = await graphFetch(`act_${accountId}/advideos`, {
      method: "POST",
      query: { fields: "picture" },
      formData,
    });
    if (!json.id) {
      throw new Error(`Facebook did not return video id for ${file.name}.`);
    }
    const videoId = String(json.id);
    await waitForUploadedVideoProcessing(videoId);
    return videoId;
  }

  async getVideoProcessingSnapshot(videoId) {
    const { graphFetch } = this.dependencies.graphClient;
    try {
      return await graphFetch(videoId, {
        query: { fields: "status,picture,thumbnails" },
      });
    } catch (error) {
      if (error?.uncertain) throw error;
      const text = String(error || "");
      if (/nonexisting field \(status\)/i.test(text)) {
        return graphFetch(videoId, {
          query: { fields: "picture,thumbnails" },
        });
      }
      throw error;
    }
  }

  async waitForUploadedVideoProcessing(videoId) {
    const { log } = this.dependencies.logging;
    const { getVideoProcessingSnapshot } = this;
    let thumbnailEvidenceCount = 0;
    for (let attempt = 1; attempt <= 24; attempt += 1) {
      const json = await getVideoProcessingSnapshot(videoId);
      const thumbs = json.thumbnails?.data || [];
      const preferred = thumbs.find((item) => item.is_preferred) || thumbs[0];
      const states = [
        json?.status?.video_status,
        json?.status?.processing_phase?.status,
        json?.status?.publishing_phase?.status,
      ]
        .map((value) => String(value || "").toLowerCase())
        .filter(Boolean);

      if (states.some((value) => /error|fail|rejected/.test(value))) {
        throw new Error(
          `Video ${videoId} failed processing: ${states.join(", ")}`,
        );
      }
      if (
        states.some((value) =>
          /ready|complete|finished|published|success/.test(value),
        )
      ) {
        return json;
      }
      if (preferred?.uri || json?.picture) {
        thumbnailEvidenceCount += 1;
        if (thumbnailEvidenceCount >= 3) {
          return json;
        }
        log(
          "warn",
          `Video ${videoId} has preview assets but may still be processing on Facebook, waiting 30s...`,
        );
        await sleep(30000);
        continue;
      }

      log(
        "warn",
        `Video ${videoId} uploaded but still processing on Facebook, waiting 30s...`,
      );
      await sleep(30000);
    }
    throw new Error(
      `Video ${videoId} did not finish processing on Facebook in time.`,
    );
  }

  async getPreferredVideoThumbnail(videoId) {
    const { log } = this.dependencies.logging;
    const { getVideoProcessingSnapshot } = this;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const json = await getVideoProcessingSnapshot(videoId);
      const thumbs = json.thumbnails?.data || [];
      const preferred = thumbs.find((item) => item.is_preferred) || thumbs[0];
      if (preferred?.uri) {
        return preferred.uri;
      }
      log("warn", `Video ${videoId} not ready yet, waiting for thumbnail...`);
      await sleep(30000);
    }
    throw new Error(`Failed to get thumbnail for video ${videoId}.`);
  }
}
