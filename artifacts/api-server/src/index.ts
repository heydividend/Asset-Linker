import app from "./app";
import { logger } from "./lib/logger";
import {
  recoverStuckStudyGroupRounds,
  startStudyGroupStaleSweeper,
} from "./routes/studyGroup";
import { startReminderScheduler } from "./lib/reminderScheduler";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  try {
    const recovered = await recoverStuckStudyGroupRounds();
    if (recovered > 0) {
      logger.info(
        { recovered },
        "Recovered stuck study group rounds from previous run",
      );
    }
  } catch (err) {
    logger.error({ err }, "Failed to recover stuck study group rounds");
  }

  startStudyGroupStaleSweeper((err) =>
    logger.error({ err }, "Stale study group round sweep failed"),
  );

  startReminderScheduler((err) =>
    logger.error({ err }, "Daily reminder tick failed"),
  );

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

start();
