import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import * as HttpStatusCodes from "stoker/http-status-codes";
import defaultHook from "stoker/openapi/default-hook";
import jsonContent from "stoker/openapi/helpers/json-content";
import createMessageObjectSchema from "stoker/openapi/schemas/create-message-object";

import { adminRoutes } from "./admin";
import { analyzeRoutes } from "./analyze";
import { bulkAnalyzeRoutes } from "./bulk-analyze";
import { cronRoutes } from "./cron";
import { dashboardRoutes } from "./dashboard";
import { deliveriesRoutes } from "./deliveries";
import { emailPreferencesRoutes } from "./email-preferences";
import { entriesRoutes } from "./entries";
import { entriesExtrasRoutes } from "./entries-extras";
import { expensesRoutes } from "./expenses";
import { goalsRoutes } from "./goals";
import { mediaRoutes } from "./media";
import { platformsRoutes } from "./platforms";
import { publicUnsubscribeRoutes } from "./public-unsubscribe";
import { stubsRoutes } from "./stubs";
import { userRoutes } from "./user";
import { webhooksResendRoutes } from "./webhooks-resend";

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

export const apiRoutes = new OpenAPIHono({ defaultHook })
  .openapi(healthRoute, (c) =>
    c.json({ message: "Server is healthy" }, HttpStatusCodes.OK)
  )
  // Static /entries/* paths are mounted before the /entries/{id} module so
  // they are never captured by the parameterized route.
  .route("/", entriesExtrasRoutes)
  .route("/", bulkAnalyzeRoutes)
  .route("/", expensesRoutes)
  .route("/", entriesRoutes)
  .route("/", analyzeRoutes)
  .route("/", goalsRoutes)
  .route("/", deliveriesRoutes)
  .route("/", dashboardRoutes)
  .route("/", userRoutes)
  .route("/", platformsRoutes)
  .route("/", mediaRoutes)
  .route("/", adminRoutes)
  .route("/", stubsRoutes)
  .route("/", emailPreferencesRoutes)
  .route("/", publicUnsubscribeRoutes)
  .route("/", webhooksResendRoutes)
  .route("/", cronRoutes);
