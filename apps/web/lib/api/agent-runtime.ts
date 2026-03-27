export async function requestAgentResponse(input: {
  prompt: string;
  mode: "kb_only" | "kb_plus_web";
}) {
  const baseUrl = process.env.AGENT_RUNTIME_URL;
  if (!baseUrl) {
    return {
      ok: true,
      text: "Agent runtime is not configured. Message saved, but no automated answer was generated.",
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

  return (await response.json()) as { ok: boolean; text: string };
}
