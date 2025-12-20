import Redis from "ioredis";
import { config } from "./config";

export const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
