import { describe, expect, it } from "vitest";

import { getAuthFormErrorMessage } from "./form-error";

describe("getAuthFormErrorMessage", () => {
  it("explains invalid login credentials with a registration hint", () => {
    expect(
      getAuthFormErrorMessage({
        error: new Error("CredentialsSignin"),
        mode: "login",
      }),
    ).toBe("用户名或密码不正确。如尚未创建账号，请先注册。");
  });

  it("removes the registration hint when registration is closed", () => {
    expect(
      getAuthFormErrorMessage({
        error: new Error("CredentialsSignin"),
        mode: "login",
        registrationEnabled: false,
      }),
    ).toBe("用户名或密码不正确");
  });

  it("translates common registration validation errors", () => {
    expect(
      getAuthFormErrorMessage({
        error: "Username already exists.",
        mode: "register",
      }),
    ).toBe("用户名已存在。");

    expect(
      getAuthFormErrorMessage({
        error: "Username must be at least 3 chars and password at least 6 chars.",
        mode: "register",
      }),
    ).toBe("用户名至少 3 个字符，密码至少 6 个字符。");

    expect(
      getAuthFormErrorMessage({
        error: "Registration is disabled",
        mode: "register",
      }),
    ).toBe("当前未开放注册");
  });

  it("keeps unknown messages unchanged", () => {
    expect(
      getAuthFormErrorMessage({
        error: "Custom backend error",
        mode: "login",
      }),
    ).toBe("Custom backend error");
  });
});
