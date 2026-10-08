import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LocateFixed, Plus, Minus, Layers } from 'lucide-react'
import type { LayerToggleState, RiskFilterState, RiskLayer } from './types'
import { CATEGORY_COLORS, categoryForScore } from './types'

maplibregl.setWorkerUrl(workerUrl)

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics',
    },
    labels: {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'satellite-layer', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 0.95 } },
    { id: 'labels-layer', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.85 } },
  ],
}

const STREET_STYLE: StyleSpecification = {
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
    { id: 'streets-layer', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.85 } },
  ],
}

interface Props {
  layer: RiskLayer
  selectedId: string | null
  onSelect: (cellId: string) => void
  layerToggles: LayerToggleState
  riskFilters: RiskFilterState
}

interface HoverInfo {
  x: number
  y: number
  cellId: string
  score: number
  category: string
}

const CHENNAI_BOUNDS: [[number, number], [number, number]] = [
  [80.11, 12.83],
  [80.35, 13.25],
]

export default function MapView({
  layer,
  selectedId,
  onSelect,
  layerToggles,
  riskFilters,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
  const [basemap, setBasemap] = useState<'satellite' | 'street'>('satellite')

  const handleRecenter = useCallback(() => {
    mapRef.current?.fitBounds(CHENNAI_BOUNDS, { padding: 40, duration: 600 })
  }, [])

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 300 })
  }, [])

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 300 })
  }, [])

  // Initialize Map
  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: basemap === 'satellite' ? SATELLITE_STYLE : STREET_STYLE,
      center: [80.24, 13.06],
      zoom: 11.2,
      minZoom: 9,
      maxZoom: 17,
      attributionControl: false,
    })
    mapRef.current = map

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      map.addSource('susceptibility', {
        type: 'geojson',
        data: layer,
        promoteId: 'cell_id',
      })

      // Fill Layer for Risk Heat Grid
      map.addLayer({
        id: 'susceptibility-fill',
        type: 'fill',
        source: 'susceptibility',
        paint: {
          'fill-color': [
            'step',
            ['get', 'susceptibility_score'],
            CATEGORY_COLORS.Low,
            0.25,
            CATEGORY_COLORS.Moderate,
            0.5,
            CATEGORY_COLORS.High,
            0.75,
            CATEGORY_COLORS.Critical,
          ],
          'fill-opacity': layerToggles.floodRisk ? 0.72 : 0,
        },
      })

      // Cell border grid
      map.addLayer({
        id: 'cell-lines',
        type: 'line',
        source: 'susceptibility',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.45,
          'line-opacity': 0.35,
        },
      })

      // Water Proximity Accent Layer (when waterBodies toggle is on)
      map.addLayer({
        id: 'water-proximity-glow',
        type: 'line',
        source: 'susceptibility',
        filter: ['<', ['get', 'driver_1_value'], 500],
        paint: {
          'line-color': '#38bdf8',
          'line-width': 1.5,
          'line-opacity': layerToggles.waterBodies ? 0.6 : 0,
        },
      })

      // Selected Cell Outline Glow
      map.addLayer({
        id: 'selected-cell-halo',
        type: 'line',
        source: 'susceptibility',
        filter: ['==', ['get', 'cell_id'], ''],
        paint: {
          'line-color': '#a855f7',
          'line-width': 5,
          'line-opacity': 0.9,
        },
      })

      // Selected Cell Inner Stroke
      map.addLayer({
        id: 'selected-cell',
        type: 'line',
        source: 'susceptibility',
        filter: ['==', ['get', 'cell_id'], ''],
        paint: {
          'line-color': '#ffffff',
          'line-width': 2.5,
          'line-opacity': 1,
        },
      })

      // Interactive Events
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
  }, [basemap, layer, onSelect])

  // Update selected cell highlight
  useEffect(() => {
    const map = mapRef.current
    if (map?.getLayer('selected-cell')) {
      const filter: maplibregl.FilterSpecification = ['==', ['get', 'cell_id'], selectedId ?? '']
      map.setFilter('selected-cell', filter)
      map.setFilter('selected-cell-halo', filter)

      if (selectedId) {
        const feature = layer.features.find((f) => f.properties.cell_id === selectedId)
        if (feature?.properties?.longitude && feature?.properties?.latitude) {
          map.easeTo({
            center: [feature.properties.longitude, feature.properties.latitude],
            duration: 500,
            zoom: Math.max(map.getZoom(), 12.5),
          })
        }
      }
    }
  }, [selectedId, layer])

  // Update Risk Filters (Critical, High, Moderate, Low)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('susceptibility-fill')) return

    const conditions: unknown[] = ['any']
    if (riskFilters.low) {
      conditions.push(['<', ['get', 'susceptibility_score'], 0.25])
    }
    if (riskFilters.moderate) {
      conditions.push([
        'all',
        ['>=', ['get', 'susceptibility_score'], 0.25],
        ['<', ['get', 'susceptibility_score'], 0.5],
      ])
    }
    if (riskFilters.high) {
      conditions.push([
        'all',
        ['>=', ['get', 'susceptibility_score'], 0.5],
        ['<', ['get', 'susceptibility_score'], 0.75],
      ])
    }
    if (riskFilters.critical) {
      conditions.push(['>=', ['get', 'susceptibility_score'], 0.75])
    }

    const filterSpec: maplibregl.FilterSpecification =
      conditions.length > 1 ? (conditions as maplibregl.FilterSpecification) : ['==', '1', '2']

    map.setFilter('susceptibility-fill', filterSpec)
    map.setFilter('cell-lines', filterSpec)
  }, [riskFilters])

  // Update Layer Toggles (Flood Risk visibility, Water bodies highlight)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (map.getLayer('susceptibility-fill')) {
      map.setPaintProperty(
        'susceptibility-fill',
        'fill-opacity',
        layerToggles.floodRisk ? 0.74 : 0.05
      )
    }
    if (map.getLayer('water-proximity-glow')) {
      map.setPaintProperty(
        'water-proximity-glow',
        'line-opacity',
        layerToggles.waterBodies ? 0.75 : 0
      )
    }
  }, [layerToggles])

  const selectedFeature = selectedId
    ? layer.features.find((f) => f.properties.cell_id === selectedId)
    : null

  return (
    <div className="map-view-wrapper" ref={container}>
      {/* Floating Map Controls */}
      <div className="map-floating-controls">
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomIn}
          title="Zoom In"
          aria-label="Zoom In"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleZoomOut}
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="map-control-btn"
          onClick={handleRecenter}
          title="Reset to Full Chennai View"
          aria-label="Reset to Full Chennai View"
        >
          <LocateFixed size={16} />
        </button>
        <button
          type="button"
          className={`map-control-btn ${basemap === 'satellite' ? 'active-basemap' : ''}`}
          onClick={() => setBasemap((b) => (b === 'satellite' ? 'street' : 'satellite'))}
          title="Toggle Satellite / Street Basemap"
          aria-label="Toggle Basemap"
        >
          <Layers size={16} />
        </button>
      </div>

      {/* Selected Cell Marker Tag (Image 1 Callout) */}
      {selectedFeature && (
        <div className="map-selected-callout">
          <div className="callout-header">
            <span className="callout-indicator" />
            <strong>Cell {selectedFeature.properties.cell_id}</strong>
          </div>
          <div className="callout-score">
            Risk: <strong>{selectedFeature.properties.susceptibility_score.toFixed(2)}</strong> (
            {categoryForScore(selectedFeature.properties.susceptibility_score)})
          </div>
        </div>
      )}

      {/* Map Legend Overlay matching Image 1 */}
      <div className="map-legend-overlay">
        <div className="legend-title">Flood Risk (ML Prediction)</div>
        <div className="legend-gradient-bar" />
        <div className="legend-labels">
          <span>Low</span>
          <span>Moderate</span>
          <span>High</span>
          <span>Critical</span>
        </div>
        <div className="legend-scale-bar">
          <div className="scale-line" />
          <div className="scale-notches">
            <span>0</span>
            <span>2.5</span>
            <span>5 km</span>
          </div>
        </div>
      </div>

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="map-tooltip"
          style={{
            left: `${hoverInfo.x + 14}px`,
            top: `${hoverInfo.y - 12}px`,
          }}
        >
          <div className="tooltip-cell-id">{hoverInfo.cellId}</div>
          <div className="tooltip-score">
            Score: <strong>{hoverInfo.score.toFixed(3)}</strong>
          </div>
          <div
            className="tooltip-badge"
            style={{
              backgroundColor: CATEGORY_COLORS[hoverInfo.category] ?? '#0d9488',
            }}
          >
            {hoverInfo.category}
          </div>
        </div>
      )}
    </div>
  )
}
