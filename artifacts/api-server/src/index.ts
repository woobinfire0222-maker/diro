import app from "./app";
import { initDiscordBot } from "./lib/discord.js";

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

app.listen(port, (err) => {
  if (err) {
    console.error("Error listening on port:", err);
    process.exit(1);
  }

  console.log(`[${new Date().toISOString()}] Server listening on port ${port}`);

  // Initialize Discord bot for interaction handling (approve/reject buttons)
  try {
    initDiscordBot();
  } catch (e) {
    console.warn("Discord bot initialization skipped:", e);
  }
});
