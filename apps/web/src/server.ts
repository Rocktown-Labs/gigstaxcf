import handler from "@tanstack/react-start/server-entry";
import { createAxiomDrain } from "evlog/axiom";
import { initWorkersLogger, withEvlog } from "evlog/workers";

initWorkersLogger({ env: { service: "gigstaxcf-web" } });

export default withEvlog((request) => handler.fetch(request), {
  drain: createAxiomDrain(),
});
