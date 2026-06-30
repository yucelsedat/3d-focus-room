import { useEffect, Suspense, Component } from 'react'
import { Canvas } from '@react-three/fiber'
import { KeyboardControls } from '@react-three/drei'
import { Grid, OutdoorFloor } from './components/Grid'
import { FrameLimiter } from './components/FrameLimiter'
import { Walls } from './components/Walls'
import { Player } from './components/Player'
import { Crosshair } from './components/Crosshair'
import { EditModal } from './components/EditModal'
import { RoomModal } from './components/RoomModal'
import { OuterWalls } from './components/OuterWalls'
import { MainMenu } from './components/MainMenu'
import { MediaManager } from './components/MediaManager'
import { KeyHandler } from './components/KeyHandler'
import { BlueDoors } from './components/BlueDoor'
import { RoomNavHUD } from './components/RoomNavHUD'
import { LoopIndicator } from './components/LoopIndicator'
import { useStore } from './store/useStore'
import { loadRoom } from './utils/loadRoom'
import './App.css'

class SceneErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(e) { return { error: e } }
  componentDidCatch(e) { console.error('[SceneErrorBoundary]', e) }
  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

function App() {
  const setRooms = useStore((state) => state.setRooms)

  useEffect(() => {
    document.body.classList.add('game-mode')
    return () => document.body.classList.remove('game-mode')
  }, [])

  useEffect(() => {
    fetch('/api/rooms')
      .then(res => res.json())
      .then(data => setRooms(data))
      .catch(err => console.error('Rooms load error:', err))
  }, [setRooms])

  useEffect(() => {
    const lastId   = localStorage.getItem('lastRoomId')   || 'default'
    const lastName = localStorage.getItem('lastRoomName') || 'Varsayılan Oda'
    loadRoom(lastId, lastName).catch(() => {
      loadRoom('default', 'Varsayılan Oda').catch(err => console.error('Initial room load error:', err))
    })
  }, [])

  return (
    <KeyboardControls
      map={[
        { name: 'forward',  keys: ['ArrowUp', 'w', 'W'] },
        { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
        { name: 'left',     keys: ['ArrowLeft', 'a', 'A'] },
        { name: 'right',    keys: ['ArrowRight', 'd', 'D'] },
        { name: 'edit',     keys: ['e', 'E'] },
        { name: 'room',     keys: ['r', 'R'] },
        { name: 'menu',     keys: ['q', 'Q'] },
        { name: 'jump',     keys: ['Space'] },
        { name: 'crouch',   keys: ['ShiftLeft', 'ShiftRight'] },
      ]}
    >
      <div style={{ width: '100vw', height: '100vh' }}>
        <Canvas
          // Isınma optimizasyonu — bkz. FrameLimiter:
          // frameloop="demand" + FrameLimiter render'ı ~30fps'e kilitler;
          // gölge geçişi tamamen kaldırıldı (shadows yok, castShadow yok);
          // dpr ve GPU tercihi düşük güce çekildi.
          frameloop="demand"
          camera={{ fov: 75, position: [0, 2.5, 5] }}
          // dpr cap: retina/4K ekranlarda piksel sayısını sınırlar; ısı için 1.25'e çekildi
          dpr={[1, 1.25]}
          gl={{ antialias: true, powerPreference: 'low-power' }}
        >
          <FrameLimiter fps={30} />
          <color attach="background" args={['#050505']} />
          <fog attach="fog" args={['#050505', 0, 70]} />

          <ambientLight intensity={0.9} />
          <pointLight position={[10, 10, 10]} intensity={1.5} />
          <spotLight
            position={[0, 10, 0]}
            angle={0.15}
            penumbra={1}
            intensity={2}
          />

          <SceneErrorBoundary>
            <Suspense fallback={null}>
              <OutdoorFloor />
              <Grid />
              <Walls />
              <OuterWalls />
              <BlueDoors />
              <Player />
              <KeyHandler />
            </Suspense>
          </SceneErrorBoundary>

          {/* MediaManager gets its own Suspense so texture failures cannot black-out the scene */}
          <Suspense fallback={null}>
            <MediaManager />
          </Suspense>
        </Canvas>
        <Crosshair />
        <RoomNavHUD />
        <LoopIndicator />
        <EditModal />
        <RoomModal />
        <MainMenu />
      </div>
    </KeyboardControls>
  )
}

export default App
