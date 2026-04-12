import React from 'react'
import { useStore } from '../store/useStore'
import { MediaOverlay } from './MediaOverlay'

export function MediaManager() {
  const worldMedia = useStore((state) => state.worldMedia)
  
  return (
    <group name="wall-media">
      {worldMedia.map((item) => (
        <MediaOverlay key={item.id} {...item} />
      ))}
    </group>
  )
}
