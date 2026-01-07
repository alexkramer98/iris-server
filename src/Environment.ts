/* eslint-disable @typescript-eslint/no-magic-numbers -- environment defaults */
import { z } from "zod";

const Schema = z.object({
  API_PORT: z.coerce.number().default(49_189),
  CLIENT_PORT: z.coerce.number().default(49_190),
  WYOMING_WHISPER_HOST: z.string().default("127.0.0.1"),
  WYOMING_WHISPER_PORT: z.coerce.number().default(10_300),
  WYOMING_PIPER_HOST: z.string().default("127.0.0.1"),
  WYOMING_PIPER_PORT: z.coerce.number().default(10_200),
  SERVER_URL: z.string(),
});

export const environment = Schema.parse(process.env);
