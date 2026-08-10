export type LabelLocale = "zh-CN" | "en";

type LocalizedLabels = Record<string, readonly [chinese: string, english: string]>;

function localizedLabel(status: string, labels: LocalizedLabels, locale: LabelLocale = "zh-CN") {
  const label = labels[status];
  return label ? label[locale === "en" ? 1 : 0] : status;
}

export function roleLabel(role: string, locale: LabelLocale = "zh-CN") {
  return localizedLabel(
    role,
    {
      owner: ["所有者", "Owner"],
      admin: ["管理员", "Administrator"],
      editor: ["编辑者", "Editor"],
      viewer: ["查看者", "Viewer"]
    },
    locale
  );
}

export function accountStatusLabel(status: string, locale: LabelLocale = "zh-CN") {
  return localizedLabel(
    status,
    {
      active: ["已连接", "Connected"],
      disconnected: ["已断开", "Disconnected"],
      token_expired: ["授权已过期", "Authorization expired"]
    },
    locale
  );
}

export function memberStatusLabel(status: string, locale: LabelLocale = "zh-CN") {
  return localizedLabel(
    status,
    {
      active: ["正常", "Active"],
      invited: ["已邀请", "Invited"],
      disabled: ["已停用", "Disabled"]
    },
    locale
  );
}

export function invitationStatusLabel(status: string, locale: LabelLocale = "zh-CN") {
  return localizedLabel(
    status,
    {
      pending: ["待接受", "Pending"],
      accepted: ["已接受", "Accepted"],
      revoked: ["已撤销", "Revoked"],
      expired: ["已过期", "Expired"]
    },
    locale
  );
}

export function scheduleStatusLabel(status: string, locale: LabelLocale = "zh-CN") {
  return localizedLabel(
    status,
    {
      scheduled: ["已排程", "Scheduled"],
      locked: ["发布中", "Publishing"],
      published: ["已发布", "Published"],
      failed: ["发布失败", "Publishing failed"],
      canceled: ["已取消", "Canceled"]
    },
    locale
  );
}

export function publishJobStatusLabel(status: string, locale: LabelLocale = "zh-CN") {
  return localizedLabel(
    status,
    {
      waiting: ["等待中", "Waiting"],
      active: ["执行中", "Publishing"],
      succeeded: ["成功", "Succeeded"],
      retrying: ["重试中", "Retrying"],
      failed: ["失败", "Failed"],
      dead: ["已终止", "Terminated"]
    },
    locale
  );
}

export function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    x: "Twitter / X",
    twitter: "Twitter / X",
    instagram: "Instagram",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    youtube: "YouTube",
    tiktok: "TikTok",
    pinterest: "Pinterest"
  };

  return labels[platform] ?? platform;
}
