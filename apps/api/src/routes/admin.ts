import { Router } from "express";
import { Queue } from "bullmq";

// ✅ new bull-board imports
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

const queues = [
  new Queue("portrait", {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
  }),
];

createBullBoard({
  queues: queues.map((q) => new BullMQAdapter(q)),
  serverAdapter,
});

export const admin = Router();
admin.use("/admin/queues", serverAdapter.getRouter());
