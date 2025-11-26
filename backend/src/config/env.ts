import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

loadEnv({
  path: process.env.NODE_ENV === 'production' ? '.env' : '.env.local',
})

const envSchema = z.object({
  PORT: z.coerce.number().min(1).max(65535).default(4000),
  CLIENT_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  MULTIPLAYER_TICK_RATE: z.coerce.number().min(1).max(120).default(30),
})

export const env = envSchema.parse({
  PORT: process.env.PORT,
  CLIENT_ORIGINS: process.env.CLIENT_ORIGINS,
  MULTIPLAYER_TICK_RATE: process.env.MULTIPLAYER_TICK_RATE,
})
