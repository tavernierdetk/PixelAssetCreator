// apps/api/src/index.ts
import "dotenv/config";
import { createApp } from "./app.js";

if (process.env.NODE_ENV !== "test") {
  const app = createApp();
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`API http://localhost:${port}`);
  });
}
