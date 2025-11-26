import Fastify from 'fastify'
import cors from '@fastify/cors'
import { Server } from 'socket.io'
import { z } from 'zod'
import { env } from './config/env'
import { WorldState } from './game/world'

const fastify = Fastify({
  logger: true,
})

const bootstrap = async () => {
  await fastify.register(cors, {
    origin: env.CLIENT_ORIGINS,
  })

  fastify.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
  }))

  const io = new Server(fastify.server, {
    cors: {
      origin: env.CLIENT_ORIGINS,
    },
  })

  const world = new WorldState()

  const playerUpdateSchema = z.object({
    position: z
      .object({
        x: z.number(),
        y: z.number(),
        z: z.number(),
      })
      .optional(),
    rotationY: z.number().optional(),
    health: z.number().optional(),
  })

  io.on('connection', (socket) => {
    const player = world.addPlayer()
    socket.emit('session:joined', { playerId: player.id, snapshot: world.serialize() })
    socket.broadcast.emit('world:state', world.serialize())

    socket.on('player:update', (rawPayload) => {
      const result = playerUpdateSchema.safeParse(rawPayload)
      if (!result.success) {
        socket.emit('player:update:error', {
          issues: result.error.issues,
        })
        return
      }

      world.updatePlayer(player.id, result.data)
    })

    socket.on('disconnect', () => {
      world.removePlayer(player.id)
      socket.broadcast.emit('player:left', { playerId: player.id })
    })
  })

  const tickIntervalMs = Math.round(1000 / env.MULTIPLAYER_TICK_RATE)
  setInterval(() => {
    io.emit('world:state', world.serialize())
  }, tickIntervalMs)

  fastify.addHook('onClose', (_, done) => {
    io.close()
    done()
  })

  await fastify.listen({ port: env.PORT, host: '0.0.0.0' })
  fastify.log.info(
    `Multiplayer server ready on port ${env.PORT} • tick=${env.MULTIPLAYER_TICK_RATE}hz`,
  )
}

bootstrap().catch((error) => {
  fastify.log.error(error)
  process.exit(1)
})
