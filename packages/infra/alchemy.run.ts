import * as Alchemy from "alchemy";
import * as Axiom from "alchemy/Axiom";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Planetscale from "alchemy/Planetscale";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import "varlock/auto-load";

const managedDatabase = Effect.gen(function* managedDatabase() {
  const database = yield* Planetscale.PostgresDatabase("database", {
    clusterSize: "PS_DEV",
    migrations: "../../packages/db/src/migrations",
  });
  const role = yield* Planetscale.PostgresRole("database-role", {
    database,
    inheritedRoles: ["pg_read_all_data", "pg_write_all_data"],
  });
  const runtimeUrl = role.connectionUrlPooled;

  return {
    runtimeEnv: { DATABASE_URL: runtimeUrl },
  };
});

export const databaseEnv = managedDatabase.pipe(
  Effect.map(({ runtimeEnv }) => runtimeEnv)
);

export const databaseBindings = {
  DATABASE_URL: databaseEnv.pipe(
    Effect.map(({ DATABASE_URL }) => DATABASE_URL)
  ),
};

export const databaseProviders = Layer.mergeAll(Planetscale.providers());

export const mediaBucket = Cloudflare.R2.Bucket("media");

// Cloudflare Workflow hosted by the server worker (see
// apps/server/src/lib/workflows/process-extraction.ts).
export const processExtractionWorkflow = Cloudflare.Workflow(
  "process-extraction",
  { className: "ProcessExtractionWorkflow" }
);

export const observability = Effect.gen(function* observability() {
  const { stage } = yield* Alchemy.Stack;
  const datasetName = `gigstaxcf-${stage}-logs`;

  const dataset = yield* Axiom.Dataset("logs", {
    description: "gigstaxcf application logs",
    kind: "axiom:events:v1",
    name: datasetName,
  });
  const ingest = yield* Axiom.ApiToken("logs-ingest", {
    datasetCapabilities: {
      [datasetName]: {
        ingest: ["create"],
      },
    },
    name: `gigstaxcf-${stage}-logs-ingest`,
  });

  return {
    dataset,
    runtimeEnv: {
      AXIOM_API_KEY: ingest.token,
      AXIOM_DATASET: dataset.name,
      AXIOM_EDGE_URL: dataset.edgeDeploymentUrl,
    },
  };
});

export const observabilityEnv = observability.pipe(
  Effect.map(({ runtimeEnv }) => runtimeEnv)
);

export const observabilityBindings = {
  AXIOM_API_KEY: observabilityEnv.pipe(
    Effect.map(({ AXIOM_API_KEY }) => AXIOM_API_KEY)
  ),
  AXIOM_DATASET: observabilityEnv.pipe(
    Effect.map(({ AXIOM_DATASET }) => AXIOM_DATASET)
  ),
  AXIOM_EDGE_URL: observabilityEnv.pipe(
    Effect.map(({ AXIOM_EDGE_URL }) => AXIOM_EDGE_URL)
  ),
};

export const server = Cloudflare.Worker("gigstax-server", {
  compatibility: {
    flags: ["nodejs_compat"],
  },
  dev: {
    port: 3000,
  },
  env: {
    ...databaseBindings,
    ADMIN_EMAILS: Config.String("ADMIN_EMAILS").pipe(Config.withDefault("")),
    AI_INPUT_COST_PER_1M: Config.String("AI_INPUT_COST_PER_1M").pipe(
      Config.withDefault("")
    ),
    AI_OUTPUT_COST_PER_1M: Config.String("AI_OUTPUT_COST_PER_1M").pipe(
      Config.withDefault("")
    ),
    BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Cloudflare.Worker.URL,
    BLOB_PRIVATE_READ_WRITE_TOKEN: Config.String(
      "BLOB_PRIVATE_READ_WRITE_TOKEN"
    ).pipe(Config.withDefault("")),
    BLOB_READ_WRITE_TOKEN: Config.String("BLOB_READ_WRITE_TOKEN").pipe(
      Config.withDefault("")
    ),
    CORS_ORIGIN: Config.String("CORS_ORIGIN"),
    CRON_SECRET: Config.String("CRON_SECRET").pipe(Config.withDefault("")),
    EMAIL_UNSUBSCRIBE_SECRET: Config.String("EMAIL_UNSUBSCRIBE_SECRET").pipe(
      Config.withDefault("")
    ),
    GOOGLE_CLIENT_ID: Config.String("GOOGLE_CLIENT_ID").pipe(
      Config.withDefault("")
    ),
    GOOGLE_CLIENT_SECRET: Config.String("GOOGLE_CLIENT_SECRET").pipe(
      Config.withDefault("")
    ),
    GOOGLE_GENERATIVE_AI_API_KEY: Config.String(
      "GOOGLE_GENERATIVE_AI_API_KEY"
    ).pipe(Config.withDefault("")),
    MEDIA: mediaBucket,
    NEXT_PUBLIC_APP_URL: Config.String("NEXT_PUBLIC_APP_URL").pipe(
      Config.withDefault("")
    ),
    NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY: Config.String(
      "NEXT_PUBLIC_RADAR_PUBLISHABLE_KEY"
    ).pipe(Config.withDefault("")),
    NEXT_PUBLIC_SITE_URL: Config.String("NEXT_PUBLIC_SITE_URL").pipe(
      Config.withDefault("")
    ),
    POLAR_ACCESS_TOKEN: Config.Redacted("POLAR_ACCESS_TOKEN"),
    POLAR_AI_EXTRACT_METER_ID: Config.String("POLAR_AI_EXTRACT_METER_ID").pipe(
      Config.withDefault("")
    ),
    POLAR_BULK_UPLOAD_METER_ID: Config.String(
      "POLAR_BULK_UPLOAD_METER_ID"
    ).pipe(Config.withDefault("")),
    POLAR_DRIVER_MONTHLY_PRODUCT_ID: Config.String(
      "POLAR_DRIVER_MONTHLY_PRODUCT_ID"
    ).pipe(Config.withDefault("")),
    POLAR_DRIVER_YEARLY_PRODUCT_ID: Config.String(
      "POLAR_DRIVER_YEARLY_PRODUCT_ID"
    ).pipe(Config.withDefault("")),
    POLAR_ORGANIZATION_ID: Config.String("POLAR_ORGANIZATION_ID").pipe(
      Config.withDefault("")
    ),
    POLAR_PRO_DRIVER_MONTHLY_PRODUCT_ID: Config.String(
      "POLAR_PRO_DRIVER_MONTHLY_PRODUCT_ID"
    ).pipe(Config.withDefault("")),
    POLAR_PRO_DRIVER_YEARLY_PRODUCT_ID: Config.String(
      "POLAR_PRO_DRIVER_YEARLY_PRODUCT_ID"
    ).pipe(Config.withDefault("")),
    POLAR_PRO_MONTHLY_PRODUCT_ID: Config.String(
      "POLAR_PRO_MONTHLY_PRODUCT_ID"
    ).pipe(Config.withDefault("")),
    POLAR_PRO_YEARLY_PRODUCT_ID: Config.String(
      "POLAR_PRO_YEARLY_PRODUCT_ID"
    ).pipe(Config.withDefault("")),
    POLAR_SERVER: Config.String("POLAR_SERVER").pipe(Config.withDefault("")),
    POLAR_STARTER_MONTHLY_PRODUCT_ID: Config.String(
      "POLAR_STARTER_MONTHLY_PRODUCT_ID"
    ).pipe(Config.withDefault("")),
    POLAR_SUCCESS_URL: Config.String("POLAR_SUCCESS_URL"),
    PROCESS_EXTRACTION: processExtractionWorkflow,
    RADAR_SERVER_KEY: Config.String("RADAR_SERVER_KEY").pipe(
      Config.withDefault("")
    ),
    RESEND_API_KEY: Config.String("RESEND_API_KEY").pipe(
      Config.withDefault("")
    ),
    RESEND_FROM_LIFECYCLE: Config.String("RESEND_FROM_LIFECYCLE").pipe(
      Config.withDefault("")
    ),
    RESEND_FROM_TRANSACTIONAL: Config.String("RESEND_FROM_TRANSACTIONAL").pipe(
      Config.withDefault("")
    ),
    RESEND_WEBHOOK_SECRET: Config.String("RESEND_WEBHOOK_SECRET").pipe(
      Config.withDefault("")
    ),
    SITE_URL: Config.String("SITE_URL").pipe(Config.withDefault("")),
    ...observabilityBindings,
  },
  main: "../../apps/server/src/index.ts",
});

export type ServerEnv = Cloudflare.InferEnv<typeof server>;

export default Alchemy.Stack(
  "gigstaxcf",
  {
    providers: Layer.mergeAll(
      Cloudflare.providers(),
      databaseProviders,
      Axiom.providers()
    ),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const observabilityResources = yield* observability;
    const serverWorker = yield* server;
    const webWorker = yield* Cloudflare.Website.Vite("gigstax-web", {
      compatibility: {
        flags: ["nodejs_compat"],
      },
      dev: {
        port: 3001,
      },
      env: {
        ...observabilityBindings,
        VITE_RADAR_PUBLISHABLE_KEY: Config.String(
          "VITE_RADAR_PUBLISHABLE_KEY"
        ).pipe(Config.withDefault("")),
        VITE_SERVER_URL: serverWorker.url.as<string>(),
      },
      rootDir: "../../apps/web",
    });

    return {
      axiomDataset: observabilityResources.dataset.name,
      server: serverWorker.url,
      web: webWorker.url,
    };
  })
);
