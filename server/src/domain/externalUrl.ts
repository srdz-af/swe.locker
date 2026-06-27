const urlSchemePattern = /^[a-z][a-z\d+.-]*:/i;

export function normalizeExternalApplicationTrackingUrl(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const candidateUrl = urlSchemePattern.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
  const parsedUrl = new URL(candidateUrl);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new TypeError("External tracking link must be an http(s) URL.");
  }

  return parsedUrl.toString();
}
