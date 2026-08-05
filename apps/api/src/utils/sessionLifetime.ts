export const LOGIN_SESSION_DURATION = "24h";
export const LOGIN_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type LoginSession = {
  createdAt: Date;
  revokedAt: Date | null;
};

export function loginSessionExpiresAt(createdAt: Date) {
  return new Date(createdAt.getTime() + LOGIN_SESSION_MAX_AGE_MS);
}

export function isLoginSessionActive(session: LoginSession, now = new Date()) {
  return !session.revokedAt && loginSessionExpiresAt(session.createdAt).getTime() > now.getTime();
}
