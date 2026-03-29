import { and, eq, isNotNull } from "drizzle-orm";
import { documentVersions, getDb } from "@anchordesk/db";
import {
  buildContentAddressedStorageKey,
  normalizeSha256Hex,
} from "@anchordesk/storage";

export async function hasVerifiedContentAddressedBlob(sha256: string) {
  const normalizedSha256 = normalizeSha256Hex(sha256);
  const storageKey = buildContentAddressedStorageKey(normalizedSha256);
  const [existingVersion] = await getDb()
    .select({ id: documentVersions.id })
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.sha256, normalizedSha256),
        eq(documentVersions.storageKey, storageKey),
        isNotNull(documentVersions.fileSizeBytes),
      ),
    )
    .limit(1);

  return Boolean(existingVersion);
}
