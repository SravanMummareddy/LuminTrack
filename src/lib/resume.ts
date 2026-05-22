/**
 * Converts a Google Drive / Google Docs share URL into an embeddable `/preview`
 * URL that renders inside an <iframe>. Returns null for any URL that isn't a
 * recognised Google Drive or Docs link (those are shown as a plain link instead).
 */
export function toDrivePreviewUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();

  if (host === "drive.google.com") {
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    if (fileMatch) {
      return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
    }
    const id = url.searchParams.get("id");
    if (id) {
      return `https://drive.google.com/file/d/${id}/preview`;
    }
    return null;
  }

  if (host === "docs.google.com") {
    const docMatch = url.pathname.match(
      /\/(document|spreadsheets|presentation)\/d\/([^/]+)/,
    );
    if (docMatch) {
      return `https://docs.google.com/${docMatch[1]}/d/${docMatch[2]}/preview`;
    }
    return null;
  }

  return null;
}
