import { afterEach, describe, expect, it, vi } from "vitest";

import { executeWebExtractLinks, extractLinks } from "../lib/agent/tools";

afterEach(() => vi.unstubAllGlobals());

describe("link extraction", () => {
  it("resolves relative and absolute links, drops non-http and fragments", () => {
    const html = `
      <a href="/about">Hakkında</a>
      <a href="https://other.com/x">Other</a>
      <a href="mailto:a@b.com">Mail</a>
      <a href="#top">Top</a>
      <a href="page2?q=1">Devam</a>
    `;
    const links = extractLinks(html, "https://example.com/dir/");
    const urls = links.map((l) => l.url);
    expect(urls).toContain("https://example.com/about");
    expect(urls).toContain("https://other.com/x");
    expect(urls).toContain("https://example.com/dir/page2?q=1");
    expect(urls.some((u) => u.startsWith("mailto:"))).toBe(false);
    expect(links.find((l) => l.url === "https://example.com/about")?.text).toBe("Hakkında");
  });

  it("dedupes links ignoring fragments and respects the limit", () => {
    const html = '<a href="/a#one">A1</a><a href="/a#two">A2</a><a href="/b">B</a>';
    const links = extractLinks(html, "https://e.com");
    expect(links.map((l) => l.url)).toEqual(["https://e.com/a", "https://e.com/b"]);
    const many = Array.from({ length: 100 }, (_, i) => `<a href="/p${i}">P${i}</a>`).join("");
    expect(extractLinks(many, "https://e.com", 10)).toHaveLength(10);
  });
});

describe("executeWebExtractLinks", () => {
  it("fetches over https and returns navigable links", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('<a href="/next">Sonraki</a>', { status: 200 })));
    const result = await executeWebExtractLinks("https://example.com/");
    expect(result.ok).toBe(true);
    expect(result.content).toContain("https://example.com/next");
    expect(result.metadata?.count).toBe(1);
  });

  it("blocks unsafe (non-https / private) targets", async () => {
    await expect(executeWebExtractLinks("http://localhost/admin")).rejects.toBeTruthy();
    await expect(executeWebExtractLinks("https://127.0.0.1/")).rejects.toBeTruthy();
  });
});
