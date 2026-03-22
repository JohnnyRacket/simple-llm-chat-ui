const BASE_HOST = "http://192.168.1.168";

function cleanModelName(raw: string): string {
  const filename = raw.split("/").pop() ?? raw;
  return filename.replace(/\.gguf$/i, "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const port = searchParams.get("port") ?? "8080";
  const baseUrl = `${BASE_HOST}:${port}`;

  let modelName: string | null = null;
  let contextSize = 0;
  let paramsB: number | null = null;

  // /v1/models — always available, gives model name + metadata
  try {
    const res = await fetch(`${baseUrl}/v1/models`);
    const data = await res.json();
    const model = data.data?.[0];
    if (model) {
      modelName = cleanModelName(model.id ?? "");
      if (model.meta?.n_params) {
        paramsB = Math.round((model.meta.n_params / 1e9) * 10) / 10;
      }
      // n_ctx_train is the training context — use as last resort
      if (model.meta?.n_ctx_train) {
        contextSize = model.meta.n_ctx_train;
      }
    }
  } catch {}

  // /props — server-configured context size (overrides training context)
  try {
    const res = await fetch(`${baseUrl}/props`);
    if (res.ok) {
      const data = await res.json();
      const nCtx = data.default_generation_settings?.n_ctx;
      if (nCtx) contextSize = nCtx;
    }
  } catch {}

  // /slots — actual runtime context per slot (best source, may not be enabled)
  try {
    const res = await fetch(`${baseUrl}/slots`);
    if (res.ok) {
      const slots = await res.json();
      if (slots?.[0]?.n_ctx) {
        contextSize = slots[0].n_ctx;
      }
    }
  } catch {}

  return Response.json({ modelName, contextSize, paramsB });
}
