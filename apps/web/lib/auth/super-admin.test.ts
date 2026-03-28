import { describe, expect, test } from "vitest";

import {
  getSuperAdminUsernames,
  isSuperAdminUsername,
  SUPER_ADMIN_USERNAMES_ENV_NAME,
} from "./super-admin";

describe("getSuperAdminUsernames", () => {
  test("parses comma-separated usernames and trims blanks", () => {
    expect(
      getSuperAdminUsernames({
        [SUPER_ADMIN_USERNAMES_ENV_NAME]:
          " lawyer_a ,lawyer-b,,  admin_user  ",
      }),
    ).toEqual(["lawyer_a", "lawyer-b", "admin_user"]);
  });

  test("returns an empty list when the env var is missing", () => {
    expect(getSuperAdminUsernames({})).toEqual([]);
  });
});

describe("isSuperAdminUsername", () => {
  test("allows only configured usernames", () => {
    const env = {
      [SUPER_ADMIN_USERNAMES_ENV_NAME]: "alpha,beta",
    };

    expect(isSuperAdminUsername("alpha", env)).toBe(true);
    expect(isSuperAdminUsername("gamma", env)).toBe(false);
    expect(isSuperAdminUsername("", env)).toBe(false);
  });
});
