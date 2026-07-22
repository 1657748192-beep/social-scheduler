export function appendWebsiteToText(text: string, website: string) {
  const trimmedWebsite = website.trim();

  if (!trimmedWebsite) {
    return text;
  }

  const trimmedText = text.trimEnd();
  return trimmedText ? `${trimmedText}\n\n${trimmedWebsite}` : trimmedWebsite;
}

export function isValidWebsite(website: string) {
  const trimmedWebsite = website.trim();

  if (!trimmedWebsite) {
    return true;
  }

  try {
    const url = new URL(trimmedWebsite);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
