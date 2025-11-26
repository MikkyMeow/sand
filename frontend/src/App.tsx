import { useEffect, useRef, useState } from 'react'
import {
  ArcRotateCamera,
  Color3,
  Engine,
  HemisphericLight,
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

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [connectionState, setConnectionState] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting')
  const networkStateRef = useRef(connectionState)
  networkStateRef.current = connectionState

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const engine = new Engine(canvas, true)
    const scene = new Scene(engine)
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

    const hero = MeshBuilder.CreateBox('hero', { size: 0.6 }, scene)
    hero.material = heroMaterial
    hero.position.y = 0.35

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

    let elapsed = 0
    scene.onBeforeRenderObservable.add(() => {
      const delta = engine.getDeltaTime()
      elapsed += delta
      hero.rotate(Vector3.Up(), delta * 0.001)
      crosshair.position.x = Math.sin(elapsed * 0.002) * 0.4
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
      engine.dispose()
    }
  }, [])

  useEffect(() => {
    const socket = io(MULTIPLAYER_URL, {
      autoConnect: true,
    })

    const handleConnect = () => setConnectionState('connected')
    const handleDisconnect = () => setConnectionState('disconnected')

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    // Placeholder for future world state updates from the backend server
    socket.on('world:state', (payload) => {
      console.debug('Received world update', payload)
    })

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.disconnect()
    }
  }, [])

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
    </div>
  )
}

export default App
