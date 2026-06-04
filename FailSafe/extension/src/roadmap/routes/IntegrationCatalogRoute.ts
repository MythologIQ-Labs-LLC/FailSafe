import { Request, Response } from 'express';
import {
  INTEGRATION_CATALOG,
  buildIntegrationCatalog,
  catalogConfigKeys,
} from '../../integrations/catalog/integration-catalog';

/**
 * IntegrationCatalogRoute — backs the Integrations-tab "Catalog" sub-view (GH
 * #167). Surfaces the command/config integrations that lack a dedicated sub-view
 * (Continue, Aider, OpenHands, Cline/Roo/Kilo, Linear, Jira, GitHub Checks,
 * Sentry, Teams, Slack) with their enabled/configured state + a configure hint.
 *
 *   GET /api/v1/integrations/catalog → { integrations: IntegrationStatus[] }
 *
 * SECRET SAFETY: the host dep returns a BOOLEAN-ONLY snapshot (each catalog key
 * → on/non-empty). No token, key, or webhook value reaches this route, the wire,
 * or the browser — only the derived booleans. When the dep is unwired the route
 * returns every integration as `disabled` rather than 503, so the tab still
 * renders the catalog (the operator sees what exists + how to enable it).
 */
export interface IntegrationCatalogRouteDeps {
  /**
   * Returns a boolean-only snapshot keyed by `failsafe.*` setting path: `true`
   * when the setting is on (enabled key) or non-empty (required/secret key).
   * The set of keys requested is `catalogConfigKeys()`. Absent → all-false.
   */
  getIntegrationConfigSnapshot?: () => Record<string, boolean>;
}

export const IntegrationCatalogRoute = {
  catalog(_req: Request, res: Response, deps: IntegrationCatalogRouteDeps): void {
    let snapshot: Record<string, boolean> = {};
    try {
      snapshot = deps.getIntegrationConfigSnapshot?.() ?? {};
    } catch {
      // A faulty config read must not break the catalog render — degrade to
      // all-disabled so the operator still sees the integration list.
      snapshot = {};
    }
    res.json({
      integrations: buildIntegrationCatalog(snapshot, INTEGRATION_CATALOG),
    });
  },

  /** The `failsafe.*` keys the host must include in the snapshot (helper for
   *  bootstrap wiring + tests). */
  configKeys(): string[] {
    return catalogConfigKeys();
  },
};
