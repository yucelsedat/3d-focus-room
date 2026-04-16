import { useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky, KeyboardControls, Stars } from '@react-three/drei'
import { Grid, OutdoorFloor } from './components/Grid'
import { Walls } from './components/Walls'
import { Player } from './components/Player'
import { Crosshair } from './components/Crosshair'
import { EditModal } from './components/EditModal'
import { RoomModal } from './components/RoomModal'
import { OuterWalls } from './components/OuterWalls'
import { MainMenu } from './components/MainMenu'
import { MediaManager } from './components/MediaManager'
import { KeyHandler } from './components/KeyHandler'
import { useStore } from './store/useStore'
import './App.css'

function App() {
  const setWorldMedia   = useStore((state) => state.setWorldMedia)
  const setHiddenWalls  = useStore((state) => state.setHiddenWalls)
  const setFloorTexture = useStore((state) => state.setFloorTexture)
  const setRooms        = useStore((state) => state.setRooms)

  useEffect(() => {
    fetch('/api/rooms')
      .then(res => res.json())
      .then(data => setRooms(data))
      .catch(err => console.error('Rooms load error:', err))
  }, [setRooms])

  useEffect(() => {
    fetch('/api/media')
      .then(res => res.json())
      .then(data => setWorldMedia(data))
      .catch(err => console.error('Media load error:', err))
  }, [setWorldMedia])

  useEffect(() => {
    fetch('/api/doors')
      .then(res => res.json())
      .then(data => setHiddenWalls(data))
      .catch(err => console.error('Doors load error:', err))
  }, [setHiddenWalls])

  useEffect(() => {
    fetch('/api/floor')
      .then(res => res.json())
      .then(data => setFloorTexture(data.texture))
      .catch(err => console.error('Floor load error:', err))
  }, [setFloorTexture])

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
      ]}
    >
      <div style={{ width: '100vw', height: '100vh' }}>
        <Canvas
          shadows
          camera={{ fov: 75, position: [0, 2.5, 5] }}
          gl={{ antialias: true }}
        >
          <color attach="background" args={['#050505']} />
          <fog attach="fog" args={['#050505', 0, 70]} />

          <Sky sunPosition={[100, 20, 100]} />
          <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

          <ambientLight intensity={0.7} />
          <pointLight position={[10, 10, 10]} intensity={1.5} castShadow />
          <spotLight
            position={[0, 10, 0]}
            angle={0.15}
            penumbra={1}
            intensity={2}
            castShadow
          />

          <Suspense fallback={null}>
            <OutdoorFloor />
            <Grid />
            <Walls />
            <OuterWalls />
            <Player />
            <KeyHandler />
          </Suspense>

          {/* MediaManager gets its own Suspense so texture failures cannot black-out the scene */}
          <Suspense fallback={null}>
            <MediaManager />
          </Suspense>
        </Canvas>
        <Crosshair />
        <EditModal />
        <RoomModal />
        <MainMenu />
      </div>
    </KeyboardControls>
  )
}

export default App
