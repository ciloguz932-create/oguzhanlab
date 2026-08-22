import { afterEach, describe, expect, it, vi } from "vitest";

import { GITHUB_INTEGRATION, EMAIL_INTEGRATION, getIntegrationDef, integrationForToolId, mergeIntegrations, seedIntegrations, validateIntegrationToken } from "../lib/agent/integrations";
import { executeWebFetch, htmlToText } from "../lib/agent/tools";

afterEach(() => vi.unstubAllGlobals());

describe("integration registry", () => {
  it("seeds every known integration as disconnected", () => {
    const seeded = seedIntegrations();
    expect(seeded.map((config) => config.id).sort()).toEqual(["email", "github"]);
    expect(seeded.every((config) => !config.connected && !config.enabled)).toBe(true);
  });

  it("resolves a tool id to its owning integration", () => {
    expect(integrationForToolId("github.read_file")?.id).toBe("github");
    expect(integrationForToolId("email.send")?.id).toBe("email");
    expect(integrationForToolId("web.fetch")).toBeUndefined();
  });

  it("merges new integrations while preserving existing config", () => {
    const existing = [{ id: "github" as const, enabled: true, connected: true, createdAt: "t" }];
    const merged = mergeIntegrations(existing);
    expect(merged).toHaveLength(2);
    expect(merged.find((config) => config.id === "github")?.connected).toBe(true);
  });

  it("assigns sensible risk to write vs read tools", () => {
    expect(getIntegrationDef("github")?.tools.find((tool) => tool.id === "github.read_file")?.risk).toBe("medium");
    expect(getIntegrationDef("github")?.tools.find((tool) => tool.id === "github.create_issue")?.risk).toBe("high");
    expect(getIntegrationDef("email")?.tools.find((tool) => tool.id === "email.send")?.risk).toBe("high");
  });
});

describe("github integration execution", () => {
  it("returns a clear error when no token is configured", async () => {
    const result = await GITHUB_INTEGRATION.execute("github.get_repo", { owner: "a", repo: "b" }, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("bağlı değil");
  });

  it("shapes a search request and parses results", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push(url);
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      return new Response(JSON.stringify({ items: [{ full_name: "torvalds/linux", description: "kernel", stargazers_count: 5, html_url: "https://github.com/torvalds/linux" }] }), { status: 200 });
    }));
    const result = await GITHUB_INTEGRATION.execute("github.search_repositories", { query: "linux" }, "tok");
    expect(result.ok).toBe(true);
    expect(result.content).toContain("torvalds/linux");
    expect(seen[0]).toContain("/search/repositories?q=linux");
  });

  it("decodes base64 file content and does not leak the token on auth failure", async () => {
    const base64 = Buffer.from("# Başlık", "utf8").toString("base64");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: base64, encoding: "base64", size: 8 }), { status: 200 })));
    const ok = await GITHUB_INTEGRATION.execute("github.read_file", { owner: "a", repo: "b", path: "README.md" }, "tok");
    expect(ok.ok).toBe(true);
    expect(ok.content).toContain("# Başlık");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const denied = await GITHUB_INTEGRATION.execute("github.get_repo", { owner: "a", repo: "b" }, "secret-token");
    expect(denied.ok).toBe(false);
    expect(denied.error).not.toContain("secret-token");
  });

  it("validates a github token via /user", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await validateIntegrationToken("github", "tok")).ok).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    expect((await validateIntegrationToken("github", "bad")).ok).toBe(false);
  });
});

describe("email integration execution", () => {
  it("requires all fields and posts to Resend", async () => {
    const missing = await EMAIL_INTEGRATION.execute("email.send", { from: "a@b.com" }, "re_key");
    expect(missing.ok).toBe(false);

    let payload: any;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.resend.com/emails");
      payload = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
    }));
    const sent = await EMAIL_INTEGRATION.execute("email.send", { from: "a@b.com", to: "c@d.com", subject: "Selam", text: "gövde" }, "re_key");
    expect(sent.ok).toBe(true);
    expect(payload).toEqual({ from: "a@b.com", to: ["c@d.com"], subject: "Selam", text: "gövde" });
  });
});

describe("web.fetch and html extraction", () => {
  it("extracts readable text and drops scripts/styles", () => {
    const html = "<html><head><style>.x{color:red}</style><script>bad()</script></head><body><h1>Başlık</h1><p>Merhaba &amp; hoş geldin</p></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("Başlık");
    expect(text).toContain("Merhaba & hoş geldin");
    expect(text).not.toContain("bad()");
    expect(text).not.toContain("color:red");
  });

  it("fetches over https, converts html to text, and blocks unsafe urls", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<p>Hello world</p>", { status: 200, headers: { "content-type": "text/html" } })));
    const result = await executeWebFetch("https://example.com/page");
    expect(result.ok).toBe(true);
    expect(result.content).toContain("Hello world");

    await expect(executeWebFetch("http://localhost/secret")).rejects.toBeTruthy();
  });
});
