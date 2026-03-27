export async function requestAgentResponse(input: {
  prompt: string;
  workspaceId: string;
  conversationId: string;
  mode: "kb_only" | "kb_plus_web";
  agentSessionId?: string | null;
  agentWorkdir?: string | null;
}) {
  const baseUrl = process.env.AGENT_RUNTIME_URL;
  if (!baseUrl) {
    return {
      ok: true,
      text: "Agent runtime is not configured. Message saved, but no automated answer was generated.",
      citations: [] as Array<{
        anchor_id: string;
        document_path: string;
        page_no: number | null;
        label: string;
        quote_text: string;
      }>,
      sessionId: input.agentSessionId ?? null,
      workdir: input.agentWorkdir ?? null,
    };
  }

  const response = await fetch(`${baseUrl}/respond`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Agent runtime failed: ${text}`);
  }

  return (await response.json()) as {
    ok: boolean;
    text: string;
    sessionId?: string | null;
    workdir?: string | null;
    citations?: Array<{
      anchor_id: string;
      document_path: string;
      page_no: number | null;
      label: string;
      quote_text: string;
    }>;
  };
}
