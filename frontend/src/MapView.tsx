import { useCallback, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { LocateFixed, Plus, Minus, Layers, Search, ChevronDown, Check } from 'lucide-react'
import type { RiskFilterState, RiskLayer } from './types'
import { CATEGORY_COLORS, categoryForScore } from './types'

maplibregl.setWorkerUrl(workerUrl)

// Clean, high-legibility light street map matching Image 1
const LIGHT_STREET_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'osm-layer', type: 'raster', source: 'osm', paint: { 'raster-opacity': 0.88 } },
  ],
}

// Satellite imagery for terrain inspection
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

interface Props {
  layer: RiskLayer
  selectedId: string | null
  onSelect: (cellId: string) => void
  showSusceptibilityGrid: boolean
  riskFilters: RiskFilterState
  onToggleFilterMenu?: () => void
}

interface HoverInfo {
  x: number
  y: number
  cellId: string
  score: number
  category: string
}

// Exact bounding box of the 7,227 Chennai grid cells: [80.140, 12.852] to [80.331, 13.235]
// Tight padding ensures the flood susceptibility layer prominently frames the viewport
const CHENNAI_EXACT_BOUNDS: [[number, number], [number, number]] = [
  [80.136, 12.847],
  [80.335, 13.239],
]

export default function MapView({
  layer,
  selectedId,
  onSelect,
  showSusceptibilityGrid,
  riskFilters,
}: Props) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null)
  const [basemap, setBasemap] = useState<'street' | 'satellite'>('street')
  const [searchQuery, setSearchQuery] = useState('')
  const [layerDropdownOpen, setLayerDropdownOpen] = useState(false)

  const handleRecenter = useCallback(() => {
    mapRef.current?.fitBounds(CHENNAI_EXACT_BOUNDS, {
      padding: { top: 35, bottom: 35, left: 25, right: 25 },
      duration: 600,
      maxZoom: 12.8,
    })
  }, [])

  const handleZoomIn = useCallback(() => {
    mapRef.current?.zoomIn({ duration: 300 })
  }, [])

  const handleZoomOut = useCallback(() => {
    mapRef.current?.zoomOut({ duration: 300 })
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    const q = searchQuery.trim().toUpperCase()
    const match = layer.features.find((f) => f.properties.cell_id.toUpperCase().includes(q))
    if (match) {
      onSelect(match.properties.cell_id)
      setSearchQuery('')
    }
  }

  // Update or render the prominent vector Location Pin Marker matching Image 1
  const updateMarker = useCallback((cellId: string | null) => {
    const map = mapRef.current
    if (!map) return

    if (!cellId) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return
    }

    const feature = layer.features.find((f) => f.properties.cell_id === cellId)
    if (!feature?.properties?.longitude || !feature?.properties?.latitude) {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      return
    }

    const coords: [number, number] = [feature.properties.longitude, feature.properties.latitude]

    if (!markerRef.current) {
      const el = document.createElement('div')
      el.className = 'selected-location-pin-marker'
      el.innerHTML = `
        <div class="pin-marker-inner" title="Selected Location: ${cellId}">
          <svg width="26" height="34" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.37258 0 0 5.37258 0 12C0 19.5 12 32 12 32C12 32 24 19.5 24 12C24 5.37258 18.6274 0 12 0Z" fill="#2563EB"/>
            <circle cx="12" cy="11" r="4.5" fill="#FFFFFF"/>
          </svg>
        </div>
      `
      markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(coords)
        .addTo(map)
    } else {
      markerRef.current.setLngLat(coords)
    }
  }, [layer])

  // Initialize MapLibre
  useEffect(() => {
    if (!container.current) return
    const map = new maplibregl.Map({
      container: container.current,
      style: basemap === 'street' ? LIGHT_STREET_STYLE : SATELLITE_STYLE,
      center: [80.236, 13.044],
      zoom: 11.8,
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

      // Fill Layer for Risk Heat Grid (Actual 250m XGBoost Scored Polygons)
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
          'fill-opacity': showSusceptibilityGrid ? 0.65 : 0,
        },
      })

      // Cell border grid lines
      map.addLayer({
        id: 'cell-lines',
        type: 'line',
        source: 'susceptibility',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.5,
          'line-opacity': showSusceptibilityGrid ? 0.45 : 0,
        },
      })

      // Selected Cell Tint Fill (Translucent blue overlay)
      map.addLayer({
        id: 'selected-cell-fill-highlight',
        type: 'fill',
        source: 'susceptibility',
        filter: ['==', ['get', 'cell_id'], selectedId ?? ''],
        paint: {
          'fill-color': '#2563EB',
          'fill-opacity': 0.32,
        },
      })

      // Selected Cell Outer Halo (Thick #1E40AF stroke)
      map.addLayer({
        id: 'selected-cell-halo',
        type: 'line',
        source: 'susceptibility',
        filter: ['==', ['get', 'cell_id'], selectedId ?? ''],
        paint: {
          'line-color': '#1E40AF',
          'line-width': 5.5,
          'line-opacity': 0.95,
        },
      })

      // Selected Cell Inner Crisp White Stroke
      map.addLayer({
        id: 'selected-cell',
        type: 'line',
        source: 'susceptibility',
        filter: ['==', ['get', 'cell_id'], selectedId ?? ''],
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 2.2,
          'line-opacity': 1,
        },
      })

      // Interactive Click & Hover
      map.on('click', 'susceptibility-fill', (event) => {
        const feature = event.features?.[0]
        const cellId = feature?.properties?.cell_id
        if (typeof cellId === 'string') {
          onSelect(cellId)
          if (feature?.properties?.longitude && feature?.properties?.latitude) {
            map.easeTo({
              center: [feature.properties.longitude, feature.properties.latitude],
              duration: 450,
              zoom: Math.max(map.getZoom(), 12.8),
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

      // Immediately render location marker for initial selected cell
      updateMarker(selectedId)

      // Prominently frame the Chennai susceptibility study area
      map.fitBounds(CHENNAI_EXACT_BOUNDS, {
        padding: { top: 35, bottom: 35, left: 25, right: 25 },
        duration: 0,
        maxZoom: 12.8,
      })
    })

    return () => {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
      map.remove()
      mapRef.current = null
    }
  }, [basemap, layer, onSelect, showSusceptibilityGrid, updateMarker])

  // Update selected cell highlight and location pin marker dynamically
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const cellFilter: maplibregl.FilterSpecification = ['==', ['get', 'cell_id'], selectedId ?? '']

    if (map.getLayer('selected-cell')) {
      map.setFilter('selected-cell', cellFilter)
    }
    if (map.getLayer('selected-cell-halo')) {
      map.setFilter('selected-cell-halo', cellFilter)
    }
    if (map.getLayer('selected-cell-fill-highlight')) {
      map.setFilter('selected-cell-fill-highlight', cellFilter)
    }

    updateMarker(selectedId)

    if (selectedId) {
      const feature = layer.features.find((f) => f.properties.cell_id === selectedId)
      if (feature?.properties?.longitude && feature?.properties?.latitude) {
        map.easeTo({
          center: [feature.properties.longitude, feature.properties.latitude],
          duration: 450,
          zoom: Math.max(map.getZoom(), 12.8),
        })
      }
    }
  }, [selectedId, layer, updateMarker])

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

  // Update Grid Visibility Toggle
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (map.getLayer('susceptibility-fill')) {
      map.setPaintProperty(
        'susceptibility-fill',
        'fill-opacity',
        showSusceptibilityGrid ? 0.65 : 0
      )
    }
    if (map.getLayer('cell-lines')) {
      map.setPaintProperty(
        'cell-lines',
        'line-opacity',
        showSusceptibilityGrid ? 0.45 : 0
      )
    }
  }, [showSusceptibilityGrid])

  return (
    <div className="map-canvas-container" ref={container}>
      {/* Top-Left Floating Controls: Search & Layer Pill matching Image 1 */}
      <div className="map-floating-top-left">
        <form onSubmit={handleSearch} className="map-search-pill">
          <Search size={14} className="map-search-icon" />
          <input
            type="text"
            placeholder="Search a cell ID (e.g. C0110_0040)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="map-search-input"
          />
        </form>

        <div className="map-layer-dropdown-wrap">
          <button
            type="button"
            className="map-layer-toggle-btn"
            onClick={() => setLayerDropdownOpen(!layerDropdownOpen)}
          >
            <Layers size={14} />
            <span>Risk layer</span>
            <ChevronDown size={13} />
          </button>

          {layerDropdownOpen && (
            <div className="map-layer-menu">
              <div className="menu-header">Active Risk Grid</div>
              <div className="menu-item active">
                <Check size={14} className="text-blue" />
                <span>250m Susceptibility (7,227 cells)</span>
              </div>
              <div className="menu-divider" />
              <div className="menu-header">Basemap Style</div>
              <button
                type="button"
                className={`menu-item ${basemap === 'street' ? 'active' : ''}`}
                onClick={() => {
                  setBasemap('street')
                  setLayerDropdownOpen(false)
                }}
              >
                {basemap === 'street' && <Check size={14} className="text-blue" />}
                <span>Light Streets</span>
              </button>
              <button
                type="button"
                className={`menu-item ${basemap === 'satellite' ? 'active' : ''}`}
                onClick={() => {
                  setBasemap('satellite')
                  setLayerDropdownOpen(false)
                }}
              >
                {basemap === 'satellite' && <Check size={14} className="text-blue" />}
                <span>Satellite Imagery</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top-Right Floating Controls matching Image 1: Zoom & Recenter */}
      <div className="map-floating-top-right">
        <button
          type="button"
          className="map-tool-btn"
          onClick={handleZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus size={16} />
        </button>
        <button
          type="button"
          className="map-tool-btn"
          onClick={handleZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          className="map-tool-btn"
          onClick={handleRecenter}
          title="Fit Chennai extent"
          aria-label="Fit Chennai extent"
        >
          <LocateFixed size={15} />
        </button>
      </div>

      {/* Bottom-Left Floating Legend matching Image 1 */}
      <div className="map-floating-legend">
        <div className="legend-heading">Flood susceptibility</div>
        <div className="legend-items-list">
          <div className="legend-row">
            <span className="legend-circle" style={{ backgroundColor: CATEGORY_COLORS.Critical }} />
            <span>Critical (&ge; 0.75)</span>
          </div>
          <div className="legend-row">
            <span className="legend-circle" style={{ backgroundColor: CATEGORY_COLORS.High }} />
            <span>High (0.50 – 0.75)</span>
          </div>
          <div className="legend-row">
            <span className="legend-circle" style={{ backgroundColor: CATEGORY_COLORS.Moderate }} />
            <span>Moderate (0.25 – 0.50)</span>
          </div>
          <div className="legend-row">
            <span className="legend-circle" style={{ backgroundColor: CATEGORY_COLORS.Low }} />
            <span>Low (&lt; 0.25)</span>
          </div>
        </div>
      </div>

      {/* Bottom-Right Metadata Stamp matching Image 1 */}
      <div className="map-floating-meta-stamp">
        Chennai GCC · 250m metric grid · EPSG:32644
      </div>

      {/* Hover Tooltip */}
      {hoverInfo && (
        <div
          className="map-hover-card"
          style={{
            left: `${hoverInfo.x + 14}px`,
            top: `${hoverInfo.y - 10}px`,
          }}
        >
          <div className="hover-cell-id">Cell {hoverInfo.cellId}</div>
          <div className="hover-score-row">
            <span>Score: <strong>{hoverInfo.score.toFixed(3)}</strong></span>
            <span
              className="hover-pill"
              style={{
                backgroundColor: `${CATEGORY_COLORS[hoverInfo.category]}18`,
                color: CATEGORY_COLORS[hoverInfo.category],
              }}
            >
              {hoverInfo.category}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
