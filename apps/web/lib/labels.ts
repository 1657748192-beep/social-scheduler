export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    owner: "所有者",
    admin: "管理员",
    editor: "编辑者",
    viewer: "查看者"
  };

  return labels[role] ?? role;
}

export function accountStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "已连接",
    disconnected: "已断开",
    token_expired: "授权过期"
  };

  return labels[status] ?? status;
}

export function memberStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "正常",
    invited: "已邀请",
    disabled: "已停用"
  };

  return labels[status] ?? status;
}

export function invitationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待接受",
    accepted: "已接受",
    revoked: "已撤销",
    expired: "已过期"
  };

  return labels[status] ?? status;
}

export function scheduleStatusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: "已排程",
    locked: "发布中",
    published: "已发布",
    failed: "发布失败",
    canceled: "已取消"
  };

  return labels[status] ?? status;
}

export function publishJobStatusLabel(status: string) {
  const labels: Record<string, string> = {
    waiting: "等待中",
    active: "执行中",
    succeeded: "成功",
    retrying: "重试中",
    failed: "失败",
    dead: "已终止"
  };

  return labels[status] ?? status;
}

export function platformLabel(platform: string) {
  const labels: Record<string, string> = {
    x: "X / Twitter",
    twitter: "X / Twitter",
    instagram: "Instagram",
    facebook: "Facebook",
    tiktok: "TikTok"
  };

  return labels[platform] ?? platform;
}
