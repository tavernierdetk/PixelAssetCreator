import OpenAI from "openai";
import { createLogger } from "@pixelart/log";

const log = createLogger("@adapters/openai");

export function makeOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    log.error("OPENAI_API_KEY is missing");
    throw new Error("OPENAI_API_KEY is not set");
  }
  const baseURL = process.env.OPENAI_BASE_URL; // optional (Azure/proxy)
  const organization = process.env.OPENAI_ORG; // optional
  const project = process.env.OPENAI_PROJECT;  // optional

  const client = new OpenAI({ apiKey, baseURL, organization, project, timeout: 180000 });
  log.debug({ baseURL, organization, project }, "OpenAI client initialized");
  return client;
}
