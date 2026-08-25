import { describe, expect, it } from "vitest";

import { AgentError } from "../lib/agent/errors";
import { FAILURES, failure, failureFromError, type FailureCode } from "../lib/agent/failures";

describe("failure taxonomy", () => {
  it("exposes a complete, self-consistent catalog", () => {
    for (const [code, state] of Object.entries(FAILURES)) {
      expect(state.code).toBe(code); // key matches its code
      expect(state.message.length).toBeGreaterThan(0);
      expect(state.recovery.length).toBeGreaterThan(0);
      expect(state.category).toMatch(/^[a-z_]+\.[a-z_]+$/); // stable redacted category
      expect(typeof state.retrySafe).toBe("boolean");
      expect(typeof state.needsConfirmation).toBe("boolean");
    }
  });

  it("maps structured provider errors to the right normalized state", () => {
    const cases: Array<[AgentError, FailureCode, boolean]> = [
      [new AgentError("x", "auth"), "credential_rejected", false],
      [new AgentError("x", "rate_limit"), "rate_limited", true],
      [new AgentError("x", "quota"), "quota_exhausted", false],
      [new AgentError("x", "network"), "network_unavailable", true],
      [new AgentError("x", "timeout"), "timeout", true],
      [new AgentError("x", "server"), "provider_error", true],
      [new AgentError("x", "aborted"), "cancelled", false],
    ];
    for (const [error, code, retrySafe] of cases) {
      const state = failureFromError(error);
      expect(state.code).toBe(code);
      expect(state.retrySafe).toBe(retrySafe);
    }
  });

  it("maps an abort to cancelled and unknown values to unknown", () => {
    expect(failureFromError(new DOMException("Aborted", "AbortError")).code).toBe("cancelled");
    expect(failureFromError(new Error("boom")).code).toBe("unknown");
    expect(failureFromError("nope").code).toBe("unknown");
  });

  it("never surfaces the raw error text (only the safe taxonomy message)", () => {
    const state = failureFromError(new AgentError("sk-secret-1234567890 leaked", "auth"));
    expect(state.message).not.toContain("sk-secret");
    expect(state.message).toBe(failure("credential_rejected").message);
  });

  it("marks quota/credential/no-provider as not retry-safe and needing user action", () => {
    for (const code of ["quota_exhausted", "credential_rejected", "no_provider"] as FailureCode[]) {
      expect(failure(code).retrySafe).toBe(false);
      expect(failure(code).needsConfirmation).toBe(true);
    }
  });
});
