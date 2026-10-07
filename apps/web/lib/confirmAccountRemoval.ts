export async function confirmAccountRemoval(
  platform: string,
  accountName: string,
  disconnected: boolean,
  locale: string,
  confirm: (message: string) => boolean,
  remove: () => Promise<void>
): Promise<boolean> {
  const identity = `${platform} · ${accountName}`;
  const message = locale === "en"
    ? disconnected
      ? `Delete the disconnected account record “${identity}”?`
      : `Disconnect “${identity}”? Publishing through this connection will no longer be available. You can reconnect later.`
    : disconnected
      ? `确定删除已断开账号“${identity}”的记录吗？`
      : `确定解除绑定“${identity}”吗？解绑后将不能通过此连接发布内容，之后可以重新授权连接。`;
  if (!confirm(message)) return false;
  await remove();
  return true;
}
