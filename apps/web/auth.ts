import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";

import { verifyPassword } from "@anchordesk/auth";
import { getDb, users } from "@anchordesk/db";

import { syncAuthSessionToken } from "@/lib/auth/jwt-session";
import { revokeAuthSession } from "@/lib/auth/session-registry";

export const AUTH_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
  },
  trustHost: process.env.AUTH_TRUST_HOST !== "false",
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const username = String(credentials?.username ?? "").trim();
        const password = String(credentials?.password ?? "");
        if (!username || !password) {
          return null;
        }

        const db = getDb();
        const result = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);

        const user = result[0];
        if (!user) {
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          name: user.displayName ?? user.username,
          username: user.username,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const sessionUser =
        user &&
        typeof user.id === "string" &&
        user.id.length > 0 &&
        typeof user.username === "string" &&
        user.username.length > 0
          ? {
              id: user.id,
              name: user.name,
              username: user.username,
            }
          : undefined;

      return syncAuthSessionToken({
        token,
        user: sessionUser,
        trigger,
        session,
        maxAgeSeconds: AUTH_SESSION_MAX_AGE_SECONDS,
      });
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.username = typeof token.username === "string" ? token.username : "";
        session.user.name = typeof token.name === "string" ? token.name : null;
      }
      return session;
    },
  },
  events: {
    async signOut(message) {
      if (!("token" in message)) {
        return;
      }

      const token = message.token;
      const sessionId =
        token && typeof token === "object" && "sessionId" in token
          ? token.sessionId
          : undefined;
      const userId = token && typeof token.sub === "string" ? token.sub : undefined;
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        return;
      }

      await revokeAuthSession({
        sessionId,
        userId,
      });
    },
  },
});
