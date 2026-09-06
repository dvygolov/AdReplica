import { isPermissionDeniedGraphError } from "../utils/graph-errors.mjs";

/** AccountContextService. Dependencies are supplied by the application composition root. */
export class AccountContextService {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.fetchAdAccountBusiness = this.fetchAdAccountBusiness.bind(this);
    this.fetchBusinessCatalogs = this.fetchBusinessCatalogs.bind(this);
    this.fetchEligibleCatalogsForAccount =
      this.fetchEligibleCatalogsForAccount.bind(this);
    this.mergeCatalogLists = this.mergeCatalogLists.bind(this);
    this.fetchAccountContext = this.fetchAccountContext.bind(this);
    this.invalidateAccountContextCache =
      this.invalidateAccountContextCache.bind(this);
  }

  async fetchAdAccountBusiness(accountId) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    try {
      const account = await graphFetch(`act_${normalizedAccountId}`, {
        query: {
          fields: [
            "id",
            "name",
            "business{id,name}",
            "owner_business{id,name}",
          ].join(","),
        },
      });
      const business = account.business || null;
      if (business?.id) {
        return {
          id: String(business.id),
          name: business.name || business.id,
          source: "business",
        };
      }
      const ownerBusiness = account.owner_business || null;
      if (ownerBusiness?.id) {
        return {
          id: String(ownerBusiness.id),
          name: ownerBusiness.name || ownerBusiness.id,
          source: "owner_business",
        };
      }
      log(
        "info",
        `No Business Manager is visible on act_${normalizedAccountId}; catalog campaign clone/import will be blocked for this target.`,
      );
      return null;
    } catch (error) {
      const level = isPermissionDeniedGraphError(error) ? "info" : "warn";
      log(
        level,
        `Business lookup failed for act_${normalizedAccountId}; treating it as no visible Business Manager for catalog checks.`,
        String(error),
      );
      return null;
    }
  }

  async fetchBusinessCatalogs(businessId) {
    const { log } = this.dependencies.logging;
    const { graphGetAll } = this.dependencies.graphClient;
    if (!businessId) {
      return [];
    }
    const catalogMap = new Map();
    const edges = ["owned_product_catalogs", "client_product_catalogs"];
    for (const edge of edges) {
      try {
        const rows = await graphGetAll(`${businessId}/${edge}`, {
          fields: "id,name,vertical,product_count,business",
        });
        for (const row of rows) {
          const id = String(row.id || "");
          if (!id) continue;
          catalogMap.set(id, {
            id,
            name: row.name || id,
            vertical: row.vertical || "",
            productCount: row.product_count ?? null,
            edge,
          });
        }
      } catch (error) {
        const level = isPermissionDeniedGraphError(error) ? "info" : "warn";
        log(
          level,
          `Catalog lookup failed on ${edge} for business ${businessId}.`,
          String(error),
        );
      }
    }
    return [...catalogMap.values()].sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id, "ru"),
    );
  }

  async fetchEligibleCatalogsForAccount(accountId) {
    const { log } = this.dependencies.logging;
    const { graphFetch } = this.dependencies.graphClient;
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (!normalizedAccountId) {
      return [];
    }
    try {
      const result = await graphFetch(
        `act_${normalizedAccountId}/dpa_eligible_product_catalogs`,
        {
          query: {
            fields: "id,name,vertical,product_count",
            limit: 100,
            request_source: "PRODUCT_EXTENSIONS_ELIGIBILITY_CHECK",
          },
        },
      );
      return (result.data || [])
        .map((row) => {
          const id = String(row?.id || "");
          if (!id) {
            return null;
          }
          return {
            id,
            name: row.name || id,
            vertical: row.vertical || "",
            productCount: row.product_count ?? null,
            edge: "dpa_eligible_product_catalogs",
          };
        })
        .filter(Boolean)
        .sort((left, right) =>
          (left.name || left.id).localeCompare(right.name || right.id, "ru"),
        );
    } catch (error) {
      const level = isPermissionDeniedGraphError(error) ? "info" : "warn";
      log(
        level,
        `Eligible catalog lookup failed for act_${normalizedAccountId}.`,
        String(error),
      );
      return [];
    }
  }

  mergeCatalogLists(primaryCatalogs = [], secondaryCatalogs = []) {
    const catalogMap = new Map();
    for (const row of [
      ...(primaryCatalogs || []),
      ...(secondaryCatalogs || []),
    ]) {
      const id = String(row?.id || "");
      if (!id) {
        continue;
      }
      if (!catalogMap.has(id)) {
        catalogMap.set(id, {
          id,
          name: row.name || id,
          vertical: row.vertical || "",
          productCount: row.productCount ?? row.product_count ?? null,
          edge: row.edge || "",
        });
        continue;
      }
      const existing = catalogMap.get(id);
      if (!existing.name && row.name) {
        existing.name = row.name;
      }
      if (!existing.vertical && row.vertical) {
        existing.vertical = row.vertical;
      }
      if (
        (existing.productCount === null ||
          existing.productCount === undefined) &&
        row.productCount !== null &&
        row.productCount !== undefined
      ) {
        existing.productCount = row.productCount;
      }
      if (!existing.edge && row.edge) {
        existing.edge = row.edge;
      } else if (row.edge && !String(existing.edge || "").includes(row.edge)) {
        existing.edge = `${existing.edge},${row.edge}`;
      }
    }
    return [...catalogMap.values()].sort((left, right) =>
      (left.name || left.id).localeCompare(right.name || right.id, "ru"),
    );
  }

  async fetchAccountContext(accountId) {
    const { state } = this.dependencies;
    const { log } = this.dependencies.logging;
    const { graphGetAll, graphPageGetAll } = this.dependencies.graphClient;
    const {
      fetchAdAccountBusiness,
      fetchBusinessCatalogs,
      fetchEligibleCatalogsForAccount,
      mergeCatalogLists,
    } = this;
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (state.accountContextCache[normalizedAccountId]) {
      return state.accountContextCache[normalizedAccountId];
    }

    if (!Array.isArray(state.accessiblePagesCache)) {
      try {
        const allPages = await graphPageGetAll("me/accounts", {
          type: "page",
          fields: "id,name,is_published,access_token",
        });
        const pageMap = new Map();
        for (const page of allPages) {
          const pageId = String(page.id);
          pageMap.set(pageId, {
            id: pageId,
            name: page.name || pageId,
            instagramId: "",
            accessToken: page.access_token || "",
          });
        }
        state.accessiblePagesCache = [...pageMap.values()].sort((left, right) =>
          left.name.localeCompare(right.name, "ru"),
        );
        log(
          "info",
          `Loaded ${state.accessiblePagesCache.length} accessible pages from me/accounts.`,
        );
      } catch (error) {
        state.accessiblePagesCache = [];
        log("warn", "Page account lookup failed.", String(error));
      }
    }

    const pixels = await graphGetAll(`act_${normalizedAccountId}/adspixels`, {
      fields: "id,name",
    });
    const business = await fetchAdAccountBusiness(normalizedAccountId);
    const businessCatalogs = await fetchBusinessCatalogs(business?.id || "");
    const eligibleCatalogs =
      await fetchEligibleCatalogsForAccount(normalizedAccountId);
    const catalogs = mergeCatalogLists(businessCatalogs, eligibleCatalogs);
    if (eligibleCatalogs.length > businessCatalogs.length) {
      log(
        "info",
        `Expanded target catalog list for act_${normalizedAccountId} via dpa_eligible_product_catalogs: ${businessCatalogs.length} -> ${catalogs.length}.`,
      );
    }
    const context = {
      pages: state.accessiblePagesCache,
      pixels: pixels.map((pixel) => ({
        id: String(pixel.id),
        name: pixel.name || pixel.id,
      })),
      business,
      catalogs,
    };
    state.accountContextCache[normalizedAccountId] = context;
    return context;
  }

  invalidateAccountContextCache(accountId) {
    const { state } = this.dependencies;
    const normalizedAccountId = String(accountId || "").replace(/^act_/, "");
    if (normalizedAccountId) {
      delete state.accountContextCache[normalizedAccountId];
    }
  }
}
