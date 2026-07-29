import "./load-env";

import { runSeed } from "@workout/core/db/seed";

runSeed({
  shouldHardReset: process.env.WORKOUT_SEED_RESET_ALL === "1",
  includeDemoPlans: process.env.WORKOUT_SEED_INCLUDE_DEMO_PLANS === "1",
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
