import { describe, expect, it } from "vitest";

import {
  buildPhotorealPrompt,
  extractImageUrl,
  PHOTOREAL_UNCONFIGURED,
  renderPhotoreal,
  type PhotorealFetch,
} from "./photoreal";

const ENV = { REPLICATE_API_TOKEN: "r8_test" };
const CAPTURE = "data:image/jpeg;base64,aGVsbG8=";

function fetchStub(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown; bytes?: Buffer }): PhotorealFetch {
  return async (url, init) => {
    const res = handler(url, init);
    return {
      status: res.status,
      json: async () => res.body ?? {},
      arrayBuffer: async () => {
        const b = res.bytes ?? Buffer.alloc(0);
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
    };
  };
}

describe("photoreal rendering (Replicate provider)", () => {
  it("prompt pins the geometry and carries the real materials", () => {
    const prompt = buildPhotorealPrompt("Craftsman", ["Fiber Cement siding", "Cedar Shake roof"]);
    expect(prompt).toContain("Craftsman");
    expect(prompt).toContain("exactly as shown");
    expect(prompt).toContain("Fiber Cement siding, Cedar Shake roof");
    expect(buildPhotorealPrompt("Modern", [])).not.toContain("Materials:");
  });

  it("extracts the image URL from string or array outputs, null otherwise", () => {
    expect(extractImageUrl("https://x/img.jpg")).toBe("https://x/img.jpg");
    expect(extractImageUrl(["https://x/a.jpg", "https://x/b.jpg"])).toBe("https://x/a.jpg");
    expect(extractImageUrl({ nested: true })).toBeNull();
    expect(extractImageUrl("not-a-url")).toBeNull();
  });

  it("refuses loudly without a token", async () => {
    const res = await renderPhotoreal({}, fetchStub(() => ({ status: 200 })), { imageDataUrl: CAPTURE, prompt: "p" });
    expect(res).toEqual({ ok: false, error: PHOTOREAL_UNCONFIGURED });
  });

  it("happy path: waits on the prediction, downloads the bytes, returns a data URL", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const res = await renderPhotoreal(
      ENV,
      fetchStub((url, init) => {
        calls.push({ url, init });
        if (url.includes("/predictions")) {
          return { status: 201, body: { status: "succeeded", output: ["https://delivery/img.jpg"] } };
        }
        return { status: 200, bytes: Buffer.from("JPEGBYTES") };
      }),
      { imageDataUrl: CAPTURE, prompt: "make it real" },
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.imageDataUrl).toBe(`data:image/jpeg;base64,${Buffer.from("JPEGBYTES").toString("base64")}`);
    }
    expect(calls[0].url).toContain("google/nano-banana");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer r8_test");
    expect(headers.prefer).toContain("wait");
    const sent = JSON.parse(String(calls[0].init?.body)) as { input: { prompt: string; image_input: string[] } };
    expect(sent.input.prompt).toBe("make it real");
    expect(sent.input.image_input).toEqual([CAPTURE]);
  });

  it("surfaces token, billing, and model failures as their own honest messages", async () => {
    const unauthorized = await renderPhotoreal(ENV, fetchStub(() => ({ status: 401, body: {} })), {
      imageDataUrl: CAPTURE,
      prompt: "p",
    });
    expect(unauthorized).toMatchObject({ ok: false, error: expect.stringContaining("REPLICATE_API_TOKEN") });

    const broke = await renderPhotoreal(ENV, fetchStub(() => ({ status: 402, body: {} })), {
      imageDataUrl: CAPTURE,
      prompt: "p",
    });
    expect(broke).toMatchObject({ ok: false, error: expect.stringContaining("billing") });

    const failed = await renderPhotoreal(
      ENV,
      fetchStub(() => ({ status: 201, body: { status: "failed", error: "NSFW detected" } })),
      { imageDataUrl: CAPTURE, prompt: "p" },
    );
    expect(failed).toMatchObject({ ok: false, error: expect.stringContaining("NSFW") });
  });

  it("honors a model override in the env", async () => {
    let hit = "";
    await renderPhotoreal(
      { ...ENV, REPLICATE_MODEL: "custom/model" },
      fetchStub((url) => {
        if (!hit) hit = url;
        return { status: 201, body: { status: "succeeded", output: "https://d/i.jpg" } };
      }),
      { imageDataUrl: CAPTURE, prompt: "p" },
    );
    expect(hit).toContain("custom/model");
  });
});
