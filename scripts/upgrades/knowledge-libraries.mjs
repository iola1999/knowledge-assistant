const KNOWLEDGE_LIBRARY_TYPE = {
  WORKSPACE_PRIVATE: "workspace_private",
};

const KNOWLEDGE_LIBRARY_STATUS = {
  ACTIVE: "active",
};

const KNOWLEDGE_SOURCE_SCOPE = {
  WORKSPACE_PRIVATE: "workspace_private",
  GLOBAL_LIBRARY: "global_library",
};

function sanitizeSlugPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolvePrivateLibrarySlug(client, workspace) {
  const baseSlug = `workspace-${sanitizeSlugPart(workspace.slug) || workspace.id.slice(0, 12)}`;
  const conflict = await client.query(
    `
      select id
      from knowledge_libraries
      where slug = $1
        and (workspace_id is distinct from $2)
      limit 1
    `,
    [baseSlug, workspace.id],
  );

  if ((conflict.rowCount ?? 0) === 0) {
    return baseSlug;
  }

  return `${baseSlug}-${workspace.id.slice(0, 8)}`;
}

async function ensureWorkspacePrivateLibrary(client, workspace) {
  const existing = await client.query(
    `
      select id
      from knowledge_libraries
      where workspace_id = $1
        and library_type = $2
      limit 1
    `,
    [workspace.id, KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE],
  );

  if (existing.rows[0]?.id) {
    await client.query(
      `
        update knowledge_libraries
        set
          title = $2,
          managed_by_user_id = $3,
          status = $4,
          archived_at = null,
          updated_at = now()
        where id = $1
      `,
      [
        existing.rows[0].id,
        workspace.title,
        workspace.user_id,
        KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
      ],
    );

    return existing.rows[0].id;
  }

  const slug = await resolvePrivateLibrarySlug(client, workspace);
  const inserted = await client.query(
    `
      insert into knowledge_libraries (
        library_type,
        workspace_id,
        slug,
        title,
        status,
        managed_by_user_id,
        created_at,
        updated_at
      ) values ($1, $2, $3, $4, $5, $6, now(), now())
      returning id
    `,
    [
      KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE,
      workspace.id,
      slug,
      workspace.title,
      KNOWLEDGE_LIBRARY_STATUS.ACTIVE,
      workspace.user_id,
    ],
  );

  return inserted.rows[0]?.id ?? null;
}

export const knowledgeLibrariesUpgrade = {
  key: "2026-03-knowledge-libraries-backfill",
  description:
    "Create a private knowledge library for each workspace and backfill library ownership fields.",
  blocking: true,
  safeInDevStartup: true,
  async run(context) {
    const workspaces = await context.client.query(
      `
        select id, user_id, slug, title
        from workspaces
      `,
    );

    let privateLibraryCount = 0;

    for (const workspace of workspaces.rows) {
      const libraryId = await ensureWorkspacePrivateLibrary(context.client, workspace);
      if (libraryId) {
        privateLibraryCount += 1;
      }
    }

    const documentsResult = await context.client.query(
      `
        update documents as d
        set library_id = kl.id
        from knowledge_libraries as kl
        where d.library_id is null
          and d.workspace_id = kl.workspace_id
          and kl.library_type = $1
      `,
      [KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE],
    );

    const directoriesResult = await context.client.query(
      `
        update workspace_directories as wd
        set library_id = kl.id
        from knowledge_libraries as kl
        where wd.library_id is null
          and wd.workspace_id = kl.workspace_id
          and kl.library_type = $1
      `,
      [KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE],
    );

    const chunksResult = await context.client.query(
      `
        update document_chunks as dc
        set library_id = d.library_id
        from documents as d
        where dc.library_id is null
          and dc.document_id = d.id
          and d.library_id is not null
      `,
    );

    const anchorsResult = await context.client.query(
      `
        update citation_anchors as ca
        set library_id = d.library_id
        from documents as d
        where ca.library_id is null
          and ca.document_id = d.id
          and d.library_id is not null
      `,
    );

    const citationsResult = await context.client.query(
      `
        update message_citations as mc
        set
          library_id = ca.library_id,
          source_scope = case
            when kl.library_type = $1 then $2
            else $3
          end,
          library_title_snapshot = kl.title
        from citation_anchors as ca
        left join knowledge_libraries as kl
          on kl.id = ca.library_id
        where mc.anchor_id = ca.id
          and (
            mc.library_id is null
            or mc.source_scope is null
            or mc.library_title_snapshot is null
          )
      `,
      [
        KNOWLEDGE_LIBRARY_TYPE.WORKSPACE_PRIVATE,
        KNOWLEDGE_SOURCE_SCOPE.WORKSPACE_PRIVATE,
        KNOWLEDGE_SOURCE_SCOPE.GLOBAL_LIBRARY,
      ],
    );

    return {
      workspaceCount: workspaces.rowCount ?? workspaces.rows.length,
      privateLibraryCount,
      documentsBackfilled: documentsResult.rowCount ?? 0,
      directoriesBackfilled: directoriesResult.rowCount ?? 0,
      chunksBackfilled: chunksResult.rowCount ?? 0,
      anchorsBackfilled: anchorsResult.rowCount ?? 0,
      citationsBackfilled: citationsResult.rowCount ?? 0,
    };
  },
};
