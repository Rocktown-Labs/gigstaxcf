import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import createMessageObjectSchema from "stoker/openapi/schemas/create-message-object";

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(
      createMessageObjectSchema("Server is healthy"),
      "Server is healthy"
    ),
  },
});

export const apiRoutes = new OpenAPIHono({ defaultHook }).openapi(
  healthRoute,
  (c) => c.json({ message: "Server is healthy" }, HttpStatusCodes.OK)
);
