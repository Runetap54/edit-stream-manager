type CreateReq = {
  prompt: string;
  model: "ray-2-flash";
  keyframes: {
    frame0: {
      type: "image";
      url: string;
    };
    frame1?: {
      type: "image";
      url: string;
    };
  };
  loop?: boolean;
  aspect_ratio?: string;
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
  const r = await fetch(BASE, {
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
  model: "ray-2-flash" as const,
  loop: false as const,
  aspect_ratio: "16:9" as const,
};