import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { v4 as uuidv4 } from "https://esm.sh/uuid@9.0.0";
import { crypto } from "https://deno.land/std@0.190.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// If your real secret name is different, keep it consistent with Supabase Secrets.
const lumaApiKey = Deno.env.get("LUMAAI_API_KEY")!;
// [CHANGED] safer default includes /generations
const lumaApiBase =
  Deno.env.get("LUMA_API_BASE") || "https://api.lumalabs.ai/dream-machine/v1/generations";
// [NEW] callback URL for server-driven updates
const lumaCallbackUrl = Deno.env.get("LUMA_CALLBACK_URL") || "";

const signedUrlTtl = parseInt(Deno.env.get("SIGNED_URL_TTL_SECONDS") || "3600");

// [NEW] default public bucket for keyframes
const keyframesBucket = Deno.env.get("KEYFRAMES_PUBLIC_BUCKET") || "keyframes";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function generateCorrelationId(): string {
  return uuidv4();
}

async function logError(params: {
  route: string;
  method: string;
  status: number;
  code: string;
  message: string;
  correlationId: string;
  userId?: string;
  safeContext?: Record<string, any>;
}) {
  try {
    await supabase.from("error_events").insert({
      route: params.route,
      method: params.method,
      status: params.status,
      code: params.code,
      message: params.message,
      correlation_id: params.correlationId,
      user_id: params.userId,
      safe_context: params.safeContext,
    });
  } catch (logErr) {
    console.error("Failed to log error:", logErr);
  }
  console.error(
    `[${params.correlationId}] ${params.method} ${params.route} - ${params.status} ${params.code}: ${params.message}`,
    params.safeContext
  );
}

function validateSceneRequest(body: any) {
  const errors: string[] = [];
  if (!body.folder || typeof body.folder !== "string") {
    errors.push("folder is required and must be a string");
  }
  if (!body.start_key || typeof body.start_key !== "string") {
    errors.push("start_key is required and must be a string");
  }
  if (body.end_key && typeof body.end_key !== "string") {
    errors.push("end_key must be a string if provided");
  }
  if (!body.shot_type_id || typeof body.shot_type_id !== "string") {
    errors.push("shot_type_id is required and must be a string");
  }
  return errors;
}

// (Kept for compatibility if other parts still reference it)
async function generateSignedUrl(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from("media")
      .createSignedUrl(storagePath, signedUrlTtl);
    if (error) throw error;
    return data.signedUrl;
  } catch (error) {
    console.error("Failed to generate signed URL:", error);
    return null;
  }
}

function extractStoragePath(cdnUrl: string): string {
  const match = cdnUrl.match(/\/storage\/v1\/object\/(?:sign|public)\/media\/(.+?)(?:\?|$)/);
  return match ? match[1] : cdnUrl;
}

function cleanParams(model: string, params: Record<string, any> = {}) {
  const allowed: Record<string, string[]> = {
    "ray-flash-2": ["aspect_ratio", "loop"],
  };
  const keep = allowed[model] ?? [];
  const out: Record<string, any> = {};
  for (const k of keep) {
    if (params[k] !== undefined) out[k] = params[k];
  }
  return out;
}

function toLumaPayload(input: {
  prompt: string;
  model_code?: string;
  params?: Record<string, unknown>;
  keyframes?: Record<string, { type: string; url: string }>;
}) {
  const { prompt, model_code = "ray-flash-2", params = {}, keyframes } = input;
  const model = model_code === "ray-flash-2" ? "ray-flash-2" : "ray-flash-2";
  const out: any = { prompt, model };

  const ar = (params as any)["aspect_ratio"];
  if (ar === "16:9" || ar === "9:16" || ar === "1:1") out.aspect_ratio = ar;

  const loop = (params as any)["loop"];
  if (typeof loop === "boolean") out.loop = loop;

  if (keyframes && typeof keyframes === "object") {
    const cleaned: any = {};
    for (const [k, v] of Object.entries(keyframes)) {
      if (v && v.type === "image" && typeof v.url === "string") cleaned[k] = v;
    }
    if (Object.keys(cleaned).length) out.keyframes = cleaned;
  }

  return out;
}

// [CHANGED] HEAD check with 1-byte GET fallback (handles CDNs without CT on HEAD)
async function headOk(url: string): Promise<boolean> {
  try {
    let r = await fetch(url, { method: "HEAD" });
    let ct = r.headers.get("content-type") ?? "";
    if (r.ok && ct.startsWith("image/")) return true;

    r = await fetch(url, { headers: { Range: "bytes=0-0" } });
    ct = r.headers.get("content-type") ?? "";
    return r.ok && ct.startsWith("image/");
  } catch {
    return false;
  }
}

async function callLumaAPI(
  payload: any,
  correlationId: string
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
  lumaError?: { status: number; body: string; parsed?: any };
}> {
  const maxAttempts = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(
        `[${correlationId}] Calling Luma Dream Machine API (attempt ${attempt}/${maxAttempts}) with payload:`,
        JSON.stringify(payload, null, 2)
      );

      const response = await fetch(lumaApiBase, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lumaApiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      console.log(`[${correlationId}] Luma API response status: ${response.status}`);
      console.log(`[${correlationId}] Luma API response body: ${responseText}`);

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        parsedResponse = null;
      }

      if (response.ok) {
        return { success: true, data: parsedResponse ?? responseText };
      }

      const lumaError = { status: response.status, body: responseText, parsed: parsedResponse };

      if (response.status >= 500) {
        lastError = lumaError;
        if (attempt < maxAttempts) {
          const delay = 250 * Math.pow(2, attempt - 1);
          console.log(`[${correlationId}] Luma server error ${response.status}, retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      } else {
        return {
          success: false,
          error: `Luma API returned ${response.status}: ${responseText}`,
          lumaError,
        };
      }
    } catch (networkError) {
      console.error(`[${correlationId}] Luma API network error (attempt ${attempt}):`, networkError);
      lastError = networkError;
      if (attempt < maxAttempts) {
        const delay = 250 * Math.pow(2, attempt - 1);
        console.log(`[${correlationId}] Network error, retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  return {
    success: false,
    error: lastError?.status
      ? `Luma API returned ${lastError.status}: ${lastError.body}`
      : `Network error after ${maxAttempts} attempts: ${lastError?.message || "Unknown error"}`,
    lumaError: lastError?.status ? lastError : undefined,
  };
}

// [NEW] Mirror a private object from 'media' to the public 'keyframes' bucket and return a CDN URL
async function mirrorToPublic(srcKey: string) {
  const source = supabase.storage.from("media");
  const target = supabase.storage.from(keyframesBucket);

  const dl = await source.download(srcKey);
  if ((dl as any).error) throw (dl as any).error;
  const blob = (dl as any).data;
  const buf = await blob.arrayBuffer();

  const ext = srcKey.split(".").pop()?.toLowerCase() || "jpg";
  const destKey = `ingest/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await target.upload(destKey, buf, {
    contentType: blob.type || (ext === "png" ? "image/png" : "image/jpeg"),
    upsert: true,
  });
  if (upErr) throw upErr;

  const { data: pub } = target.getPublicUrl(destKey);
  return { publicUrl: pub.publicUrl, destKey };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const correlationId = generateCorrelationId();
  const responseHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  console.log(`[${correlationId}] === NEW REQUEST ===`);
  console.log(`[${correlationId}] Method: ${req.method}`);
  console.log(`[${correlationId}] URL: ${req.url}`);

  try {
    // Parse and validate request
    let body;
    try {
      body = await req.json();
      console.log(`[${correlationId}] 🔍 REQUEST BODY:`, JSON.stringify(body, null, 2));
    } catch (parseError) {
      await logError({
        route: "/luma-create-scene",
        method: "POST",
        status: 400,
        code: "INVALID_JSON",
        message: "Invalid JSON in request body",
        correlationId,
      });

      return new Response(
        JSON.stringify({
          error: { code: "INVALID_JSON", message: "Invalid JSON in request body", correlationId },
          ok: false,
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    const validationErrors = validateSceneRequest(body);
    if (validationErrors.length > 0) {
      await logError({
        route: "/luma-create-scene",
        method: "POST",
        status: 400,
        code: "VALIDATION_ERROR",
        message: validationErrors.join(", "),
        correlationId,
        safeContext: { validationErrors },
      });

      return new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            detail: validationErrors,
            correlationId,
          },
          ok: false,
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Missing or invalid authorization header", correlationId },
          ok: false,
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    const token = authHeader.split(" ")[1];
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      await logError({
        route: "/luma-create-scene",
        method: "POST",
        status: 401,
        code: "AUTH_ERROR",
        message: authError?.message || "User not found",
        correlationId,
      });

      return new Response(
        JSON.stringify({
          error: { code: "AUTH_ERROR", message: "Authentication failed", correlationId },
          ok: false,
        }),
        { status: 401, headers: responseHeaders }
      );
    }

    // Check user profile status
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .single();

    if (profileError || profile?.status !== "approved") {
      await logError({
        route: "/luma-create-scene",
        method: "POST",
        status: 403,
        code: "PROFILE_NOT_APPROVED",
        message: "User profile not approved",
        correlationId,
        userId: user.id,
      });

      return new Response(
        JSON.stringify({
          error: {
            code: "PROFILE_NOT_APPROVED",
            message: "Your profile must be approved to generate scenes",
            correlationId,
          },
          ok: false,
        }),
        { status: 403, headers: responseHeaders }
      );
    }

    // Get shot type details
    const { data: shotType, error: shotTypeError } = await supabase
      .from("shot_types")
      .select("name, prompt_template")
      .eq("id", body.shot_type_id)
      .eq("owner_id", user.id)
      .single();

    if (shotTypeError || !shotType) {
      await logError({
        route: "/luma-create-scene",
        method: "POST",
        status: 400,
        code: "SHOT_TYPE_NOT_FOUND",
        message: "Shot type not found or not owned by user",
        correlationId,
        userId: user.id,
      });

      return new Response(
        JSON.stringify({
          error: { code: "SHOT_TYPE_NOT_FOUND", message: "Shot type not found", correlationId },
          ok: false,
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Get project info for ordinal calculation
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("name", body.folder)
      .eq("owner_id", user.id)
      .single();

    if (projectError || !project) {
      await logError({
        route: "/luma-create-scene",
        method: "POST",
        status: 404,
        code: "PROJECT_NOT_FOUND",
        message: "Project not found",
        correlationId,
        userId: user.id,
      });

      return new Response(
        JSON.stringify({
          error: { code: "PROJECT_NOT_FOUND", message: "Project not found", correlationId },
          ok: false,
        }),
        { status: 404, headers: responseHeaders }
      );
    }

    // Get next ordinal for this project
    const { data: ordinalResult, error: ordinalError } = await supabase.rpc("next_scene_ordinal", {
      p_project_id: project.id,
    });

    if (ordinalError) {
      console.error("Failed to get next ordinal:", ordinalError);
      return new Response(
        JSON.stringify({
          error: { code: "DB_ERROR", message: "Failed to get next ordinal", correlationId },
          ok: false,
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    const nextOrdinal = ordinalResult;

    // === KEYFRAME URL PREP ===
    const startFrameStoragePath = extractStoragePath(body.start_key);
    const endFrameStoragePath = body.end_key ? extractStoragePath(body.end_key) : null;

    // Mirror to PUBLIC keyframes bucket and get public CDN URLs
    const { publicUrl: startFrameUrl } = await mirrorToPublic(startFrameStoragePath);
    const endMirror = endFrameStoragePath ? await mirrorToPublic(endFrameStoragePath) : null;
    const endFrameUrl = endMirror?.publicUrl || null;

    console.log("Public keyframe URLs generated:", {
      startFrameUrl,
      endFrameUrl,
      correlationId,
    });

    // Insert scene record into database
    const { data: scene, error: sceneError } = await supabase
      .from("scenes")
      .insert({
        user_id: user.id,
        project_id: project.id,
        folder: body.folder,
        start_key: startFrameStoragePath,
        end_key: endFrameStoragePath,
        shot_type_id: body.shot_type_id,
        ordinal: nextOrdinal,
        version: 1,
        start_frame_signed_url: startFrameUrl,
        end_frame_signed_url: endFrameUrl,
        signed_url_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        luma_status: "pending",
        status: "queued",
      })
      .select()
      .single();

    if (sceneError || !scene) {
      console.error("Failed to create scene record:", sceneError);
      return new Response(
        JSON.stringify({
          error: { code: "DB_ERROR", message: "Failed to create scene record", correlationId },
          ok: false,
        }),
        { status: 500, headers: responseHeaders }
      );
    }

    console.log("Created scene record:", scene.id);

    // Generate idempotency key
    const idemInputs = {
      userId: user.id,
      folder: body.folder,
      startKey: body.start_key,
      endKey: body.end_key,
      shotTypeId: body.shot_type_id,
      prompt: shotType.prompt_template,
    };
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(idemInputs));
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const idemKey = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Validate keyframe URLs are accessible
    if (!(await headOk(startFrameUrl))) {
      return new Response(
        JSON.stringify({
          error: { code: "INVALID_KEYFRAME_URL", message: "Start frame URL not reachable or not image/*", correlationId },
          ok: false,
        }),
        { status: 400, headers: responseHeaders }
      );
    }
    if (endFrameUrl && !(await headOk(endFrameUrl))) {
      return new Response(
        JSON.stringify({
          error: { code: "INVALID_KEYFRAME_URL", message: "End frame URL not reachable or not image/*", correlationId },
          ok: false,
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Prepare keyframes
    const keyframes: Record<string, { type: string; url: string }> = {
      frame0: { type: "image", url: startFrameUrl },
    };
    if (endFrameUrl) keyframes.frame1 = { type: "image", url: endFrameUrl };

    // Build provider payload
    const providerBody: any = {
      prompt: shotType.prompt_template,
      model: "ray-flash-2",
      aspect_ratio: "16:9",
      keyframes,
      // [NEW] include callback so Luma will POST back server-to-server
      callback_url: lumaCallbackUrl || undefined,
    };

    // Default NO loop:
    // - Single keyframe: explicitly set loop=false (allowed, matches your requirement).
    // - Two keyframes: omit loop entirely (Luma forbids loop with two keyframes).
    const hasF0 = !!providerBody?.keyframes?.frame0?.url;
    const hasF1 = !!providerBody?.keyframes?.frame1?.url;
    if (hasF0 && !hasF1) {
      providerBody.loop = false; // default no loop
    } else {
      if ("loop" in providerBody) delete providerBody.loop; // ensure not sent when 2 keyframes
    }

    // Strip unknown params
    const allowedTop = ["prompt", "model", "aspect_ratio", "duration", "quality", "keyframes", "loop", "callback_url"];
    for (const k of Object.keys(providerBody)) {
      if (!allowedTop.includes(k)) delete providerBody[k];
    }

    console.log(
      `[${correlationId}] 📤 LUMA REQUEST PAYLOAD:`,
      JSON.stringify({ ...providerBody, keyframes: { ...providerBody.keyframes, frame0: { ...providerBody.keyframes.frame0, url: "[redacted]" }, ...(providerBody.keyframes.frame1 ? { frame1: { ...providerBody.keyframes.frame1, url: "[redacted]" } } : {}) } }, null, 2)
    );
    console.log(
      `[${correlationId}] 🔍 Keyframes check: frame0=${hasF0}, frame1=${hasF1}, loop=${"loop" in providerBody ? providerBody.loop : "omitted"}`
    );

    // Call Luma
    const lumaResult = await callLumaAPI(providerBody, correlationId);

    if (!lumaResult.success) {
      await supabase
        .from("scenes")
        .update({ status: "error", luma_status: "failed", luma_error: lumaResult.error })
        .eq("id", scene.id);

      let errorCode = "LUMA_API_ERROR";
      let userMessage = "Scene generation failed";
      if (lumaResult.lumaError) {
        const { status, parsed } = lumaResult.lumaError;
        if (status === 403) {
          errorCode = "LUMA_AUTH_ERROR";
          userMessage = "Authentication failed with Luma API. Please check API key configuration.";
        } else if (status === 429) {
          errorCode = "LUMA_QUOTA_EXCEEDED";
          userMessage = "Luma API quota exceeded. Please try again later.";
        } else if (status === 400) {
          errorCode = "LUMA_VALIDATION_ERROR";
          userMessage = parsed?.detail || parsed?.message || "Invalid request to Luma API.";
        } else if (status >= 500) {
          errorCode = "LUMA_SERVER_ERROR";
          userMessage = "Luma API server error. Please try again later.";
        }
      }

      await logError({
        route: "/luma-create-scene",
        method: "POST",
        status: 502,
        code: errorCode,
        message: lumaResult.error || "Luma API call failed",
        correlationId,
        userId: user.id,
        safeContext: { payloadPreview: { ...providerBody, keyframes: undefined } },
      });

      return new Response(
        JSON.stringify({
          error: {
            code: errorCode,
            message: userMessage,
            detail: lumaResult.lumaError?.parsed || lumaResult.error,
            correlationId,
            upstream: lumaResult.lumaError
              ? { endpoint: "Luma API", status: lumaResult.lumaError.status, bodySnippet: lumaResult.lumaError.body?.substring?.(0, 200) }
              : undefined,
          },
          ok: false,
        }),
        { status: 502, headers: responseHeaders }
      );
    }

    // Store Luma job id
    const { error: updateError } = await supabase
      .from("scenes")
      .update({ luma_job_id: lumaResult.data.id, status: "processing", luma_status: "processing" })
      .eq("id", scene.id);
    if (updateError) console.error(`[${correlationId}] Failed to update scene with Luma job ID:`, updateError);

    console.log(`[${correlationId}] Scene created successfully: ${scene.id}, Luma job: ${lumaResult.data.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: { sceneId: scene.id, lumaJobId: lumaResult.data.id, status: "processing", idempotencyKey: idemKey },
        ok: true,
      }),
      { status: 200, headers: responseHeaders }
    );
  } catch (error) {
    await logError({
      route: "/luma-create-scene",
      method: "POST",
      status: 500,
      code: "INTERNAL_ERROR",
      message: (error as Error).message,
      correlationId,
    });

    console.error(`[${correlationId}] Unexpected error:`, error);
    return new Response(
      JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Internal server error", correlationId }, ok: false }),
      { status: 500, headers: responseHeaders }
    );
  }
});
