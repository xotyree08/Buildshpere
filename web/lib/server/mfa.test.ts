/**
 * The only way to know an authenticator app will agree with this code is to
 * check it against the RFCs' own vectors. Everything else — enrolment, storage,
 * recovery — is ordinary, but a wrong HOTP would lock every user out of their
 * own account and look perfectly reasonable doing it.
 */

import { describe, expect, it } from "vitest";

import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  hotp,
  normalizeRecoveryCode,
  otpauthUrl,
  RECOVERY_CODE_COUNT,
  totp,
  TOTP_STEP_SECONDS,
  verifyTotp,
} from "./mfa";

/** RFC 4226 Appendix D uses this ASCII secret for every vector. */
const RFC_KEY = Buffer.from("12345678901234567890", "ascii");

describe("HOTP against RFC 4226 Appendix D", () => {
  const VECTORS = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];

  it.each(VECTORS.map((code, counter) => [counter, code] as const))(
    "counter %i produces %s",
    (counter, expected) => {
      expect(hotp(RFC_KEY, counter)).toBe(expected);
    },
  );
});

describe("TOTP against RFC 6238 Appendix B", () => {
  // The RFC's 8-digit SHA-1 vectors. Time is the counter, so these pin the
  // step arithmetic as well as the HMAC.
  const VECTORS: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ];

  it.each(VECTORS)("t=%i produces %s", (seconds, expected) => {
    const secret = base32Encode(RFC_KEY);
    expect(totp(secret, seconds * 1000, 8)).toBe(expected);
  });
});

describe("base32", () => {
  it("round-trips arbitrary bytes", () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("ignores spaces and case, the way a person types a secret", () => {
    const secret = base32Encode(RFC_KEY);
    const messy = secret.toLowerCase().replace(/(.{4})/g, "$1 ");
    expect(base32Decode(messy).equals(base32Decode(secret))).toBe(true);
  });

  it("generates a 160-bit secret", () => {
    expect(base32Decode(generateSecret())).toHaveLength(20);
  });
});

describe("verifying a code", () => {
  const secret = base32Encode(RFC_KEY);
  const now = 1_700_000_000_000;

  it("accepts the current code", () => {
    expect(verifyTotp(secret, totp(secret, now), now)).toBe(true);
  });

  it("accepts one step either side, because clocks drift", () => {
    const step = TOTP_STEP_SECONDS * 1000;
    expect(verifyTotp(secret, totp(secret, now - step), now)).toBe(true);
    expect(verifyTotp(secret, totp(secret, now + step), now)).toBe(true);
  });

  it("rejects a code two steps old", () => {
    const step = TOTP_STEP_SECONDS * 1000;
    expect(verifyTotp(secret, totp(secret, now - step * 2), now)).toBe(false);
  });

  it("rejects the wrong code, and malformed input", () => {
    expect(verifyTotp(secret, "000000", now)).toBe(false);
    expect(verifyTotp(secret, "", now)).toBe(false);
    expect(verifyTotp(secret, "12345", now)).toBe(false);
    expect(verifyTotp(secret, "not-a-code", now)).toBe(false);
  });

  it("tolerates spaces in what the user typed", () => {
    const code = totp(secret, now);
    expect(verifyTotp(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(true);
  });
});

describe("the otpauth URI", () => {
  it("carries what an authenticator needs, and escapes the label", () => {
    const url = otpauthUrl("someone@example.com", "ABCDEFGH");
    expect(url.startsWith("otpauth://totp/")).toBe(true);
    expect(url).toContain(encodeURIComponent("BuildSphere:someone@example.com"));
    expect(url).toContain("secret=ABCDEFGH");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});

describe("recovery codes", () => {
  it("issues the expected number, all distinct", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
  });

  it("hashes the same however the user types it back", () => {
    const [code] = generateRecoveryCodes(1);
    expect(hashRecoveryCode(code.toLowerCase())).toBe(hashRecoveryCode(code));
    expect(hashRecoveryCode(code.replace("-", ""))).toBe(hashRecoveryCode(code));
    expect(hashRecoveryCode(` ${code} `)).toBe(hashRecoveryCode(code));
  });

  it("does not store the code itself", () => {
    const [code] = generateRecoveryCodes(1);
    const hash = hashRecoveryCode(code);
    expect(hash).not.toContain(normalizeRecoveryCode(code));
    expect(hash).toHaveLength(64);
  });
});
