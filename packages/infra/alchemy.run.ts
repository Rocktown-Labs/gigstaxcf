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

export const server = Cloudflare.Worker("server", {
  compatibility: {
    flags: ["nodejs_compat"],
  },
  dev: {
    port: 3000,
  },
  env: {
    ...databaseBindings,
    BETTER_AUTH_SECRET: Config.Redacted("BETTER_AUTH_SECRET"),
    BETTER_AUTH_URL: Cloudflare.Worker.URL,
    CORS_ORIGIN: Config.String("CORS_ORIGIN"),
    POLAR_ACCESS_TOKEN: Config.Redacted("POLAR_ACCESS_TOKEN"),
    POLAR_SUCCESS_URL: Config.String("POLAR_SUCCESS_URL"),
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
    const webWorker = yield* Cloudflare.Website.Vite("web", {
      compatibility: {
        flags: ["nodejs_compat"],
      },
      dev: {
        port: 3001,
      },
      env: {
        ...observabilityBindings,
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
