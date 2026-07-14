import "dotenv/config";

import { upgradeRef5PlansToV12 } from "@workout/core/progression/ref5-protocol-upgrade";

const apply = process.argv.includes("--apply");

upgradeRef5PlansToV12({ dryRun: !apply })
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.totals.blockedPlans > 0 && apply) process.exitCode = 2;
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
