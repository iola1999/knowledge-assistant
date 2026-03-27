import { auth } from "@/auth";
import { requireOwnedAnchor } from "@/lib/guards/resources";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ anchorId: string }> },
) {
  const { anchorId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anchor = await requireOwnedAnchor(anchorId, userId);
  if (!anchor) {
    return Response.json({ error: "Anchor not found" }, { status: 404 });
  }

  return Response.json({ anchor });
}
