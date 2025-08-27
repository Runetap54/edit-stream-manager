type CreateReq = {
  prompt: string;
  resolution: "1080p";
  model: "ray-flash-2";
  loop?: false;
};

type CreateRes = { 
  id: string 
};

type StatusRes = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  error?: string;
  assets?: { video?: string };
  progress?: number;
};

const BASE = `${process.env.LUMA_API_BASE}`;

export async function lumaCreate(body: CreateReq): Promise<CreateRes> {
  const r = await fetch(`${BASE}/generations`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${process.env.LUMA_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Luma create ${r.status}: ${await r.text()}`);
  return r.json();
}

export async function lumaStatus(id: string): Promise<StatusRes> {
  const r = await fetch(`${BASE}/generations/${id}`, {
    headers: { "authorization": `Bearer ${process.env.LUMA_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Luma status ${r.status}: ${await r.text()}`);
  return r.json();
}

export const DEFAULTS = {
  resolution: "1080p" as const,
  model: "ray-flash-2" as const,
  loop: false as const,
};