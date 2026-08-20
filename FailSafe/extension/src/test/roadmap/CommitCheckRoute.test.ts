// FX907 (#83 Phase A) — GET /api/v1/governance/commit-check. Written FIRST
// per TDD. The pre-commit hook parses the JSON body with grep and runs curl
// with -sf, so BLOCK verdicts must be HTTP 200 (a 4xx fails open) — T10 pins
// the status explicitly.
import { describe, it, beforeEach } from "mocha";
import { strict as assert } from "assert";
import { registerCommitCheckRoute } from "../../roadmap/routes/CommitCheckRoute";

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

interface Captured {
  status: number;
  body: Record<string, unknown> | null;
}

function makeApp(): { app: { get: (p: string, h: Handler) => void }; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  return { app: { get: (p: string, h: Handler) => handlers.set(p, h) }, handlers };
}

function makeRes(): { res: Record<string, unknown>; captured: Captured } {
  const captured: Captured = { status: 200, body: null };
  const res: Record<string, unknown> = {
    status(code: number) {
      captured.status = code;
      return res;
    },
    json(body: Record<string, unknown>) {
      captured.body = body;
    },
  };
  return { res, captured };
}

function makeDeps(opts: {
  tokenValid: boolean;
  mode: string;
  activeIntent: Record<string, unknown> | null;
}) {
  return {
    validateCommitToken: (_t: string) => opts.tokenValid,
    buildHubSnapshot: async () => ({
      governanceModeState: { mode: opts.mode },
      activeIntent: opts.activeIntent,
    }),
  };
}

async function invoke(
  deps: ReturnType<typeof makeDeps>,
  token: string | undefined,
): Promise<Captured> {
  const { app, handlers } = makeApp();
  registerCommitCheckRoute(app as never, deps as never);
  const handler = handlers.get("/api/v1/governance/commit-check");
  assert.ok(handler, "route must register at the hook's exact path");
  const { res, captured } = makeRes();
  await handler!({ header: (_n: string) => token, headers: { "x-failsafe-token": token } }, res);
  return captured;
}

describe("CommitCheckRoute (FX907/#83A)", () => {
  let deps: ReturnType<typeof makeDeps>;

  beforeEach(() => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: { id: "i1" } });
  });

  it("T7: missing/invalid token -> 401 allow:false; verdict logic never consulted", async () => {
    let hubCalls = 0;
    deps = makeDeps({ tokenValid: false, mode: "enforce", activeIntent: null });
    const inner = deps.buildHubSnapshot;
    deps.buildHubSnapshot = async () => {
      hubCalls++;
      return inner();
    };
    const out = await invoke(deps, "wrong");
    assert.equal(out.status, 401);
    assert.equal(out.body?.allow, false);
    assert.equal(hubCalls, 0, "token gate must precede any verdict work");
  });

  it("T8: valid token + observe mode -> 200 allow:true", async () => {
    deps = makeDeps({ tokenValid: true, mode: "observe", activeIntent: null });
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200);
    assert.equal(out.body?.allow, true);
  });

  it("T9: valid token + enforce + active intent -> 200 allow:true", async () => {
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200);
    assert.equal(out.body?.allow, true);
  });

  it("T10: valid token + enforce + NO active intent -> HTTP 200 + allow:false with reason", async () => {
    deps = makeDeps({ tokenValid: true, mode: "enforce", activeIntent: null });
    const out = await invoke(deps, "t");
    assert.equal(out.status, 200, "block verdicts MUST be 2xx — curl -sf fails open on 4xx");
    assert.equal(out.body?.allow, false);
    assert.ok(
      typeof out.body?.reason === "string" && (out.body.reason as string).length > 0,
      "reason must be present for the hook's reason parser",
    );
  });
});
