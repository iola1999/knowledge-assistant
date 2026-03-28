import { eq } from "drizzle-orm";

import { conversationShares, getDb } from "@knowledge-assistant/db";

import { auth } from "@/auth";
import {
  buildConversationShareUrl,
  generateConversationShareToken,
  isConversationShareActive,
} from "@/lib/api/conversation-share";
import { requireOwnedConversation } from "@/lib/guards/resources";

export const runtime = "nodejs";

function serializeShare(
  share:
    | {
        shareToken: string;
        createdAt: Date;
        updatedAt: Date;
        revokedAt: Date | null;
      }
    | null,
  request: Request,
) {
  if (!share || !isConversationShareActive(share)) {
    return {
      isActive: false,
      shareUrl: null,
      createdAt: share?.createdAt?.toISOString() ?? null,
      updatedAt: share?.updatedAt?.toISOString() ?? null,
      revokedAt: share?.revokedAt?.toISOString() ?? null,
    };
  }

  return {
    isActive: true,
    shareUrl: buildConversationShareUrl(new URL(request.url).origin, share.shareToken),
    createdAt: share.createdAt.toISOString(),
    updatedAt: share.updatedAt.toISOString(),
    revokedAt: null,
  };
}

async function readConversationShare(conversationId: string) {
  const db = getDb();
  const rows = await db
    .select({
      shareToken: conversationShares.shareToken,
      createdAt: conversationShares.createdAt,
      updatedAt: conversationShares.updatedAt,
      revokedAt: conversationShares.revokedAt,
    })
    .from(conversationShares)
    .where(eq(conversationShares.conversationId, conversationId))
    .limit(1);

  return rows[0] ?? null;
}

async function requireConversationOwner(conversationId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const conversation = await requireOwnedConversation(conversationId, userId);
  if (!conversation) {
    return { error: Response.json({ error: "Conversation not found" }, { status: 404 }) };
  }

  return { userId, conversation };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const ownership = await requireConversationOwner(conversationId);
  if ("error" in ownership) {
    return ownership.error;
  }

  const share = await readConversationShare(conversationId);
  return Response.json({ share: serializeShare(share, request) });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const ownership = await requireConversationOwner(conversationId);
  if ("error" in ownership) {
    return ownership.error;
  }

  const { userId } = ownership;
  const db = getDb();
  const existingShare = await readConversationShare(conversationId);

  if (isConversationShareActive(existingShare)) {
    return Response.json({ share: serializeShare(existingShare, request) });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shareToken = generateConversationShareToken();

    try {
      const [share] = existingShare
        ? await db
            .update(conversationShares)
            .set({
              shareToken,
              createdByUserId: userId,
              updatedAt: new Date(),
              revokedAt: null,
            })
            .where(eq(conversationShares.conversationId, conversationId))
            .returning({
              shareToken: conversationShares.shareToken,
              createdAt: conversationShares.createdAt,
              updatedAt: conversationShares.updatedAt,
              revokedAt: conversationShares.revokedAt,
            })
        : await db
            .insert(conversationShares)
            .values({
              conversationId,
              createdByUserId: userId,
              shareToken,
            })
            .returning({
              shareToken: conversationShares.shareToken,
              createdAt: conversationShares.createdAt,
              updatedAt: conversationShares.updatedAt,
              revokedAt: conversationShares.revokedAt,
            });

      return Response.json({ share: serializeShare(share, request) }, { status: 201 });
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "23505" || attempt === 2) {
        return Response.json({ error: "开启分享失败" }, { status: 500 });
      }
    }
  }

  return Response.json({ error: "开启分享失败" }, { status: 500 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { conversationId } = await params;
  const ownership = await requireConversationOwner(conversationId);
  if ("error" in ownership) {
    return ownership.error;
  }

  const db = getDb();
  const [share] = await db
    .update(conversationShares)
    .set({
      updatedAt: new Date(),
      revokedAt: new Date(),
    })
    .where(eq(conversationShares.conversationId, conversationId))
    .returning({
      shareToken: conversationShares.shareToken,
      createdAt: conversationShares.createdAt,
      updatedAt: conversationShares.updatedAt,
      revokedAt: conversationShares.revokedAt,
    });

  return Response.json({ share: serializeShare(share ?? null, request) });
}
