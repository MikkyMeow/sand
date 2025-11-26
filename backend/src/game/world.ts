import { randomUUID } from 'node:crypto'

export type Vector3 = {
  x: number
  y: number
  z: number
}

export type PlayerSnapshot = {
  id: string
  position: Vector3
  rotationY: number
  health: number
}

type PlayerState = PlayerSnapshot & {
  lastUpdate: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export class WorldState {
  private readonly players = new Map<string, PlayerState>()
  private readonly arenaRadius = 9

  addPlayer() {
    const id = randomUUID()
    const spawnPosition: Vector3 = {
      x: clamp((Math.random() - 0.5) * this.arenaRadius * 2, -this.arenaRadius, this.arenaRadius),
      y: 0.3,
      z: clamp((Math.random() - 0.5) * this.arenaRadius * 2, -this.arenaRadius, this.arenaRadius),
    }

    const snapshot: PlayerState = {
      id,
      position: spawnPosition,
      rotationY: 0,
      health: 100,
      lastUpdate: Date.now(),
    }

    this.players.set(id, snapshot)
    return snapshot
  }

  updatePlayer(id: string, payload: Partial<PlayerSnapshot>) {
    const current = this.players.get(id)
    if (!current) {
      return null
    }

    if (payload.position) {
      current.position = {
        x: clamp(payload.position.x, -this.arenaRadius, this.arenaRadius),
        y: clamp(payload.position.y, -2, 5),
        z: clamp(payload.position.z, -this.arenaRadius, this.arenaRadius),
      }
    }

    if (typeof payload.rotationY === 'number') {
      current.rotationY = payload.rotationY
    }

    if (typeof payload.health === 'number') {
      current.health = clamp(payload.health, 0, 100)
    }

    current.lastUpdate = Date.now()
    this.players.set(id, current)
    return current
  }

  removePlayer(id: string) {
    this.players.delete(id)
  }

  serialize() {
    return {
      updatedAt: Date.now(),
      players: Array.from(this.players.values()).map<PlayerSnapshot>(
        ({ lastUpdate, ...rest }) => rest,
      ),
    }
  }
}
