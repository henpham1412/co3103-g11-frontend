// The material file contract, shared by the tutor authoring form and the student reader.
//
// LocalMaterialStorageService mints "/api/v1/materials/files/<key>" for uploaded bytes and
// serves them as an attachment through the API. ChapterService.validateMaterialPayload also
// accepts an external HTTPS address, so a DOCUMENT or VIDEO row can point at a resource the
// LMS does not host. Those two cases need different behaviour in the browser: only a stored
// key can be fetched through the authenticated client, everything else is opened directly.

const STORED_FILE_PATH = /\/materials\/files\/[^/]+$/;

// Mirrors VERIFIED_VIDEO_DOMAINS and VIDEO_STREAM_EXTENSIONS in ChapterService: a VIDEO link
// is either a trusted player host (including its subdomains) or a direct .mp4/.webm address.
const VERIFIED_VIDEO_DOMAINS = ["youtube.com", "youtube-nocookie.com", "vimeo.com"];
const VIDEO_STREAM_EXTENSIONS = ["mp4", "webm"];

export function isStoredMaterialFile(fileUrl: string | null | undefined): boolean {
  if (!fileUrl) return false;
  const value = fileUrl.trim();
  // The server only ever stores the relative key, so an absolute address is never one.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return STORED_FILE_PATH.test(value.split(/[?#]/)[0]);
}

export function isHttpsUrl(fileUrl: string | null | undefined): boolean {
  const url = parseAbsolute(fileUrl);
  return Boolean(url && url.protocol === "https:" && url.hostname);
}

export function isAllowedVideoUrl(fileUrl: string | null | undefined): boolean {
  const url = parseAbsolute(fileUrl);
  if (!url || url.protocol !== "https:" || !url.hostname) return false;
  const host = url.hostname.toLowerCase();
  if (VERIFIED_VIDEO_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) return true;
  const path = url.pathname;
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  if (dot < 0 || dot < slash) return false;
  return VIDEO_STREAM_EXTENSIONS.includes(path.slice(dot + 1).toLowerCase());
}

// parseHttpUrl on the server uses URI.create without a base, so a relative address is rejected.
function parseAbsolute(value: string | null | undefined): URL | undefined {
  if (!value || !value.trim()) return undefined;
  try {
    return new URL(value.trim());
  } catch {
    return undefined;
  }
}