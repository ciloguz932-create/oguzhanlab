import { describe, expect, it } from "vitest";

import { runAgentLoop, type OrchestratorDeps } from "../lib/agent/orchestrator";
import { BUILTIN_SKILLS, makeCustomSkill, mergeBuiltInSkills, scoreSkill, seedSkills, selectSkills, skillModelRequirement } from "../lib/agent/skills";
import type { Skill } from "../lib/agent/types";

describe("skill selection", () => {
  it("scores by keyword hits and selects the most relevant enabled skills", () => {
    const skills = seedSkills();
    const selected = selectSkills(skills, "Python öğrenme kaynaklarını internette araştır ve markdown dosyasına kaydet");
    const ids = selected.map((skill) => skill.id);
    expect(ids).toContain("skill.research"); // araştır, internet
    expect(ids).toContain("skill.writer"); // markdown, dosya, kaydet
    expect(selected.length).toBeLessThanOrEqual(3);
  });

  it("excludes disabled skills and skills with no keyword hit", () => {
    const skills = seedSkills().map((skill) => (skill.id === "skill.research" ? { ...skill, enabled: false } : skill));
    const selected = selectSkills(skills, "internette güncel haberleri araştır");
    expect(selected.find((skill) => skill.id === "skill.research")).toBeUndefined();
    expect(selectSkills(skills, "merhaba nasılsın")).toHaveLength(0);
  });

  it("honors the limit and orders by score", () => {
    const skills = seedSkills();
    // Instruction hits research heavily and writer once → research should rank first.
    const selected = selectSkills(skills, "araştır araştırma kaynak internet web markdown", 2);
    expect(selected).toHaveLength(2);
    expect(selected[0].id).toBe("skill.research");
  });

  it("resolves the strongest model requirement across active skills", () => {
    const fast: Skill = { ...BUILTIN_SKILLS[0], modelRequirement: "fast" };
    const reasoning: Skill = { ...BUILTIN_SKILLS[1], modelRequirement: "reasoning" };
    expect(skillModelRequirement([fast, reasoning])).toBe("reasoning");
    expect(skillModelRequirement([{ ...BUILTIN_SKILLS[0], modelRequirement: undefined }])).toBeUndefined();
  });

  it("scoreSkill counts each matching keyword once", () => {
    expect(scoreSkill(BUILTIN_SKILLS[3], "bu bir bütçe analizi, oran ve yüzde hesabı")).toBeGreaterThanOrEqual(3);
  });
});

describe("skill registry maintenance", () => {
  it("merges newly shipped built-ins while preserving user choices", () => {
    const stored = [{ ...BUILTIN_SKILLS[0], enabled: false }];
    const merged = mergeBuiltInSkills(stored);
    expect(merged).toHaveLength(BUILTIN_SKILLS.length);
    expect(merged.find((skill) => skill.id === "skill.research")?.enabled).toBe(false); // choice preserved
  });

  it("builds a custom skill with safe defaults", () => {
    const skill = makeCustomSkill({ name: "  ", instructions: "davran", keywords: ["  A ", "b"] });
    expect(skill.builtin).toBe(false);
    expect(skill.enabled).toBe(true);
    expect(skill.name).toBe("Özel Yetenek");
    expect(skill.keywords).toEqual(["a", "b"]);
  });
});

describe("orchestrator skill injection", () => {
  it("injects active skill instructions into the system prompt", async () => {
    let systemPrompt = "";
    const deps: OrchestratorDeps = {
      callModel: async (messages) => { systemPrompt = messages[0].content; return '{"action":"final","content":"ok"}'; },
      runTool: async () => ({ ok: true, content: "" }),
      checkPermission: () => "allow",
      emit: () => undefined,
    };
    await runAgentLoop(deps, {
      goal: "x",
      tools: [],
      skills: [{ name: "Derin Araştırma", instructions: "Kaynakları çapraz doğrula." }],
      signal: new AbortController().signal,
    });
    expect(systemPrompt).toContain("AKTİF YETENEKLER");
    expect(systemPrompt).toContain("Derin Araştırma");
    expect(systemPrompt).toContain("Kaynakları çapraz doğrula.");
  });
});
