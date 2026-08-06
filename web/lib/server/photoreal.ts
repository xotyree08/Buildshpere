/**
 * Photoreal exterior stills via Replicate (the ModelSphere render-provider
 * seam's first external provider). The deterministic 3D view is the input:
 * the image model re-renders the SAME geometry and materials as an
 * architectural photograph — it restyles, it never redesigns (ADR-007:
 * geometry only ever comes from the engines). Unconfigured deployments
 * refuse with the exact fix (L4); the UI labels results honestly (L8).
 */

export interface PhotorealEnv {
  REPLICATE_API_TOKEN?: string;
  /** Override the image model; must accept nano-banana-style inputs. */
  REPLICATE_MODEL?: string;
}

export const PHOTOREAL_UNCONFIGURED =
  "Photoreal rendering is not configured — set REPLICATE_API_TOKEN (replicate.com → Account → API tokens) and redeploy. The 3D viewer keeps working either way.";

const DEFAULT_MODEL = "google/nano-banana";

/** The instruction the image model gets alongside the 3D capture. */
export function buildPhotorealPrompt(styleLabel: string, materialLabels: string[]): string {
  const materials = materialLabels.length > 0 ? ` Materials: ${materialLabels.join(", ")}.` : "";
  return (
    `Professional exterior architectural photograph of this exact ${styleLabel} house. ` +
    `Keep the building's geometry, proportions, window and door placement, and roof form exactly as shown.${materials} ` +
    `Golden-hour daylight, landscaped yard, photorealistic textures, high-end real-estate photography, no people, no text.`
  );
}

export interface PhotorealFetch {
  (url: string, init?: RequestInit): Promise<{
    status: number;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>;
}

/** First image URL in a prediction output, whatever shape the model uses. */
export function extractImageUrl(output: unknown): string | null {
  if (typeof output === "string" && output.startsWith("http")) return output;
  if (Array.isArray(output)) {
    const first = output.find((o) => typeof o === "string" && o.startsWith("http"));
    return (first as string) ?? null;
  }
  return null;
}

export async function renderPhotoreal(
  env: PhotorealEnv,
  fetchFn: PhotorealFetch,
  opts: { imageDataUrl: string; prompt: string },
): Promise<{ ok: true; imageDataUrl: string } | { ok: false; error: string }> {
  if (!env.REPLICATE_API_TOKEN) return { ok: false, error: PHOTOREAL_UNCONFIGURED };
  const model = env.REPLICATE_MODEL || DEFAULT_MODEL;
  try {
    const res = await fetchFn(`https://api.replicate.com/v1/models/${model}/predictions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
        "content-type": "application/json",
        // Hold the connection until the prediction finishes (or times out).
        prefer: "wait=55",
      },
      body: JSON.stringify({
        input: {
          prompt: opts.prompt,
          image_input: [opts.imageDataUrl],
          output_format: "jpg",
        },
      }),
    });
    const prediction = (await res.json()) as {
      status?: string;
      output?: unknown;
      error?: string | null;
      detail?: string;
    };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: "Replicate rejected the API token — check REPLICATE_API_TOKEN in the deployment env." };
    }
    if (res.status === 402) {
      return { ok: false, error: "Replicate reports no credit on the account — add billing at replicate.com." };
    }
    const imageUrl = extractImageUrl(prediction.output);
    if (prediction.status !== "succeeded" || !imageUrl) {
      return {
        ok: false,
        error:
          prediction.error?.toString().slice(0, 200) ??
          prediction.detail?.slice(0, 200) ??
          `The render did not finish (status: ${prediction.status ?? res.status}). Try again.`,
      };
    }
    // Replicate delivery URLs expire — fetch the bytes and hand back a
    // self-contained image the customer can keep.
    const image = await fetchFn(imageUrl);
    if (image.status !== 200) return { ok: false, error: "The finished render could not be downloaded — try again." };
    const b64 = Buffer.from(await image.arrayBuffer()).toString("base64");
    return { ok: true, imageDataUrl: `data:image/jpeg;base64,${b64}` };
  } catch {
    return { ok: false, error: "Could not reach the render service — try again in a moment." };
  }
}
