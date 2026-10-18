import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import './App.css'
import { notifyEmbed } from './EmbedBoundary'
import {
  LineMaterial,
  LineSegments2,
  LineSegmentsGeometry,
} from 'three-stdlib'

const ROOM_MODEL_URL = '/models/Room.glb'
const EMBEDDED = new URLSearchParams(window.location.search).get('embedded') === '1'
const INTRO_VIDEO_URL = '/intro/damso-logo-intro.mp4'
const CAMERA_START_POSITION: [number, number, number] = [4.3, 1.6, 2.4]
const CAMERA_START_TARGET: [number, number, number] = [1.6, 1.5, -0.7]
const BOOK_CAMERA_POSITION: [number, number, number] = [1.22, 1.66, 0.62]
const BOOK_CAMERA_TARGET: [number, number, number] = [1.18, 0.87, 0.01]

type TimeOfDay = 'day' | 'night'
type ViewMode = 'room' | 'book'

type MemoryPhotoStory = {
  id: string
  title: string
  recordedAt: string
}

type MemoryFrameSlot = {
  id: string
  position: [number, number, number]
  size: [number, number]
}

type ColorableMaterial = THREE.Material & {
  color?: THREE.Color
  dithering?: boolean
  emissive?: THREE.Color
  emissiveIntensity?: number
  envMapIntensity?: number
  metalness?: number
  polygonOffset?: boolean
  polygonOffsetFactor?: number
  polygonOffsetUnits?: number
  roughness?: number
}

const SKETCH_EDGE_COLOR = 0x1f1918
const SKETCH_EDGE_LINE_WIDTH = 1.55
const SKETCH_EDGE_OPACITY = 0.5
const SKETCH_EDGE_SCALE = 1.0012
const SKETCH_EDGE_THRESHOLD = 36
const DAY_EXPOSURE = 1.25
const NIGHT_EXPOSURE = 0.85
const INTRO_MIN_VISIBLE_MS = 900
const INTRO_REVEAL_DURATION_MS = 1080
const INTRO_VIDEO_FALLBACK_MS = 15000
const LOOK_DRAG_LIMIT = 0.68
const LOOK_DRAG_SENSITIVITY = 0.003
const CARPET_OBJECT_NAME = '\uce74\ud3ab'
const RIGHT_FLOOR_LAMP_OFFSET = new THREE.Vector3(1.78, 0, -0.03)
const RIGHT_FLOOR_LAMP_OBJECT_NAMES = new Set(['Cylinder008_1', 'Cylinder008_2', 'Cylinder008_3'])
const LANTERN_SHADE_OBJECT_NAMES = new Set(['Cylinder008_3', 'Cylinder010_3'])
const MEMORY_BOOK_OBJECT_NAMES = new Set(['Cube079', 'Cube079_1'])
const BOOK_PAGE_CLEAN_EDGE_OBJECT_NAMES = new Set(['Cube007', 'Cube079', 'Cube079_1'])
const REMOVED_ROOM_OBJECT_NAMES = new Set([
  'Cube',
  'light',
  'frame001_line001_Cube001',
  'frame001_line001_Cube001_1',
  'frame001_line001_Cube002',
  'frame001_line001_Cube002_1',
])
const MEMORY_PHOTO_STORIES: MemoryPhotoStory[] = [
  {
    id: 'memory-first-payday',
    title: '처음으로 월급을 받았던 날',
    recordedAt: '2026.06.23',
  },
  {
    id: 'memory-school-picnic',
    title: '학창 시절 소풍 이야기',
    recordedAt: '2026.06.24',
  },
  {
    id: 'memory-family-trip',
    title: '가족 여행을 떠났던 날',
    recordedAt: '2026.06.25',
  },
  {
    id: 'memory-kitchen',
    title: '부엌에서 함께한 저녁',
    recordedAt: '2026.06.26',
  },
  {
    id: 'memory-letter',
    title: '오래 간직한 편지',
    recordedAt: '2026.06.27',
  },
  {
    id: 'memory-rainy-day',
    title: '비 오던 날의 기억',
    recordedAt: '2026.06.28',
  },
]

const WALL_MEMORY_FRAME_SLOTS: MemoryFrameSlot[] = [
  {
    id: 'right-wall-large-frame',
    position: [1.392, 2.174, -1.821],
    size: [0.54, 0.34],
  },
  {
    id: 'right-wall-upper-left-frame',
    position: [1.392, 2.78, -2.057],
    size: [0.235, 0.338],
  },
  {
    id: 'right-wall-upper-right-frame',
    position: [1.392, 2.996, -1.626],
    size: [0.235, 0.338],
  },
  {
    id: 'left-wall-large-frame',
    position: [1.392, 2.174, 1.855],
    size: [0.54, 0.34],
  },
  {
    id: 'left-wall-upper-left-frame',
    position: [1.392, 2.78, 1.619],
    size: [0.235, 0.338],
  },
  {
    id: 'left-wall-upper-right-frame',
    position: [1.392, 2.996, 2.05],
    size: [0.235, 0.338],
  },
]

function applyCoolLibraryTone(material: THREE.Material) {
  const tonedMaterial = material.clone() as ColorableMaterial

  if (tonedMaterial.color) {
    const hsl = { h: 0, s: 0, l: 0 }
    tonedMaterial.color.getHSL(hsl)
    tonedMaterial.color.setHSL(hsl.h, hsl.s * 0.86, hsl.l * 0.98)
    tonedMaterial.color.lerp(new THREE.Color('#827b80'), 0.045)
  }

  tonedMaterial.dithering = false
  if (typeof tonedMaterial.roughness === 'number') tonedMaterial.roughness = Math.max(tonedMaterial.roughness, 0.82)
  if (typeof tonedMaterial.metalness === 'number') tonedMaterial.metalness = Math.min(tonedMaterial.metalness, 0.08)
  if (typeof tonedMaterial.envMapIntensity === 'number') tonedMaterial.envMapIntensity *= 0.45
  tonedMaterial.polygonOffset = true
  tonedMaterial.polygonOffsetFactor = 1
  tonedMaterial.polygonOffsetUnits = 1

  return tonedMaterial
}

function applyMemoryBookMaterialGlow(material: THREE.Material) {
  const bookMaterial = material as ColorableMaterial

  bookMaterial.emissive?.set('#ffcf82')
  if (typeof bookMaterial.emissiveIntensity === 'number') {
    bookMaterial.emissiveIntensity = 0.26
  }
  bookMaterial.toneMapped = false
  bookMaterial.needsUpdate = true

  return bookMaterial
}

function getSketchEdgePositions(mesh: THREE.Mesh, position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  if (BOOK_PAGE_CLEAN_EDGE_OBJECT_NAMES.has(mesh.name)) return []
  return Array.from(position.array)
}

function appendSketchEdgePositions(root: THREE.Object3D, mesh: THREE.Mesh, target: number[]) {
  if (!mesh.geometry || mesh.geometry.getAttribute('position') === undefined) return null

  const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, SKETCH_EDGE_THRESHOLD)
  const position = edgeGeometry.getAttribute('position')
  if (position.count === 0) {
    edgeGeometry.dispose()
    return null
  }

  const values = getSketchEdgePositions(mesh, position)
  mesh.geometry.computeBoundingBox()
  mesh.updateWorldMatrix(true, false)
  root.updateWorldMatrix(true, false)

  const box = mesh.geometry.boundingBox
  const center = box?.getCenter(new THREE.Vector3())
  const point = new THREE.Vector3()

  for (let index = 0; index < values.length; index += 3) {
    point.set(values[index], values[index + 1], values[index + 2])
    if (center) {
      point.sub(center).multiplyScalar(SKETCH_EDGE_SCALE).add(center)
    }
    mesh.localToWorld(point)
    root.worldToLocal(point)
    target.push(point.x, point.y, point.z)
  }

  edgeGeometry.dispose()
}

function createSketchEdgesLine(positions: number[], material: LineMaterial) {
  if (positions.length === 0) return null

  const geometry = new LineSegmentsGeometry()
  geometry.setPositions(positions)

  const line = new LineSegments2(geometry, material)
  line.name = 'room-sketch-edges'
  line.renderOrder = 4
  line.frustumCulled = false
  line.computeLineDistances()

  return line
}

function createCarpetTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512

  const context = canvas.getContext('2d')
  if (!context) return null

  const baseGradient = context.createLinearGradient(0, 0, canvas.width, canvas.height)
  baseGradient.addColorStop(0, '#755352')
  baseGradient.addColorStop(0.48, '#5f403f')
  baseGradient.addColorStop(1, '#432b2f')
  context.fillStyle = baseGradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = image.data
  for (let index = 0; index < data.length; index += 4) {
    const noise = (Math.random() - 0.5) * 22
    data[index] = THREE.MathUtils.clamp(data[index] + noise, 0, 255)
    data[index + 1] = THREE.MathUtils.clamp(data[index + 1] + noise * 0.72, 0, 255)
    data[index + 2] = THREE.MathUtils.clamp(data[index + 2] + noise * 0.68, 0, 255)
  }
  context.putImageData(image, 0, 0)

  context.globalAlpha = 0.18
  context.strokeStyle = '#f0c7b2'
  for (let y = 8; y < canvas.height; y += 7) {
    context.beginPath()
    context.moveTo(0, y + Math.sin(y * 0.09) * 1.5)
    context.lineTo(canvas.width, y + Math.cos(y * 0.07) * 1.5)
    context.stroke()
  }

  context.globalAlpha = 0.12
  context.strokeStyle = '#271d21'
  for (let x = 5; x < canvas.width; x += 11) {
    context.beginPath()
    context.moveTo(x + Math.sin(x * 0.13) * 2, 0)
    context.lineTo(x + Math.cos(x * 0.08) * 2, canvas.height)
    context.stroke()
  }
  context.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3.2, 4.4)
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true

  return texture
}

function createCarpetMaterial() {
  const carpetTexture = createCarpetTexture()

  return new THREE.MeshStandardMaterial({
    color: '#6b4849',
    map: carpetTexture,
    metalness: 0,
    opacity: 1,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.98,
    side: THREE.DoubleSide,
    transparent: false,
  })
}

function applyLanternShadeLight(model: THREE.Object3D, timeOfDay: TimeOfDay) {
  const isNight = timeOfDay === 'night'

  model.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || !LANTERN_SHADE_OBJECT_NAMES.has(mesh.name)) return

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    materials.forEach((material) => {
      const shadeMaterial = material as ColorableMaterial
      const saved = material.userData.lanternShadeOriginal as
        | {
            color?: THREE.Color
            emissive?: THREE.Color
            emissiveIntensity?: number
            toneMapped?: boolean
          }
        | undefined

      if (!saved) {
        material.userData.lanternShadeOriginal = {
          color: shadeMaterial.color?.clone(),
          emissive: shadeMaterial.emissive?.clone(),
          emissiveIntensity: shadeMaterial.emissiveIntensity,
          toneMapped: shadeMaterial.toneMapped,
        }
      }

      const original = material.userData.lanternShadeOriginal as {
        color?: THREE.Color
        emissive?: THREE.Color
        emissiveIntensity?: number
        toneMapped?: boolean
      }

      if (isNight) {
        shadeMaterial.color?.set('#fff1d5')
        shadeMaterial.emissive?.set('#ffd39a')
        if (typeof shadeMaterial.emissiveIntensity === 'number') shadeMaterial.emissiveIntensity = 1.85
        shadeMaterial.toneMapped = false
      } else {
        if (original.color && shadeMaterial.color) shadeMaterial.color.copy(original.color)
        if (original.emissive && shadeMaterial.emissive) shadeMaterial.emissive.copy(original.emissive)
        if (typeof original.emissiveIntensity === 'number') shadeMaterial.emissiveIntensity = original.emissiveIntensity
        shadeMaterial.toneMapped = original.toneMapped ?? true
      }

      shadeMaterial.needsUpdate = true
    })
  })
}

function RoomModel({
  onReady,
  timeOfDay,
}: {
  onReady?: () => void
  timeOfDay: TimeOfDay
}) {
  const { scene } = useGLTF(ROOM_MODEL_URL)
  const { size } = useThree()

  const model = useMemo(() => {
    const clone = scene.clone(true)
    const carpetMaterial = createCarpetMaterial()
    const memoryBookGlowMaterials: ColorableMaterial[] = []
    const objectsToRemove: THREE.Object3D[] = []
    const sketchEdgePositions: number[] = []
    const sketchLineMaterial = new LineMaterial({
      color: SKETCH_EDGE_COLOR,
      linewidth: SKETCH_EDGE_LINE_WIDTH,
      opacity: SKETCH_EDGE_OPACITY,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    })

    clone.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return

      if (REMOVED_ROOM_OBJECT_NAMES.has(mesh.name)) {
        objectsToRemove.push(mesh)
        return
      }

      if (RIGHT_FLOOR_LAMP_OBJECT_NAMES.has(mesh.name)) {
        mesh.position.add(RIGHT_FLOOR_LAMP_OFFSET)
      }

      if (mesh.name === CARPET_OBJECT_NAME) {
        mesh.material = carpetMaterial
        mesh.position.y += 0.014
        mesh.castShadow = false
        mesh.receiveShadow = true
        mesh.renderOrder = 3
        return
      }

      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => applyCoolLibraryTone(material))
        : applyCoolLibraryTone(mesh.material)

      if (MEMORY_BOOK_OBJECT_NAMES.has(mesh.name)) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach((material) => {
          memoryBookGlowMaterials.push(applyMemoryBookMaterialGlow(material))
        })
      }

      mesh.castShadow = true
      mesh.receiveShadow = true
      appendSketchEdgePositions(clone, mesh, sketchEdgePositions)
    })

    objectsToRemove.forEach((object) => {
      object.parent?.remove(object)
    })

    const sketchEdges = createSketchEdgesLine(sketchEdgePositions, sketchLineMaterial)
    if (sketchEdges) {
      clone.add(sketchEdges)
    }

    clone.userData.memoryBookGlowMaterials = memoryBookGlowMaterials

    return clone
  }, [scene])

  useEffect(() => {
    const sketchEdges = model.getObjectByName('room-sketch-edges') as LineSegments2 | undefined
    const material = sketchEdges?.material as LineMaterial | undefined
    material?.resolution.set(size.width, size.height)
  }, [model, size.height, size.width])

  useEffect(() => {
    applyLanternShadeLight(model, timeOfDay)
  }, [model, timeOfDay])

  useFrame(({ clock }) => {
    const materials = model.userData.memoryBookGlowMaterials as ColorableMaterial[] | undefined
    if (!materials) return

    const pulse = (Math.sin(clock.elapsedTime * 2.2) + 1) * 0.5
    materials.forEach((material) => {
      if (typeof material.emissiveIntensity === 'number') {
        material.emissiveIntensity = 0.28 + pulse * 0.16
      }
    })
  })

  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        onReady?.()
      })
    })

    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [model, onReady])

  return <primitive object={model} />
}

function createMorningSkyTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512

  const context = canvas.getContext('2d')
  if (!context) return null

  const skyGradient = context.createLinearGradient(0, 0, 0, canvas.height)
  skyGradient.addColorStop(0, '#dceaf3')
  skyGradient.addColorStop(0.46, '#f2eee6')
  skyGradient.addColorStop(1, '#fff2dd')
  context.fillStyle = skyGradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const morningGlow = context.createRadialGradient(360, 280, 20, 360, 280, 290)
  morningGlow.addColorStop(0, 'rgba(255, 244, 214, 0.88)')
  morningGlow.addColorStop(0.38, 'rgba(255, 243, 221, 0.44)')
  morningGlow.addColorStop(1, 'rgba(255, 243, 221, 0)')
  context.fillStyle = morningGlow
  context.fillRect(0, 0, canvas.width, canvas.height)

  const softClouds = [
    [132, 154, 98, 28, 0.22],
    [208, 114, 138, 34, 0.18],
    [396, 92, 112, 30, 0.2],
  ]
  context.fillStyle = '#fff9ed'
  softClouds.forEach(([x, y, width, height, alpha]) => {
    context.globalAlpha = alpha
    context.beginPath()
    context.ellipse(x, y, width, height, -0.08, 0, Math.PI * 2)
    context.fill()
  })
  context.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return texture
}

function createNightSkyTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024

  const context = canvas.getContext('2d')
  if (!context) return null

  const skyGradient = context.createLinearGradient(0, 0, 0, canvas.height)
  skyGradient.addColorStop(0, '#050713')
  skyGradient.addColorStop(0.5, '#090d1c')
  skyGradient.addColorStop(1, '#151726')
  context.fillStyle = skyGradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const horizonGlow = context.createRadialGradient(760, 840, 48, 760, 840, 680)
  horizonGlow.addColorStop(0, 'rgba(73, 78, 122, 0.14)')
  horizonGlow.addColorStop(0.45, 'rgba(42, 48, 88, 0.09)')
  horizonGlow.addColorStop(1, 'rgba(35, 39, 70, 0)')
  context.fillStyle = horizonGlow
  context.fillRect(0, 0, canvas.width, canvas.height)

  let seed = 42
  const nextRandom = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

  const starColors = [
    [255, 249, 223],
    [223, 235, 255],
    [255, 238, 204],
    [235, 230, 255],
  ]
  const rgba = ([red, green, blue]: number[], alpha: number) => `rgba(${red}, ${green}, ${blue}, ${alpha})`

  const drawStar = (x: number, y: number, radius: number, alpha: number, color: number[], hasSpark: boolean) => {
    const glow = context.createRadialGradient(x, y, 0, x, y, radius * 5.8)
    glow.addColorStop(0, rgba(color, alpha * 0.72))
    glow.addColorStop(0.32, rgba(color, alpha * 0.16))
    glow.addColorStop(1, rgba(color, 0))
    context.fillStyle = glow
    context.beginPath()
    context.arc(x, y, radius * 5.8, 0, Math.PI * 2)
    context.fill()

    context.globalAlpha = alpha
    context.fillStyle = rgba(color, 0.95)
    context.beginPath()
    context.arc(x, y, radius, 0, Math.PI * 2)
    context.fill()

    if (!hasSpark) return

    context.globalAlpha = alpha * 0.5
    context.strokeStyle = rgba(color, 0.82)
    context.lineWidth = Math.max(0.55, radius * 0.34)
    context.beginPath()
    context.moveTo(x - radius * 4.4, y)
    context.lineTo(x + radius * 4.4, y)
    context.moveTo(x, y - radius * 3.1)
    context.lineTo(x, y + radius * 3.1)
    context.stroke()
  }

  for (let index = 0; index < 118; index += 1) {
    const x = nextRandom() * canvas.width
    const y = canvas.height * 0.045 + Math.pow(nextRandom(), 1.28) * canvas.height * 0.38
    const radius = 0.42 + Math.pow(nextRandom(), 2.4) * 1.65
    const alpha = 0.24 + Math.pow(nextRandom(), 0.8) * 0.52
    const color = starColors[Math.floor(nextRandom() * starColors.length)]
    const hasSpark = radius > 1.2 && nextRandom() > 0.36

    drawStar(x, y, radius, alpha, color, hasSpark)
  }

  context.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true

  return texture
}

function createMemoryPhotoTexture(story: MemoryPhotoStory, index: number, slot: MemoryFrameSlot) {
  const canvas = document.createElement('canvas')
  const aspect = slot.size[0] / slot.size[1]

  if (aspect >= 1) {
    canvas.width = 512
    canvas.height = Math.round(512 / aspect)
  } else {
    canvas.width = Math.round(512 * aspect)
    canvas.height = 512
  }

  const context = canvas.getContext('2d')
  if (!context) return null

  const width = canvas.width
  const height = canvas.height

  const palettes = [
    ['#d7b79f', '#7c695d', '#f4e8d8', '#2f2a29'],
    ['#aab8bf', '#6f7975', '#f1eadf', '#332f32'],
    ['#bfa7ad', '#776064', '#f5e8dc', '#30282b'],
    ['#d3c5a8', '#6b5e58', '#f8eddb', '#312927'],
    ['#aeb0c1', '#665c6a', '#f5eadf', '#29272d'],
    ['#c8b0a0', '#74614e', '#f6ead9', '#33291f'],
  ]
  const [top, bottom, paper, ink] = palettes[index % palettes.length]

  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, top)
  gradient.addColorStop(1, bottom)
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)

  context.globalAlpha = 0.38
  context.fillStyle = '#fff6e7'
  context.beginPath()
  context.ellipse(width * 0.72, height * 0.28, width * 0.26, height * 0.18, -0.15, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#2d2524'
  context.beginPath()
  context.ellipse(width * 0.27, height * 0.76, width * 0.31, height * 0.16, 0.12, 0, Math.PI * 2)
  context.fill()
  context.globalAlpha = 1

  const labelX = width * 0.07
  const labelHeight = Math.min(64, height * 0.2)
  const labelWidth = width * 0.68
  const labelY = height - labelHeight - height * 0.08
  const dateFontSize = Math.max(11, Math.min(24, width * 0.045))
  const titleFontSize = Math.max(11, Math.min(20, width * 0.039))

  context.fillStyle = 'rgba(255, 248, 235, 0.86)'
  context.fillRect(labelX, labelY, labelWidth, labelHeight)
  context.fillStyle = ink
  context.globalAlpha = 0.66
  context.font = `700 ${dateFontSize}px Georgia, serif`
  context.fillText(story.recordedAt, labelX + width * 0.04, labelY + labelHeight * 0.43)
  context.font = `700 ${titleFontSize}px sans-serif`
  context.fillText(story.title.slice(0, 18), labelX + width * 0.04, labelY + labelHeight * 0.73)
  context.globalAlpha = 1

  context.strokeStyle = paper
  context.lineWidth = Math.max(8, Math.min(width, height) * 0.04)
  context.strokeRect(context.lineWidth / 2, context.lineWidth / 2, width - context.lineWidth, height - context.lineWidth)
  context.strokeStyle = 'rgba(47, 39, 37, 0.45)'
  context.lineWidth = Math.max(3, Math.min(width, height) * 0.012)
  context.strokeRect(width * 0.045, height * 0.045, width * 0.91, height * 0.91)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true

  return texture
}

function MemoryPhotoFrames({ onOpenStory }: { onOpenStory: (story: MemoryPhotoStory) => void }) {
  const photoStories = useMemo(() => MEMORY_PHOTO_STORIES.slice(0, WALL_MEMORY_FRAME_SLOTS.length), [])
  const photoTextures = useMemo(() => {
    return photoStories.map((story, index) => {
      const slot = WALL_MEMORY_FRAME_SLOTS[index % WALL_MEMORY_FRAME_SLOTS.length]
      return createMemoryPhotoTexture(story, index, slot)
    })
  }, [photoStories])

  useEffect(() => {
    return () => {
      photoTextures.forEach((texture) => texture?.dispose())
    }
  }, [photoTextures])

  if (photoStories.length === 0) return null

  return (
    <group name="memory-photo-frames">
      {photoStories.map((story, index) => {
        const slot = WALL_MEMORY_FRAME_SLOTS[index % WALL_MEMORY_FRAME_SLOTS.length]
        const texture = photoTextures[index]
        if (!texture) return null

        return (
          <mesh
            key={story.id}
            name={`memory-photo-frame-${story.id}`}
            position={slot.position}
            rotation={[0, Math.PI / 2, 0]}
            renderOrder={6}
            onClick={(event) => {
              event.stopPropagation()
              onOpenStory(story)
            }}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              document.body.style.cursor = ''
            }}
          >
            <planeGeometry args={slot.size} />
            <meshBasicMaterial
              map={texture}
              polygonOffset
              polygonOffsetFactor={-2}
              polygonOffsetUnits={-2}
              side={THREE.DoubleSide}
              toneMapped={false}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function MorningWindowBackdrop() {
  const skyTexture = useMemo(() => createMorningSkyTexture(), [])
  const morningMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: skyTexture,
      color: '#fff7ea',
      side: THREE.DoubleSide,
      toneMapped: false,
    })
  }, [skyTexture])

  useEffect(() => {
    return () => {
      skyTexture?.dispose()
      morningMaterial.dispose()
    }
  }, [morningMaterial, skyTexture])

  return (
    <group name="morning-window-backdrop">
      <mesh material={morningMaterial} position={[-0.28, 1.92, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[6.75, 3.48]} />
      </mesh>
      <mesh material={morningMaterial} position={[3.18, 1.92, 3.34]}>
        <planeGeometry args={[4.2, 3.48]} />
      </mesh>
      <mesh material={morningMaterial} position={[3.18, 1.92, -3.34]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[4.2, 3.48]} />
      </mesh>
    </group>
  )
}

function NightWindowBackdrop() {
  const skyTexture = useMemo(() => createNightSkyTexture(), [])
  const nightMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      map: skyTexture,
      color: '#9fa9ce',
      opacity: 0.96,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
    })
  }, [skyTexture])

  useEffect(() => {
    return () => {
      skyTexture?.dispose()
      nightMaterial.dispose()
    }
  }, [nightMaterial, skyTexture])

  return (
    <group name="night-window-backdrop">
      <mesh material={nightMaterial} position={[-0.28, 1.92, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[6.75, 3.48]} />
      </mesh>
      <mesh material={nightMaterial} position={[3.18, 1.92, 3.34]}>
        <planeGeometry args={[4.2, 3.48]} />
      </mesh>
      <mesh material={nightMaterial} position={[3.18, 1.92, -3.34]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[4.2, 3.48]} />
      </mesh>
    </group>
  )
}

function SceneExposure({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const { gl } = useThree()

  useEffect(() => {
    gl.toneMappingExposure = timeOfDay === 'night' ? NIGHT_EXPOSURE : DAY_EXPOSURE
  }, [gl, timeOfDay])

  return null
}

function LanternBulb({
  position,
  radius = 0.032,
}: {
  position: [number, number, number]
  radius?: number
}) {
  return (
    <mesh position={position} renderOrder={7}>
      <sphereGeometry args={[radius, 18, 10]} />
      <meshBasicMaterial color="#ffe1aa" toneMapped={false} />
    </mesh>
  )
}

function BookshelfBarLight({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const isNight = timeOfDay === 'night'
  const { size } = useThree()
  const sketchEdges = useMemo(() => {
    const box = new THREE.BoxGeometry(3.52, 0.064, 0.104)
    const edges = new THREE.EdgesGeometry(box, 1)
    const position = edges.getAttribute('position')
    const geometry = new LineSegmentsGeometry()
    geometry.setPositions(Array.from(position.array))
    const material = new LineMaterial({
      color: SKETCH_EDGE_COLOR,
      linewidth: 1.25,
      opacity: 0.56,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    })
    const line = new LineSegments2(geometry, material)
    line.name = 'bookshelf-bar-light-sketch-edges'
    line.renderOrder = 9
    line.computeLineDistances()
    box.dispose()
    edges.dispose()

    return line
  }, [])

  useEffect(() => {
    const material = sketchEdges.material as LineMaterial
    material.resolution.set(size.width, size.height)
  }, [sketchEdges, size.height, size.width])

  useEffect(() => {
    return () => {
      sketchEdges.geometry.dispose()
      ;(sketchEdges.material as LineMaterial).dispose()
    }
  }, [sketchEdges])

  return (
    <group name="bookshelf-bar-light" position={[3.16, 3.39, -2.47]}>
      <mesh renderOrder={7}>
        <boxGeometry args={[3.48, 0.055, 0.09]} />
        <meshPhysicalMaterial
          color="#f8f4ea"
          emissive={isNight ? '#fff1ca' : '#ffffff'}
          emissiveIntensity={isNight ? 0.58 : 0.04}
          metalness={0}
          opacity={isNight ? 0.92 : 0.78}
          roughness={0.42}
          thickness={0.08}
          transmission={0.12}
          transparent
        />
      </mesh>
      <mesh position={[0, -0.031, 0.002]} renderOrder={8}>
        <boxGeometry args={[3.46, 0.01, 0.084]} />
        <meshBasicMaterial color={isNight ? '#e2d2a4' : '#d4d0c8'} opacity={0.34} transparent />
      </mesh>
      <primitive object={sketchEdges} />
      {isNight && (
        <>
          <mesh position={[0, -0.002, 0.004]} renderOrder={8}>
            <boxGeometry args={[3.3, 0.022, 0.035]} />
            <meshBasicMaterial color="#fff0bf" toneMapped={false} />
          </mesh>
          <pointLight color="#ffe0aa" decay={2} distance={2.65} intensity={0.92} position={[-1.22, -0.45, 0.36]} />
          <pointLight color="#ffe0aa" decay={2} distance={2.85} intensity={1.08} position={[0, -0.45, 0.36]} />
          <pointLight color="#ffe0aa" decay={2} distance={2.65} intensity={0.92} position={[1.22, -0.45, 0.36]} />
        </>
      )}
    </group>
  )
}

function NightLanternLighting() {
  return (
    <>
      <pointLight color="#ffd39b" distance={5.4} intensity={4.5} position={[0.85, 1.28, 0.59]} decay={2} />
      <pointLight color="#ffc377" distance={2.45} intensity={1.55} position={[4.36, 1.45, -2.08]} decay={2} />
      <pointLight color="#ffd9ad" distance={5.6} intensity={1.35} position={[1.7, 1.6, -0.35]} decay={2} />
      <pointLight color="#bfc5ef" distance={7.4} intensity={0.34} position={[3.4, 2.7, 1.35]} decay={2} />
      <LanternBulb position={[0.85, 1.28, 0.59]} />
      <LanternBulb position={[4.36, 1.58, -2.06]} radius={0.04} />
    </>
  )
}

function LibraryLighting({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const isNight = timeOfDay === 'night'
  const sunRef = useRef<THREE.DirectionalLight>(null)
  const sunTarget = useMemo(() => {
    const target = new THREE.Object3D()
    target.position.set(2.72, 0.08, -0.95)
    return target
  }, [])

  useEffect(() => {
    if (isNight || !sunRef.current) return

    sunRef.current.target = sunTarget
    sunRef.current.target.updateMatrixWorld()
  }, [isNight, sunTarget])

  return (
    <>
      {!isNight && <primitive object={sunTarget} />}
      <ambientLight intensity={isNight ? 0.24 : 0.66} color={isNight ? '#b8a59d' : '#d6d0d3'} />
      <hemisphereLight
        intensity={isNight ? 0.3 : 0.86}
        color={isNight ? '#d0c2ba' : '#eceaf0'}
        groundColor={isNight ? '#35242a' : '#3c3438'}
      />
      {!isNight && (
        <>
          <directionalLight
            ref={sunRef}
            castShadow
            color="#fff1e8"
            intensity={5.45}
            position={[-6.5, 9.05, 9]}
            shadow-camera-far={18}
            shadow-camera-left={-5.8}
            shadow-camera-right={5.8}
            shadow-camera-top={5.8}
            shadow-camera-bottom={-5.8}
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.00003}
            shadow-normalBias={0.024}
            shadow-radius={3}
          />
          <pointLight intensity={0.48} color="#d8cdd5" position={[4.8, 1.55, 1.45]} distance={6.2} decay={2} />
        </>
      )}
      {isNight && <NightLanternLighting />}
    </>
  )
}

function BookFocusCamera({ active }: { active: boolean }) {
  const { camera } = useThree()
  const bookCameraPosition = useMemo(() => new THREE.Vector3(...BOOK_CAMERA_POSITION), [])
  const bookCameraTarget = useMemo(() => new THREE.Vector3(...BOOK_CAMERA_TARGET), [])
  const currentTarget = useRef(new THREE.Vector3(...CAMERA_START_TARGET))
  const wasActive = useRef(false)
  const currentDirection = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    if (!active) {
      wasActive.current = false
      return
    }

    if (!wasActive.current) {
      camera.getWorldDirection(currentDirection)
      currentTarget.current.copy(camera.position).add(currentDirection.multiplyScalar(camera.position.distanceTo(bookCameraTarget)))
      wasActive.current = true
    }

    if (!active) return

    const damping = 1 - Math.exp(-4.2 * delta)
    camera.position.lerp(bookCameraPosition, damping)
    currentTarget.current.lerp(bookCameraTarget, damping)
    camera.lookAt(currentTarget.current)
  })

  return null
}

function MemoryBookInteraction({
  onOpen,
}: {
  onOpen: () => void
}) {
  return (
    <group name="memory-book-interaction">
      <mesh
        name="memory-book-hitbox"
        position={[1.18, 0.93, 0.02]}
        onClick={(event) => {
          event.stopPropagation()
          onOpen()
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = ''
        }}
      >
        <boxGeometry args={[0.8, 0.24, 0.62]} />
        <meshBasicMaterial depthWrite={false} opacity={0} transparent />
      </mesh>
    </group>
  )
}

function FixedPositionLookControls({ viewMode }: { viewMode: ViewMode }) {
  const { camera, gl } = useThree()
  const cameraPosition = useMemo(() => new THREE.Vector3(...CAMERA_START_POSITION), [])
  const initialTarget = useMemo(() => new THREE.Vector3(...CAMERA_START_TARGET), [])
  const baseLookDirection = useMemo(() => initialTarget.clone().sub(cameraPosition).normalize(), [cameraPosition, initialTarget])
  const yAxis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const lookDirection = useMemo(() => new THREE.Vector3(), [])
  const lookTarget = useMemo(() => new THREE.Vector3(), [])
  const dragState = useRef({
    currentYaw: 0,
    lastX: 0,
    pointerId: null as number | null,
    targetYaw: 0,
  })

  useEffect(() => {
    camera.position.copy(cameraPosition)
    camera.lookAt(initialTarget)
  }, [camera, cameraPosition, initialTarget])

  useEffect(() => {
    const element = gl.domElement

    const handlePointerDown = (event: PointerEvent) => {
      if (viewMode !== 'room') return
      if (event.button !== 0) return

      dragState.current.pointerId = event.pointerId
      dragState.current.lastX = event.clientX
      element.setPointerCapture?.(event.pointerId)
      event.preventDefault()
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (viewMode !== 'room') return
      if (dragState.current.pointerId !== event.pointerId) return

      const deltaX = event.clientX - dragState.current.lastX
      dragState.current.lastX = event.clientX
      dragState.current.targetYaw = THREE.MathUtils.clamp(
        dragState.current.targetYaw - deltaX * LOOK_DRAG_SENSITIVITY,
        -LOOK_DRAG_LIMIT,
        LOOK_DRAG_LIMIT,
      )
    }

    const releasePointer = (event: PointerEvent) => {
      if (viewMode !== 'room') return
      if (dragState.current.pointerId !== event.pointerId) return

      element.releasePointerCapture?.(event.pointerId)
      dragState.current.pointerId = null
    }

    const preventZoom = (event: WheelEvent) => {
      event.preventDefault()
    }

    element.addEventListener('pointerdown', handlePointerDown)
    element.addEventListener('pointermove', handlePointerMove)
    element.addEventListener('pointerup', releasePointer)
    element.addEventListener('pointercancel', releasePointer)
    element.addEventListener('wheel', preventZoom, { passive: false })

    return () => {
      element.removeEventListener('pointerdown', handlePointerDown)
      element.removeEventListener('pointermove', handlePointerMove)
      element.removeEventListener('pointerup', releasePointer)
      element.removeEventListener('pointercancel', releasePointer)
      element.removeEventListener('wheel', preventZoom)
    }
  }, [gl, viewMode])

  useFrame((_, delta) => {
    if (viewMode !== 'room') return

    const state = dragState.current
    state.currentYaw = THREE.MathUtils.damp(state.currentYaw, state.targetYaw, 10, delta)

    lookDirection.copy(baseLookDirection).applyAxisAngle(yAxis, state.currentYaw)
    lookTarget.copy(cameraPosition).add(lookDirection)
    camera.position.copy(cameraPosition)
    camera.lookAt(lookTarget)
  })

  return null
}

function AppIntroOverlay({
  onPlaybackComplete,
  ready,
}: {
  onPlaybackComplete: () => void
  ready: boolean
}) {
  const [introFinished, setIntroFinished] = useState(false)
  const [minimumElapsed, setMinimumElapsed] = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)
  const [visible, setVisible] = useState(true)
  const shouldReveal = ready && minimumElapsed && introFinished
  const completeIntroPlayback = useCallback(() => {
    setIntroFinished((current) => {
      if (!current) {
        onPlaybackComplete()
      }

      return true
    })
  }, [onPlaybackComplete])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMinimumElapsed(true)
    }, INTRO_MIN_VISIBLE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    if (introFinished) return

    const timer = window.setTimeout(() => {
      completeIntroPlayback()
    }, INTRO_VIDEO_FALLBACK_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [completeIntroPlayback, introFinished])

  useEffect(() => {
    if (!shouldReveal) return

    const timer = window.setTimeout(() => {
      setVisible(false)
    }, INTRO_REVEAL_DURATION_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [shouldReveal])

  if (!visible) return null

  return (
    <div className={shouldReveal ? 'app-intro is-revealing' : 'app-intro'} aria-hidden="true">
      <video
        className={videoVisible ? 'app-intro__video is-visible' : 'app-intro__video'}
        autoPlay
        disablePictureInPicture
        muted
        playsInline
        preload="auto"
        src={INTRO_VIDEO_URL}
        onLoadedData={() => {
          setVideoVisible(true)
        }}
        onCanPlay={(event) => {
          const playPromise = event.currentTarget.play()
          if (playPromise) {
            playPromise.catch(() => {
              completeIntroPlayback()
            })
          }
        }}
        onPlaying={() => {
          setVideoVisible(true)
        }}
        onEnded={() => {
          completeIntroPlayback()
        }}
        onError={() => {
          completeIntroPlayback()
        }}
      />
    </div>
  )
}

function App() {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day')
  const [viewMode, setViewMode] = useState<ViewMode>('room')
  const [introPlaybackDone, setIntroPlaybackDone] = useState(EMBEDDED)
  const [sceneReady, setSceneReady] = useState(false)
  const isNight = timeOfDay === 'night'
  const isBookOpen = viewMode === 'book'
  const shouldMountScene = introPlaybackDone
  const handleIntroPlaybackComplete = useCallback(() => {
    setIntroPlaybackDone(true)
  }, [])
  const handleSceneReady = useCallback(() => {
    setSceneReady(true)
    if (EMBEDDED) notifyEmbed('damso-room-ready')
  }, [])
  const handleOpenMemoryStory = (story: MemoryPhotoStory) => {
    void story
  }

  return (
    <main className={isNight ? 'room-viewer is-night' : 'room-viewer'}>
      {shouldMountScene && (
        <Canvas
          className="room-viewer__canvas"
          camera={{ position: CAMERA_START_POSITION, fov: 66, near: 0.05, far: 120 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = DAY_EXPOSURE
            gl.shadowMap.type = THREE.PCFSoftShadowMap
          }}
          shadows={{ type: THREE.PCFSoftShadowMap }}
        >
          <color attach="background" args={[isNight ? '#191921' : '#353238']} />
          <SceneExposure timeOfDay={timeOfDay} />
          <LibraryLighting timeOfDay={timeOfDay} />
          <BookshelfBarLight timeOfDay={timeOfDay} />
          {!isNight && <MorningWindowBackdrop />}
          {isNight && <NightWindowBackdrop />}
          <Suspense fallback={null}>
            <RoomModel onReady={handleSceneReady} timeOfDay={timeOfDay} />
            <MemoryPhotoFrames onOpenStory={handleOpenMemoryStory} />
            <MemoryBookInteraction
              onOpen={() => {
                setViewMode('book')
              }}
            />
          </Suspense>
          <FixedPositionLookControls viewMode={viewMode} />
          <BookFocusCamera active={isBookOpen} />
        </Canvas>
      )}

      <div className="room-viewer__glare" aria-hidden="true" />
      {!EMBEDDED && <AppIntroOverlay onPlaybackComplete={handleIntroPlaybackComplete} ready={sceneReady} />}

      <button
        className={isNight ? 'time-toggle is-night' : 'time-toggle'}
        type="button"
        aria-label={isNight ? '낮 시간대로 전환' : '밤 시간대로 전환'}
        title={isNight ? '낮 시간대로 전환' : '밤 시간대로 전환'}
        onClick={() => {
          setTimeOfDay((current) => (current === 'day' ? 'night' : 'day'))
        }}
      >
        <span className="time-toggle__icon" aria-hidden="true" />
        <span className="sr-only">{isNight ? '낮' : '밤'}</span>
      </button>

      {isBookOpen && (
        <button
          className="book-close-button"
          type="button"
          aria-label="책 닫기"
          title="책 닫기"
          onClick={() => {
            setViewMode('room')
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      )}

    </main>
  )
}

export default App
