import { describe, expect, it } from "vitest";
import {
  DnsResolutionError,
  SSRFError,
  decodeNumericIPv4,
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateOrReservedHost,
  validateTargetHost,
} from "../src/ssrf-guard.js";

describe("isPrivateIPv4", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "10.255.255.255",
    "127.0.0.1",
    "127.255.255.255",
    "169.254.169.254", // AWS / GCP metadata
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1", // CGNAT
    "224.0.0.1", // multicast
    "255.255.255.255", // broadcast
  ])("flags %s as private/reserved", (addr) => {
    expect(isPrivateIPv4(addr)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "172.32.0.1", "100.63.255.255", "100.128.0.1"])(
    "passes %s as public",
    (addr) => {
      expect(isPrivateIPv4(addr)).toBe(false);
    },
  );

  it("returns false for malformed inputs", () => {
    expect(isPrivateIPv4("not an ip")).toBe(false);
    expect(isPrivateIPv4("999.0.0.0")).toBe(false);
    expect(isPrivateIPv4("10.0.0")).toBe(false);
  });
});

describe("isPrivateIPv6", () => {
  it.each(["::1", "::", "fe80::1", "fc00::1", "fd00::1", "ff02::1"])(
    "flags %s as private/reserved",
    (addr) => {
      expect(isPrivateIPv6(addr)).toBe(true);
    },
  );

  it.each(["2001:4860:4860::8888", "2606:4700:4700::1111"])(
    "passes %s as public",
    (addr) => {
      expect(isPrivateIPv6(addr)).toBe(false);
    },
  );

  it("unwraps IPv4-mapped IPv6 and delegates to v4 check", () => {
    expect(isPrivateIPv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIPv6("::ffff:10.0.0.5")).toBe(true);
    expect(isPrivateIPv6("::ffff:8.8.8.8")).toBe(false);
  });
});

describe("isPrivateOrReservedHost", () => {
  it.each([
    ["localhost", /reserved hostname/],
    ["LOCALHOST", /reserved hostname/],
    ["ip6-localhost", /reserved hostname/],
    ["0", /reserved hostname/],
    ["foo.local", /reserved TLD/],
    ["server.internal", /reserved TLD/],
    ["aws.arpa", /reserved TLD/],
    ["host.lan", /reserved TLD/],
    ["127.0.0.1", /private .* IPv4/],
    ["10.0.0.1", /private .* IPv4/],
    ["169.254.169.254", /private .* IPv4/],
    ["::1", /private .* IPv6/],
  ])("rejects %s", (host, pattern) => {
    const reason = isPrivateOrReservedHost(host);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(pattern as RegExp);
  });

  it.each(["example.com", "www.google.com", "1.1.1.1", "8.8.8.8"])(
    "accepts %s",
    (host) => {
      expect(isPrivateOrReservedHost(host)).toBeNull();
    },
  );

  it("handles empty / falsy input", () => {
    expect(isPrivateOrReservedHost("")).toMatch(/empty hostname/);
  });
});

describe("validateTargetHost", () => {
  it("throws SSRFError synchronously when string check trips", async () => {
    await expect(validateTargetHost("localhost")).rejects.toThrow(SSRFError);
    await expect(validateTargetHost("169.254.169.254")).rejects.toThrow(/IPv4 range/);
  });

  it("passes through for literal public IPs without DNS lookup", async () => {
    // No resolver supplied; the function must short-circuit for literal IPs.
    await expect(validateTargetHost("1.1.1.1")).resolves.toBeUndefined();
  });

  it("throws when DNS resolves to a private IP (rebinding mitigation)", async () => {
    const resolver = {
      resolve4: async () => ["10.0.0.5"],
      resolve6: async () => {
        throw new Error("no AAAA");
      },
    };
    await expect(
      validateTargetHost("evil.example.com", { resolver }),
    ).rejects.toThrow(/resolves to private v4 address 10\.0\.0\.5/);
  });

  it("throws when ALL records are private (even if only v6 is reachable)", async () => {
    const resolver = {
      resolve4: async () => {
        throw new Error("no A");
      },
      resolve6: async () => ["fd00::1"],
    };
    await expect(
      validateTargetHost("internal.ipv6.example", { resolver }),
    ).rejects.toThrow(/v6/);
  });

  it("passes when DNS resolves to a public IP", async () => {
    const resolver = {
      resolve4: async () => ["93.184.216.34"],
      resolve6: async () => {
        throw new Error("no AAAA");
      },
    };
    await expect(
      validateTargetHost("example.com", { resolver }),
    ).resolves.toBeUndefined();
  });

  it("throws DnsResolutionError (NOT SSRFError) on ENOTFOUND", async () => {
    // A typo shouldn't look like an attack. Host code can distinguish the
    // two error classes to log appropriately.
    const resolver = {
      resolve4: async () => {
        throw new Error("ENOTFOUND");
      },
      resolve6: async () => {
        throw new Error("ENOTFOUND");
      },
    };
    await expect(
      validateTargetHost("nonexistent.example", { resolver }),
    ).rejects.toBeInstanceOf(DnsResolutionError);
    await expect(
      validateTargetHost("nonexistent.example", { resolver }),
    ).rejects.not.toBeInstanceOf(SSRFError);
  });

  it("blocks even when one record is public but another is private", async () => {
    // Conservative: if ANY resolved address is private, we refuse. Prevents
    // the "mixed record" DNS rebinding variant.
    const resolver = {
      resolve4: async () => ["8.8.8.8", "10.0.0.5"],
      resolve6: async () => {
        throw new Error("no AAAA");
      },
    };
    await expect(
      validateTargetHost("mixed.example.com", { resolver }),
    ).rejects.toThrow(/10\.0\.0\.5/);
  });

  it("blocks when v4 is public but v6 resolves to a private ULA", async () => {
    const resolver = {
      resolve4: async () => ["8.8.8.8"],
      resolve6: async () => ["fd00::1"],
    };
    await expect(
      validateTargetHost("mixed-family.example", { resolver }),
    ).rejects.toThrow(/fd00::1/);
  });
});

describe("decodeNumericIPv4", () => {
  it("decodes integer-packed form", () => {
    expect(decodeNumericIPv4("2130706433")).toBe("127.0.0.1");
    expect(decodeNumericIPv4("0")).toBe("0.0.0.0");
    expect(decodeNumericIPv4("4294967295")).toBe("255.255.255.255");
  });

  it("decodes hex form", () => {
    expect(decodeNumericIPv4("0x7f000001")).toBe("127.0.0.1");
    expect(decodeNumericIPv4("0xC0A80001")).toBe("192.168.0.1");
  });

  it("returns null for non-numeric hostnames", () => {
    expect(decodeNumericIPv4("example.com")).toBeNull();
    expect(decodeNumericIPv4("1.2.3.4")).toBeNull(); // dotted-quad goes through isPrivateIPv4 directly
    expect(decodeNumericIPv4("127")).toBe("0.0.0.127"); // pure numeric, decodes
    expect(decodeNumericIPv4("")).toBeNull();
  });

  it("rejects out-of-range values", () => {
    expect(decodeNumericIPv4("4294967296")).toBeNull(); // > max uint32
    expect(decodeNumericIPv4("-1")).toBeNull();
  });
});

describe("isPrivateOrReservedHost — numeric encoding bypass protection", () => {
  it("rejects integer-packed 127.0.0.1", () => {
    expect(isPrivateOrReservedHost("2130706433")).toMatch(/IPv4/);
  });

  it("rejects hex-encoded 127.0.0.1", () => {
    expect(isPrivateOrReservedHost("0x7f000001")).toMatch(/IPv4/);
  });

  it("rejects integer-packed AWS metadata IP", () => {
    // Use arithmetic (not <<) to avoid JS signed-int32 overflow on 169.x.x.x.
    const metadataAsInt = String(169 * 16777216 + 254 * 65536 + 169 * 256 + 254);
    expect(isPrivateOrReservedHost(metadataAsInt)).toMatch(/IPv4/);
  });

  it("rejects public numeric-encoded IPs as ambiguous", () => {
    // 8.8.8.8 as integer — rejected even though it's public, because numeric
    // encoding is a deniability smell and legit callers should pass dotted-quad.
    expect(isPrivateOrReservedHost("134744072")).toMatch(/ambiguous numeric-encoded/);
  });
});
