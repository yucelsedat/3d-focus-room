# 3D Interactive Media Gallery Experience

A high-performance First-Person 3D Web Application built on **React**, **Three.js** (@react-three/fiber), and **Vite**. This project acts as an interactive virtual exhibition where users can walk around a seamlessly generated 3D room, interact with specific grid coordinates on the walls or the floor, and instantly inject/render images, animated GIFs, videos, YouTube embeds, or formatted markdown text onto the surfaces.

## ✨ Core Features

- **Responsive First Person Navigation:** Smooth WASD controls and Pointer-Lock mouse viewing mechanism powered by `@react-three/drei`. Features collision borders to prevent clipping through or falling out of the environment.
- **Dynamic Grid & Raycasting System:** Fully optimized 20x20 instanced meshes for floor structures and procedural walls. Accurate bounding-sphere computation guarantees seamless crosshair hover detection at any distance.
- **In-Game Media Editor Modal:** Pressing `E` detaches the pointer lock and invokes an interactive UI menu, allowing you to fetch, upload, resize, or remove elements on the exact grid tile you hovered over.
- **Native Animated GIF Rendering:** Unlike standard textures that freeze GIFs, the application natively mounts browser-based HTML portals mapped exactly onto 3D coordinates. This preserves native GIF animations without destroying browser FPS.
- **YouTube Embed Support:** Paste any YouTube URL (watch, share, or iframe format) and it gets normalized to an embed and rendered as a fully interactive iframe directly in the 3D scene.
- **Markdown Text Panels:** Type rich formatted text using Markdown syntax. The panel height is fixed at 5 units; content that exceeds one column automatically flows into additional columns extending to the right — like a newspaper layout.
- **Smart Aspect Ratio Locking (🔗):** Selecting an image/video file or pasting a web URL dynamically queries its natural aspect ratio. Entering a width value automatically calculates the optimal height counterpart without you having to do math.
- **Advanced Local Proxy Backend:** Includes a lightweight `Express.js` backend server mapping proxy-download routes (`/api/fetch-url`) in order to bypass strict `CORS` restrictions commonly found on the web, securely streaming assets to the client.

## 🚀 Getting Started

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Both Client and Backend Servers
We use a concurrent script to watch and boot up both Vite's frontend and the Express backend simultaneously.
```bash
npm run dev:full
```

Once the environment boots up, your application will be available at [http://localhost:5173](http://localhost:5173).

## 🛠 Tech Stack

- **Frontend:** React 19, @react-three/fiber, @react-three/drei, Zustand (State Management)
- **Backend:** Node.js, Express.js, Multer (Local Uploads & Proxy Routing)
- **Render Engine:** Three.js
- **Build Tool:** Vite

## 🎮 Controls

| Key / Input | Action |
|---|---|
| `W` `A` `S` `D` / Arrow Keys | Move camera across the room |
| `Mouse` | Look around (Pointer Locked) |
| `E` | Open the Media Editor when hovering over a wall or floor tile |
| `Esc` | Release pointer lock / close modal |

## 🖼 Media Types

| Type | Description |
|---|---|
| **Image** | Upload a file or paste a URL — CORS-bypassed via local proxy |
| **Video** | Upload an `.mp4` or paste a direct video URL |
| **YouTube** | Paste any YouTube link (`watch`, `youtu.be`, or `<iframe>`) |
| **GIF** | Detected automatically from URL — rendered natively in-browser |
| **Markdown** | Write formatted text; auto-flows into multi-column layout if tall |

---
*Built to benchmark and demonstrate high-performance React-Three-Fiber environments, seamless Web DOM overlays, and real-time backend asset synchronization.*
