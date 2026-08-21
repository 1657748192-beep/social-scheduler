import type { Prisma } from "@prisma/client";

export type PinterestPinSettings = {
  boardId: string;
  boardName?: string;
  title: string;
  link?: string;
};

export type PinterestPinMedia = {
  mimeType: string;
  fileUrl?: string;
};

type PinterestCreatePinBody = {
  board_id: string;
  title: string;
  description: string;
  link?: string;
  media_source: {
    source_type: "image_url";
    url: string;
    is_standard: true;
  };
};

function readTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readPinterestPinSettings(value: Prisma.JsonValue | Record<string, unknown> | undefined): PinterestPinSettings | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const boardId = readTrimmedString(record.boardId);
  const boardName = readTrimmedString(record.boardName);
  const title = readTrimmedString(record.title);
  const link = readTrimmedString(record.link);

  return {
    boardId,
    ...(boardName ? { boardName } : {}),
    title,
    ...(link ? { link } : {})
  };
}

function isValidPinterestLink(link: string) {
  try {
    const url = new URL(link);
    return (url.protocol === "http:" || url.protocol === "https:") && link.length <= 2048;
  } catch {
    return false;
  }
}

export function getPinterestPinValidationError(
  value: Prisma.JsonValue | Record<string, unknown> | undefined,
  media: PinterestPinMedia[],
  description: string
) {
  const settings = readPinterestPinSettings(value);

  if (!settings?.boardId) {
    return "Choose a Pinterest board before publishing.";
  }

  if (!settings.title) {
    return "Enter a Pinterest Pin title before publishing.";
  }

  if (settings.title.length > 100) {
    return "Pinterest Pin titles can contain at most 100 characters.";
  }

  if (description.length > 800) {
    return "Pinterest descriptions can contain at most 800 characters.";
  }

  if (settings.link && !isValidPinterestLink(settings.link)) {
    return "Pinterest website links must be valid http or https URLs.";
  }

  if (media.length !== 1) {
    return "Pinterest publishing requires exactly one image.";
  }

  if (!media[0].mimeType.startsWith("image/")) {
    return media[0].mimeType.startsWith("video/")
      ? "Pinterest image Pins do not support video media yet."
      : "Pinterest publishing requires exactly one image.";
  }

  if (!media[0].fileUrl?.trim()) {
    return "Pinterest publishing requires a public image URL.";
  }

  return null;
}

export function buildPinterestCreatePinBody(
  settings: PinterestPinSettings,
  description: string,
  imageUrl: string
): PinterestCreatePinBody {
  return {
    board_id: settings.boardId,
    title: settings.title,
    description,
    ...(settings.link ? { link: settings.link } : {}),
    media_source: {
      source_type: "image_url",
      url: imageUrl,
      is_standard: true
    }
  };
}

export function pinterestPinPermalink(pinId: string) {
  return `https://www.pinterest.com/pin/${pinId}/`;
}
