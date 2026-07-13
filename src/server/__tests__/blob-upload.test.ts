import { describe, it, expect, vi } from "vitest";

// Mock @vercel/blob with a PLAIN function (not vi.fn) whose behavior we swap per
// test via a hoisted mutable ref. A tinyspy spy records call results and, for a
// rejecting async impl, leaves a floating rejected promise that trips vitest's
// unhandled-rejection guard — the repo's own tests (placement-lifecycle) use
// hand-rolled function mocks for exactly this reason.
const ref = vi.hoisted(() => ({
  put: (async () => ({ pathname: "", url: "" })) as (...a: unknown[]) => Promise<{
    pathname: string;
    url: string;
  }>,
}));
vi.mock("@vercel/blob", () => ({ put: (...a: unknown[]) => ref.put(...a) }));

import { uploadPrivateFile, UploadFailedError } from "@/server/blob-upload";

const file = () =>
  new File([Buffer.from("hello world")], "cv.pdf", { type: "application/pdf" });

describe("uploadPrivateFile", () => {
  it("returns pathname/url/original-size on success", async () => {
    ref.put = async () => ({ pathname: "resumes/abc/cv-x.pdf", url: "https://blob/x" });
    const res = await uploadPrivateFile("resumes/abc/cv.pdf", file());
    expect(res).toEqual({
      pathname: "resumes/abc/cv-x.pdf",
      url: "https://blob/x",
      size: "hello world".length, // pre-gzip original bytes
    });
  });

  it("wraps a Blob put() failure as UploadFailedError (not a raw throw)", async () => {
    ref.put = async () => {
      throw new Error("No token found");
    };
    let caught: unknown;
    try {
      await uploadPrivateFile("resumes/abc/cv.pdf", file());
    } catch (e) {
      caught = e;
    }
    // The callers' friendly-error path keys on `instanceof UploadFailedError`,
    // so this is the contract that must hold — not the raw error.
    expect(caught instanceof UploadFailedError).toBe(true);
  });
});
