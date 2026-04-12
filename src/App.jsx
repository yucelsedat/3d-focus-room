import { useEffect, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky, KeyboardControls, Stars } from '@react-three/drei'
import { Grid } from './components/Grid'
import { Walls } from './components/Walls'
import { Player } from './components/Player'
import { Crosshair } from './components/Crosshair'
import { EditModal } from './components/EditModal'
import { MediaManager } from './components/MediaManager'
import { KeyHandler } from './components/KeyHandler'
import { useStore } from './store/useStore'
import './App.css'

function App() {
  const setWorldMedia = useStore((state) => state.setWorldMedia)

  useEffect(() => {
    fetch('/api/media')
      .then(res => res.json())
      .then(data => setWorldMedia(data))
      .catch(err => console.error('Media load error:', err))
  }, [setWorldMedia])

  return (
    <KeyboardControls
      map={[
        { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
        { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
        { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
        { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
        { name: 'edit', keys: ['p', 'P'] },
      ]}
    >
      <div style={{ width: '100vw', height: '100vh' }}>
        <Canvas
          shadows
          camera={{ fov: 75, position: [0, 2, 5] }}
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
            <Grid />
            <Walls />
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
      </div>
    </KeyboardControls>
  )
}

export default App
