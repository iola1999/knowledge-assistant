const AUTH_FORM_ERROR_MESSAGES = {
  CredentialsSignin: "用户名或密码不正确。如尚未创建账号，请先注册。",
  CredentialsSigninNoRegistration: "用户名或密码不正确",
  "Registration failed": "注册失败，请稍后再试。",
  "Registration is disabled": "当前未开放注册",
  "Username already exists.": "用户名已存在。",
  "Username must be at least 3 chars and password at least 6 chars.":
    "用户名至少 3 个字符，密码至少 6 个字符。",
  "Unexpected error": "发生了未预期错误，请稍后再试。",
} as const;

export function getAuthFormErrorMessage({
  error,
  mode,
  registrationEnabled = true,
}: {
  error: unknown;
  mode: "login" | "register";
  registrationEnabled?: boolean;
}) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  if (!rawMessage) {
    return AUTH_FORM_ERROR_MESSAGES["Unexpected error"];
  }

  if (rawMessage === "CredentialsSignin") {
    return mode === "login"
      ? registrationEnabled
        ? AUTH_FORM_ERROR_MESSAGES.CredentialsSignin
        : AUTH_FORM_ERROR_MESSAGES.CredentialsSigninNoRegistration
      : AUTH_FORM_ERROR_MESSAGES["Registration failed"];
  }

  return AUTH_FORM_ERROR_MESSAGES[
    rawMessage as keyof typeof AUTH_FORM_ERROR_MESSAGES
  ] ?? rawMessage;
}
