import { Queue } from "bullmq";

const connection = { connection: { url: process.env.REDIS_URL || "redis://localhost:6379" } };

export const portraitQ = new Queue("portrait", connection);
export const pixelQ = new Queue("pixel", connection);
export const animsQ = new Queue("anims", connection);
export const exportQ = new Queue("export", connection);
export const idleQ = new Queue("idle", connection);
export const ulpcQ = new Queue("ulpc", connection);

