import React, { Suspense, Component } from 'react'
import { useTexture, useVideoTexture, Html } from '@react-three/drei'
import * as THREE from 'three'
import { marked } from 'marked'

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

function YoutubeMesh({ url, width, height }) {
  const w = parseFloat(width)
  const h = parseFloat(height)

  // Chromium iframe render boyutunu koruyup viewport'u hileleyen referans genişliği
  const pxWidth = 600
  const pxHeight = Math.round(600 * (h / w))
  // Plan A: drei Html transform modunda f=400/distanceFactor=40 faktörü XY ölçeğini büyütür.
  // Bu faktör hesaba katılmadan scale w/pxWidth olarak bırakılırsa iframe 40x küçük görünür.
  const scaleFactor = w * 40 / pxWidth

  const cleanUrl = url.replace(/[?&]autoplay=1/g, '')

  return (
    <mesh position={[0, 0, 0.02]}>
      {/* 3D Kırmızı Test Çerçevesi */}
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0.1} color="red" depthWrite={false} side={THREE.DoubleSide} />

      {/* 
        1) occlude KALDIRILDI: Duvarın açısıyla yaşanan görünmezlik (opacity: 0) kapatıldı. 
        2) position: Kırmızı çerçevenin tam sol-alt köşesine vidalandı.
      */}
      <Html
        key={`yt-${w}-${h}`}
        transform
        position={[0, 0, 0.01]}
        scale={scaleFactor}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          width: `${pxWidth}px`,
          height: `${pxHeight}px`,
          backgroundColor: '#000',
        }}>
          {/* Iframe boyutunu orantısal koru ama her zaman köşeden başla */}
          <iframe
            src={cleanUrl}
            frameBorder="0"
            allowFullScreen
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
              pointerEvents: 'auto'
            }}
          ></iframe>
        </div>
      </Html>
    </mesh>
  )
}

// 200 px = 1 Three.js birim. Her sütun 600px × 1000px → 3×5 birim.
const MD_PX_PER_UNIT = 200
const MD_COL_PX_W = 600

function MarkdownMesh({ content, width, height }) {
  const w = parseFloat(width)
  const h = parseFloat(height)

  // Piksel boyutları orana göre türetilir (aynı density her zaman)
  const pxWidth = Math.round(w * MD_PX_PER_UNIT)
  const pxHeight = Math.round(h * MD_PX_PER_UNIT)
  const nCols = Math.max(1, Math.round(pxWidth / MD_COL_PX_W))
  const scaleFactor = w * 40 / pxWidth  // = 40/300 sabit

  const html = marked(content || '')

  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      <Html
        transform
        position={[0, 0, 0.01]}
        scale={scaleFactor}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          width: `${pxWidth}px`,
          height: `${pxHeight}px`,
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderRadius: '8px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '16px',
          lineHeight: '1.6',
          color: '#1a1a1a',
          // Çok sütunlu akış
          columnCount: nCols,
          columnGap: '0px',
          columnFill: 'auto',
          padding: '24px',
        }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Html>
    </mesh>
  )
}

function GifMesh({ url, width, height }) {
  // Sabit bir CSS çözünürlüğü kullanıyoruz (örn: Genişlik 600px).
  // Böylece devasa duvarlarda browser'ı kilitleyen 10000x10000 px boyutunu engelliyoruz.
  const pxWidth = 600
  const pxHeight = 600 * (height / width)
  const scale = width * 40 / pxWidth

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

export function MediaOverlay({ type, url, width, height, position, rotation, content }) {
  const isVideo = type === 'video'
  const isYoutube = type === 'youtube'
  const isMarkdown = type === 'markdown'
  // Proxy might append query params, so we cleanly check if format is likely GIF
  const isGif = !isVideo && !isYoutube && !isMarkdown && typeof url === 'string' && url.toLowerCase().includes('.gif')

  // Tile'ın sol alt köşesine sabitlemek için gereken yerel eksen kaydırması
  const offsetX = (width - 1) / 2
  const offsetY = (height - 1) / 2

  return (
    <group position={position} rotation={rotation}>
      {/* Anchor adjusting group */}
      <group position={[offsetX, offsetY, 0]}>
        {isMarkdown ? (
          <MarkdownMesh content={content} width={width} height={height} />
        ) : (
          <TextureErrorBoundary width={width} height={height}>
            <Suspense fallback={<LoadingMesh width={width} height={height} />}>
              {isVideo ? (
                <VideoMesh url={url} width={width} height={height} />
              ) : isYoutube ? (
                <YoutubeMesh url={url} width={width} height={height} />
              ) : isGif ? (
                <GifMesh url={url} width={width} height={height} />
              ) : (
                <ImageMesh url={url} width={width} height={height} />
              )}
            </Suspense>
          </TextureErrorBoundary>
        )}
      </group>
    </group>
  )
}
