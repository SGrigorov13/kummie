import {
  ApiError,
  CategoryList,
  GroupList,
  ProductDetail,
  ProductList,
  ProductListQuery,
  ProductSlugParams,
} from "@kummie/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { CatalogueRepository } from "../catalogue/repository";

/** Short public caching: the catalogue changes when staff publish, not per request. */
const CACHE = "public, max-age=60";

/** Public, read-only catalogue. Only published products are visible. */
export function catalogueRoutes(repo: CatalogueRepository): FastifyPluginAsyncZod {
  return async (app) => {
    app.get("/catalogue/categories", { schema: { response: { 200: CategoryList } } }, async (_req, reply) => {
      reply.header("cache-control", CACHE);
      return { items: await repo.listCategories() };
    });

    app.get("/catalogue/groups", { schema: { response: { 200: GroupList } } }, async (_req, reply) => {
      reply.header("cache-control", CACHE);
      return { items: await repo.listGroups() };
    });

    app.get(
      "/catalogue/products",
      { schema: { querystring: ProductListQuery, response: { 200: ProductList } } },
      async (request, reply) => {
        const filters = request.query;
        const { items, total } = await repo.listProducts(filters);
        reply.header("cache-control", CACHE);
        return { items, total, page: filters.page, pageSize: filters.pageSize };
      },
    );

    app.get(
      "/catalogue/products/:slug",
      { schema: { params: ProductSlugParams, response: { 200: ProductDetail, 404: ApiError } } },
      async (request, reply) => {
        const product = await repo.getProduct(request.params.slug);
        if (!product) {
          return reply.code(404).send({ error: "not_found", message: "Product not found" });
        }
        reply.header("cache-control", CACHE);
        return product;
      },
    );
  };
}
