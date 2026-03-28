export const SUPER_ADMIN_USERNAMES_ENV_NAME = "SUPER_ADMIN_USERNAMES";

export function getSuperAdminUsernames(
  env: Record<string, string | undefined> = process.env,
) {
  const rawValue = env[SUPER_ADMIN_USERNAMES_ENV_NAME];
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isSuperAdminUsername(
  username: string | null | undefined,
  env: Record<string, string | undefined> = process.env,
) {
  if (!username) {
    return false;
  }

  return getSuperAdminUsernames(env).includes(username.trim());
}
