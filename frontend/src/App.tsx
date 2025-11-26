import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core'
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui'
import { io } from 'socket.io-client'
import './App.css'

const MULTIPLAYER_URL =
  import.meta.env.VITE_MULTIPLAYER_URL ?? 'http://localhost:4000'
const HERO_SIZE = 0.6
const HERO_HALF_HEIGHT = HERO_SIZE / 2
const MOVE_SPEED = 4
const GRAVITY = -12
const JUMP_SPEED = 6
type PlayerSnapshot = {
  id: string
  position: { x: number; y: number; z: number }
  rotationY: number
  health: number
}

type WorldSnapshot = {
  updatedAt: number
  players: PlayerSnapshot[]
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting')
  const [isTouchInterface, setIsTouchInterface] = useState(false)
  const [joystickOffset, setJoystickOffset] = useState({ x: 0, y: 0 })
  const [joystickEngaged, setJoystickEngaged] = useState(false)

  const networkStateRef = useRef(connectionState)
  networkStateRef.current = connectionState
  const movementVectorRef = useRef({ x: 0, z: 0 })
  const keyboardAxisRef = useRef({ x: 0, z: 0 })
  const joystickAxisRef = useRef({ x: 0, z: 0 })
  const jumpRequestRef = useRef(false)
  const joystickPointerIdRef = useRef<number | null>(null)
  const joystickBaseRef = useRef<HTMLDivElement | null>(null)
  const heroMeshRef = useRef<Mesh | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const remotePlayersRef = useRef(new Map<string, Mesh>())
  const remoteHeroMaterialRef = useRef<StandardMaterial | null>(null)
  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  const playerIdRef = useRef<string | null>(null)
  const pendingWorldSnapshotRef = useRef<PlayerSnapshot[] | null>(null)
  const lastSyncedStateRef = useRef({
    position: { x: 0, y: 0, z: 0 },
    rotationY: 0,
    timestamp: 0,
  })

  const recomputeMovementVector = useCallback(() => {
    const combinedX = keyboardAxisRef.current.x + joystickAxisRef.current.x
    const combinedZ = keyboardAxisRef.current.z + joystickAxisRef.current.z
    const length = Math.hypot(combinedX, combinedZ)

    if (length > 1) {
      movementVectorRef.current.x = combinedX / length
      movementVectorRef.current.z = combinedZ / length
      return
    }

    movementVectorRef.current.x = combinedX
    movementVectorRef.current.z = combinedZ
  }, [])

  const requestJump = useCallback(() => {
    jumpRequestRef.current = true
  }, [])

  const resetJoystick = useCallback(() => {
    joystickPointerIdRef.current = null
    joystickAxisRef.current.x = 0
    joystickAxisRef.current.z = 0
    setJoystickOffset({ x: 0, y: 0 })
    setJoystickEngaged(false)
    recomputeMovementVector()
  }, [recomputeMovementVector])

  const disposeRemotePlayer = useCallback((playerId: string) => {
    const mesh = remotePlayersRef.current.get(playerId)
    if (!mesh) {
      return
    }
    mesh.dispose()
    remotePlayersRef.current.delete(playerId)
  }, [])

  const syncRemotePlayers = useCallback(
    (players: PlayerSnapshot[]) => {
      const scene = sceneRef.current
      const remoteMaterial = remoteHeroMaterialRef.current
      if (!scene || !remoteMaterial) {
        pendingWorldSnapshotRef.current = players
        return
      }

      const remotePlayers = remotePlayersRef.current
      const activeIds = new Set<string>()

      players.forEach((player) => {
        if (player.id === playerIdRef.current) {
          return
        }

        activeIds.add(player.id)
        let mesh = remotePlayers.get(player.id)
        if (!mesh) {
          mesh = MeshBuilder.CreateBox(`remote-${player.id}`, { size: HERO_SIZE }, scene)
          mesh.material = remoteMaterial
          remotePlayers.set(player.id, mesh)
        }

        mesh.position.set(player.position.x, player.position.y, player.position.z)
        mesh.rotation.y = player.rotationY ?? 0
      })

      remotePlayers.forEach((mesh, id) => {
        if (!activeIds.has(id)) {
          mesh.dispose()
          remotePlayers.delete(id)
        }
      })
    },
    [],
  )

  const updateJoystickFromEvent = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const base = joystickBaseRef.current
      if (!base) {
        return
      }

      const rect = base.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const deltaX = event.clientX - centerX
      const deltaY = event.clientY - centerY
      const maxDistance = rect.width / 2

      let normalizedX = deltaX / maxDistance
      let normalizedY = deltaY / maxDistance
      const magnitude = Math.hypot(normalizedX, normalizedY)
      if (magnitude > 1) {
        normalizedX /= magnitude
        normalizedY /= magnitude
      }

      joystickAxisRef.current.x = normalizedX
      joystickAxisRef.current.z = -normalizedY
      setJoystickOffset({
        x: normalizedX * maxDistance,
        y: normalizedY * maxDistance,
      })
      setJoystickEngaged(true)
      recomputeMovementVector()
    },
    [recomputeMovementVector],
  )

  const handleJoystickPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerIdRef.current !== null) {
        return
      }

      event.preventDefault()
      joystickPointerIdRef.current = event.pointerId
      event.currentTarget.setPointerCapture(event.pointerId)
      updateJoystickFromEvent(event)
    },
    [updateJoystickFromEvent],
  )

  const handleJoystickPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== joystickPointerIdRef.current) {
        return
      }

      event.preventDefault()
      updateJoystickFromEvent(event)
    },
    [updateJoystickFromEvent],
  )

  const handleJoystickPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== joystickPointerIdRef.current) {
        return
      }

      event.preventDefault()
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Pointer capture might already be released — ignore.
      }
      resetJoystick()
    },
    [resetJoystick],
  )

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)')
    const updatePreference = () => {
      const hasTouch = navigator.maxTouchPoints > 0
      setIsTouchInterface(media.matches || hasTouch)
    }

    updatePreference()
    media.addEventListener('change', updatePreference)
    return () => media.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)
    sceneRef.current = scene
    scene.clearColor = Color3.FromHexString('#070b12').toColor4(1)

    const camera = new ArcRotateCamera(
      'camera',
      Math.PI / 4,
      Math.PI / 3,
      6,
      Vector3.Zero(),
      scene,
    )

    camera.lowerRadiusLimit = 2
    camera.upperRadiusLimit = 12
    camera.attachControl(canvas, true)

    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
    light.intensity = 0.9

    const arenaMaterial = new StandardMaterial('arenaMaterial', scene)
    arenaMaterial.diffuseColor = Color3.FromHexString('#243058')
    arenaMaterial.specularColor = Color3.Black()

    const arena = MeshBuilder.CreateGround(
      'arena',
      { width: 20, height: 20 },
      scene,
    )
    arena.material = arenaMaterial

    const heroMaterial = new StandardMaterial('heroMaterial', scene)
    heroMaterial.diffuseColor = Color3.FromHexString('#ffce6d')
    heroMaterial.emissiveColor = Color3.FromHexString('#99582a')

    const hero = MeshBuilder.CreateBox('hero', { size: HERO_SIZE }, scene)
    hero.material = heroMaterial
    hero.position.y = HERO_HALF_HEIGHT
    camera.setTarget(hero.position.clone())
    camera.lockedTarget = hero
    heroMeshRef.current = hero

    const remoteHeroMaterial = new StandardMaterial('remoteHeroMaterial', scene)
    remoteHeroMaterial.diffuseColor = Color3.FromHexString('#7dd3ff')
    remoteHeroMaterial.emissiveColor = Color3.FromHexString('#2563eb')
    remoteHeroMaterial.alpha = 0.95
    remoteHeroMaterialRef.current = remoteHeroMaterial
    remotePlayersRef.current = new Map()
    if (pendingWorldSnapshotRef.current) {
      const queued = pendingWorldSnapshotRef.current
      pendingWorldSnapshotRef.current = null
      syncRemotePlayers(queued)
    }

    const crosshair = MeshBuilder.CreateDisc(
      'crosshair',
      { radius: 0.1, tessellation: 16 },
      scene,
    )
    const crosshairMaterial = new StandardMaterial('crosshairMaterial', scene)
    crosshairMaterial.diffuseColor = Color3.FromHexString('#f25f5c')
    crosshairMaterial.alpha = 0.75
    crosshair.material = crosshairMaterial
    crosshair.position = new Vector3(0, hero.position.y + 1.2, 0)

    let verticalVelocity = 0
    scene.onBeforeRenderObservable.add(() => {
      const deltaSeconds = engine.getDeltaTime() / 1000

      const forward = camera.getForwardRay().direction
      forward.y = 0
      forward.normalize()
      const right = Vector3.Cross(Vector3.Up(), forward).normalize()

      const movement = movementVectorRef.current
      const hasMovement =
        Math.abs(movement.x) > 0.001 || Math.abs(movement.z) > 0.001

      if (hasMovement) {
        const direction = forward
          .scale(movement.z)
          .add(right.scale(movement.x))
        direction.normalize()
        hero.position.addInPlace(direction.scale(MOVE_SPEED * deltaSeconds))
        const heroYaw = Math.atan2(direction.x, direction.z)
        hero.rotation.y = heroYaw
      }

      verticalVelocity += GRAVITY * deltaSeconds
      const nextY = hero.position.y + verticalVelocity * deltaSeconds
      const isGrounded = nextY <= HERO_HALF_HEIGHT

      if (jumpRequestRef.current && isGrounded) {
        verticalVelocity = JUMP_SPEED
        jumpRequestRef.current = false
      }

      if (isGrounded && verticalVelocity <= 0) {
        hero.position.y = HERO_HALF_HEIGHT
        verticalVelocity = 0
      } else {
        hero.position.y = nextY
      }

      crosshair.position.copyFrom(hero.position)
      crosshair.position.y += 1.2
      camera.target.copyFrom(hero.position)

      const socket = socketRef.current
      if (socket && playerIdRef.current) {
        const now = performance.now()
        const lastState = lastSyncedStateRef.current
        const positionDelta =
          Math.abs(hero.position.x - lastState.position.x) +
          Math.abs(hero.position.y - lastState.position.y) +
          Math.abs(hero.position.z - lastState.position.z)
        const rotationDelta = Math.abs(hero.rotation.y - lastState.rotationY)
        if (now - lastState.timestamp > 50 || positionDelta > 0.01 || rotationDelta > 0.01) {
          lastState.position = {
            x: hero.position.x,
            y: hero.position.y,
            z: hero.position.z,
          }
          lastState.rotationY = hero.rotation.y
          lastState.timestamp = now
          socket.emit('player:update', {
            position: lastState.position,
            rotationY: lastState.rotationY,
          })
        }
      }
    })

    const ui = AdvancedDynamicTexture.CreateFullscreenUI('ui', true, scene)
    const statusText = new TextBlock()
    statusText.text = 'Preparing arena...'
    statusText.color = '#ffffff'
    statusText.fontSize = 18
    statusText.top = '-45%'
    ui.addControl(statusText)

    const handleResize = () => engine.resize()
    window.addEventListener('resize', handleResize)
    engine.runRenderLoop(() => {
      statusText.text = `Arena ready • ${networkStateRef.current}`
      scene.render()
    })

    return () => {
      window.removeEventListener('resize', handleResize)
      remotePlayersRef.current.forEach((mesh) => mesh.dispose())
      remotePlayersRef.current.clear()
      heroMeshRef.current = null
      remoteHeroMaterialRef.current = null
      sceneRef.current = null
      engine.dispose()
    }
  }, [syncRemotePlayers])

  useEffect(() => {
    const keyboardState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
    }

    const handleKeyChange = () => {
      keyboardAxisRef.current.x =
        (keyboardState.right ? 1 : 0) - (keyboardState.left ? 1 : 0)
      keyboardAxisRef.current.z =
        (keyboardState.forward ? 1 : 0) - (keyboardState.backward ? 1 : 0)
      recomputeMovementVector()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          keyboardState.forward = true
          handleKeyChange()
          break
        case 'KeyS':
        case 'ArrowDown':
          keyboardState.backward = true
          handleKeyChange()
          break
        case 'KeyA':
        case 'ArrowLeft':
          keyboardState.left = true
          handleKeyChange()
          break
        case 'KeyD':
        case 'ArrowRight':
          keyboardState.right = true
          handleKeyChange()
          break
        case 'Space':
          event.preventDefault()
          requestJump()
          break
        default:
          break
      }
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          keyboardState.forward = false
          handleKeyChange()
          break
        case 'KeyS':
        case 'ArrowDown':
          keyboardState.backward = false
          handleKeyChange()
          break
        case 'KeyA':
        case 'ArrowLeft':
          keyboardState.left = false
          handleKeyChange()
          break
        case 'KeyD':
        case 'ArrowRight':
          keyboardState.right = false
          handleKeyChange()
          break
        case 'Space':
          event.preventDefault()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [recomputeMovementVector, requestJump])

  useEffect(() => {
    const socket = io(MULTIPLAYER_URL, {
      autoConnect: true,
    })
    socketRef.current = socket

    const handleConnect = () => setConnectionState('connected')
    const handleDisconnect = () => {
      setConnectionState('disconnected')
      playerIdRef.current = null
      remotePlayersRef.current.forEach((mesh) => mesh.dispose())
      remotePlayersRef.current.clear()
    }

    const handleSessionJoined = (payload: { playerId: string; snapshot: WorldSnapshot }) => {
      playerIdRef.current = payload.playerId
      syncRemotePlayers(payload.snapshot.players)
    }

    const handleWorldState = (snapshot: WorldSnapshot) => {
      syncRemotePlayers(snapshot.players)
    }

    const handlePlayerLeft = (payload: { playerId: string }) => {
      disposeRemotePlayer(payload.playerId)
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('session:joined', handleSessionJoined)
    socket.on('world:state', handleWorldState)
    socket.on('player:left', handlePlayerLeft)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('session:joined', handleSessionJoined)
      socket.off('world:state', handleWorldState)
      socket.off('player:left', handlePlayerLeft)
      socket.disconnect()
      socketRef.current = null
    }
  }, [disposeRemotePlayer, syncRemotePlayers])

  return (
    <div className="app-shell">
      <canvas ref={canvasRef} className="render-surface" />
      <section className="hud">
        <p className={`status status-${connectionState}`}>
          Multiplayer server: {connectionState}
        </p>
        <h1>Grain of Sand</h1>
        <p>
          Прототип арены для будущего 3D-шутера. Движок — Babylon.js, мобильные
          билды собираются через Capacitor.
        </p>
        <div className="actions">
          <a
            href="https://doc.babylonjs.com/"
            target="_blank"
            rel="noreferrer"
          >
            Babylon.js Docs
          </a>
          <a href="https://capacitorjs.com/docs" target="_blank" rel="noreferrer">
            Capacitor Docs
          </a>
        </div>
      </section>
      {isTouchInterface && (
        <div className="touch-controls" aria-hidden={!isTouchInterface}>
          <div
            ref={joystickBaseRef}
            className={`joystick ${joystickEngaged ? 'joystick-active' : ''}`}
            onPointerDown={handleJoystickPointerDown}
            onPointerMove={handleJoystickPointerMove}
            onPointerUp={handleJoystickPointerUp}
            onPointerCancel={handleJoystickPointerUp}
            onPointerLeave={handleJoystickPointerUp}
          >
            <div
              className="joystick-handle"
              style={{
                transform: `translate3d(${joystickOffset.x}px, ${joystickOffset.y}px, 0)`,
              }}
            />
          </div>
          <button
            type="button"
            className="jump-button"
            onPointerDown={(event) => {
              event.preventDefault()
              requestJump()
            }}
          >
            Прыжок
          </button>
        </div>
      )}
    </div>
  )
}

export default App
