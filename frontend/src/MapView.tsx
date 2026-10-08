import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LocateFixed, Plus, Minus } from 'lucide-react'
import type { RiskCategory, RiskLayer } from './types'
import { CATEGORY_COLORS, categoryForScore } from './types'

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'paper', type: 'background', paint: { 'background-color': '#eef3f5' } },
    { id: 'streets', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.72 } },
  ],
}

maplibregl.setWorkerUrl(workerUrl)

interface Props {
  layer: RiskLayer
  selectedId: string | null
  onSelect: (cellId: string) => void
}

interface HoverInfo {
  x: number
  y: number
  cellId: string
  score: number
  category: RiskCategory
}

const CHENNAI_BOUNDS: [[number, number], [number, number]] = [
  [80.135, 12.845],
  [80.335, 13.24],
]

export default function MapView({ layer, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)

  const handleRecenter = useCallback(() => {
    mapRef.current?.fitBounds(CHENNAI_BOUNDS, { padding: 40, duration: 600 })
  }, [])

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 300 })
  }, [])

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 300 })
  }, [])

  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: BASE_STYLE,
      center: [80.24, 13.05],
      zoom: 10.8,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      map.addSource('susceptibility', { type: 'geojson', data: layer, promoteId: 'cell_id' })

      map.addLayer({
        id: 'susceptibility-fill',
        type: 'fill',
        source: 'susceptibility',
        paint: {
          'fill-color': [
            'step', ['get', 'susceptibility_score'],
            CATEGORY_COLORS.Low,
            0.25, CATEGORY_COLORS.Moderate,
            0.5, CATEGORY_COLORS.High,
            0.75, CATEGORY_COLORS['Very High'],
          ],
          'fill-opacity': 0.74,
        },
      })

      map.addLayer({
        id: 'cell-lines',
        type: 'line',
        source: 'susceptibility',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.35,
          'line-opacity': 0.45,
        },
      })

      map.addLayer({
        id: 'selected-cell-halo',
        type: 'line',
        source: 'susceptibility',
        filter: ['==', ['get', 'cell_id'], ''],
        paint: {
          'line-color': '#ffffff',
          'line-width': 6,
          'line-opacity': 0.95,
        },
      })

      map.addLayer({
        id: 'selected-cell',
        type: 'line',
        source: 'susceptibility',
        filter: ['==', ['get', 'cell_id'], ''],
        paint: {
          'line-color': '#091e30',
          'line-width': 2.8,
          'line-opacity': 1,
        },
      })

      map.on('click', 'susceptibility-fill', (event) => {
        const feature = event.features?.[0]
        const cellId = feature?.properties?.cell_id
        if (typeof cellId === 'string') {
          onSelect(cellId)
          if (feature?.properties?.longitude && feature?.properties?.latitude) {
            map.easeTo({
              center: [feature.properties.longitude, feature.properties.latitude],
              duration: 400,
            })
          }
        }
      })

      map.on('mousemove', 'susceptibility-fill', (event) => {
        const feature = event.features?.[0]
        if (feature?.properties) {
          const score = Number(feature.properties.susceptibility_score)
          setHoverInfo({
            x: event.point.x,
            y: event.point.y,
            cellId: feature.properties.cell_id,
            score,
            category: categoryForScore(score),
          })
          map.getCanvas().style.cursor = 'pointer'
        }
      })

      map.on('mouseleave', 'susceptibility-fill', () => {
        setHoverInfo(null)
        map.getCanvas().style.cursor = ''
      })

      map.fitBounds(CHENNAI_BOUNDS, { padding: 36, duration: 0 })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [layer, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer('selected-cell')) {
      const filter: maplibregl.FilterSpecification = ['==', ['get', 'cell_id'], selectedId ?? '']
      map.setFilter('selected-cell', filter)
      map.setFilter('selected-cell-halo', filter)

      if (selectedId) {
        const selectedFeature = layer.features.find((f) => f.properties.cell_id === selectedId)
        if (selectedFeature?.properties) {
          map.easeTo({
            center: [selectedFeature.properties.longitude, selectedFeature.properties.latitude],
            duration: 500,
          })
        }
      }
    }
  }, [selectedId, layer])

  return (
    <div className="map-shell">
      <div ref={container} className="map-canvas" aria-label="Interactive map of Chennai flood susceptibility cells" />

      {/* Floating map controls */}
      <div className="map-floating-controls" aria-label="Map navigation controls">
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus size={16} />
        </button>
        <div className="map-control-separator" />
        <button
          type="button"
          className="map-control-btn"
          onClick={handleRecenter}
          title="Reset to Chennai bounds"
          aria-label="Reset to Chennai bounds"
        >
          <LocateFixed size={16} />
        </button>
      </div>

      {/* Map status tag */}
      <div className="map-top-pill">
        <span className="pill-dot" />
        <span className="pill-title">2015 Flood Inundation Benchmark</span>
        <span className="pill-divider">·</span>
        <span className="pill-count">{layer.features.length.toLocaleString()} Scored Cells</span>
      </div>

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="map-tooltip"
          style={{
            left: `${hoverInfo.x + 14}px`,
            top: `${hoverInfo.y - 12}px`,
          }}
          role="tooltip"
        >
          <div className="tooltip-head">
            <span className="tooltip-id">{hoverInfo.cellId}</span>
            <span
              className="tooltip-badge"
              style={{
                backgroundColor: `${CATEGORY_COLORS[hoverInfo.category]}22`,
                color: CATEGORY_COLORS[hoverInfo.category],
                borderColor: `${CATEGORY_COLORS[hoverInfo.category]}55`,
              }}
            >
              {hoverInfo.category}
            </span>
          </div>
          <div className="tooltip-score">
            <span>Score:</span>
            <strong>{hoverInfo.score.toFixed(3)}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
