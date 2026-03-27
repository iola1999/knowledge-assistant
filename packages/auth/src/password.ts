import argon2 from "argon2";

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
  });
}

export async function verifyPassword(password: string, hash: string) {
  return argon2.verify(hash, password);
}
