import React, { Suspense, Component } from 'react'
import { useTexture, useVideoTexture, Html } from '@react-three/drei'
import * as THREE from 'three'

// Error boundary to catch texture load failures (CORS, 404, etc.)
// useTexture throws a real Error on failure, which Suspense cannot catch — needs ErrorBoundary
class TextureErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(err) {
    console.warn('[MediaOverlay] Texture load failed:', err.message)
  }

  render() {
    if (this.state.hasError) {
      const { width, height } = this.props
      // Show a red "broken" placeholder so the rest of the scene is unaffected
      return (
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial color="#3d0000" side={THREE.DoubleSide} />
        </mesh>
      )
    }
    return this.props.children
  }
}

function ImageMesh({ url, width, height }) {
  const texture = useTexture(url)
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
    </mesh>
  )
}

function VideoMesh({ url, width, height }) {
  const texture = useVideoTexture(url, { muted: true, loop: true, start: true })
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  )
}

function GifMesh({ url, width, height }) {
  // Sabit bir CSS çözünürlüğü kullanıyoruz (örn: Genişlik 600px).
  // Böylece devasa duvarlarda browser'ı kilitleyen 10000x10000 px boyutunu engelliyoruz.
  const pxWidth = 600
  const pxHeight = 600 * (height / width)
  const scale = width / pxWidth

  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      {/* Invisible mesh allows raycaster to still hit this area if we want, while not drawing color */}
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      <Html 
        transform 
        occlude="blending" 
        position={[0, 0, 0]} 
        scale={scale}
        style={{ width: `${pxWidth}px`, height: `${pxHeight}px`, pointerEvents: 'none' }}
      >
        <img src={url} style={{ width: '100%', height: '100%', objectFit: 'fill' }} alt="gif" />
      </Html>
    </mesh>
  )
}

// Loading placeholder shown while texture is being fetched
function LoadingMesh({ width, height }) {
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color="#111" side={THREE.DoubleSide} />
    </mesh>
  )
}

export function MediaOverlay({ type, url, width, height, position, rotation }) {
  const isVideo = type === 'video'
  // Proxy might append query params, so we cleanly check if format is likely GIF
  const isGif = !isVideo && typeof url === 'string' && url.toLowerCase().includes('.gif')

  return (
    <group position={position} rotation={rotation}>
      {/* Each overlay has its own ErrorBoundary + Suspense so failures are isolated */}
      <TextureErrorBoundary width={width} height={height}>
        <Suspense fallback={<LoadingMesh width={width} height={height} />}>
          {isVideo ? (
            <VideoMesh url={url} width={width} height={height} />
          ) : isGif ? (
            <GifMesh url={url} width={width} height={height} />
          ) : (
            <ImageMesh url={url} width={width} height={height} />
          )}
        </Suspense>
      </TextureErrorBoundary>
    </group>
  )
}
