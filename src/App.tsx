import { useCallback, useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, Polyline } from "react-leaflet"
import "./App.css"
import "leaflet/dist/leaflet.css"

// @ts-expect-error - didn't figure out types for this yet
import { drives, request } from "@commaai/api/"

interface Segment {
  start_lat: number
  start_lng: number
  end_lat: number
  end_lng: number
  start_time_utc_millis: number
  end_time_utc_millis: number
  color: string
  path: [number, number][]
}

function App() {
  // const token = import.meta.env.VITE_COMMA_JWT_TOKEN
  const token = ""
  const dongleId = "96850532278bae3b"

  const colors = useMemo(
    () => [
      "#FF0000",
      "#00FF00",
      "#0000FF",
      "#FFFF00",
      "#00FFFF",
      "#FF00FF",
      "#C0C0C0",
      "#808080",
      "#800000",
      "#808000",
      "#008000",
      "#800080",
      "#008080",
      "#000080",
      "#FF6666",
      "#FFCC66",
      "#FFFF66",
      "#CCFF66",
      "#66FF66",
      "#66FFCC",
      "#66FFFF",
      "#66CCFF",
      "#6666FF",
      "#CC66FF",
      "#FF66FF",
      "#FF66CC",
      "#666666",
    ],
    []
  )

  const fromTS = 0
  const toTS = 9999999999999

  const [wasFetched, setWasFetched] = useState(false)
  const [routeSegments, setRouteSegments] = useState<Segment[]>([])
  const [visibleSegments, setVisibleSegments] = useState<
    { color: string; path: [number, number][] }[]
  >([])
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0)
  const [drawingSegment, setDrawingSegment] = useState<[number, number][]>([])
  const [mph, setMph] = useState<number | null>(null)

  useEffect(() => {
    request.configure(token, console.log)
  }, [token])

  const resetData = () => {
    setVisibleSegments([])
    setCurrentSegmentIndex(0)
    setDrawingSegment([])
    setMph(null)
  }

  const fetchData = useCallback(async () => {
    resetData()
    const routeSegmentsData = await drives.getRoutesSegments(
      dongleId,
      fromTS,
      toTS
    )
    setWasFetched(true)
    const coloredRouteSegments = routeSegmentsData
      .reverse()
      .map((segment: Omit<Segment, "color">, index: number) => ({
        ...segment,
        color: colors[index % colors.length],
      }))
    setRouteSegments(coloredRouteSegments)
  }, [colors])

  const haversineDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const R = 3958.8 // Radius of the Earth in miles
    const rlat1 = lat1 * (Math.PI / 180) // Convert degrees to radians
    const rlat2 = lat2 * (Math.PI / 180) // Convert degrees to radians
    const difflat = rlat2 - rlat1 // Radian difference (latitudes)
    const difflon = (lon2 - lon1) * (Math.PI / 180) // Radian difference (longitudes)

    const d =
      2 *
      R *
      Math.asin(
        Math.sqrt(
          Math.sin(difflat / 2) * Math.sin(difflat / 2) +
            Math.cos(rlat1) *
              Math.cos(rlat2) *
              Math.sin(difflon / 2) *
              Math.sin(difflon / 2)
        )
      )
    return d
  }

  useEffect(() => {
    if (
      routeSegments.length > 0 &&
      currentSegmentIndex < routeSegments.length
    ) {
      const segment = routeSegments[currentSegmentIndex]
      const {
        start_lat,
        start_lng,
        end_lat,
        end_lng,
        start_time_utc_millis,
        end_time_utc_millis,
        color,
      } = segment

      const steps = 100
      const durationMillis = end_time_utc_millis - start_time_utc_millis

      // Calculate distance and mph
      const distanceMiles = haversineDistance(
        start_lat,
        start_lng,
        end_lat,
        end_lng
      )
      const durationHours = durationMillis / 3600000
      const segmentMph = distanceMiles / durationHours
      setMph(segmentMph)

      // Normalize durationMillis to a range between minInterval and maxInterval
      const minInterval = 1 // minimum interval time in ms
      const maxInterval = 18 // maximum interval time in ms
      const minDuration = routeSegments.reduce(
        (acc, segment) =>
          Math.min(
            acc,
            segment.end_time_utc_millis - segment.start_time_utc_millis
          ),
        Infinity
      )
      const maxDuration = routeSegments.reduce(
        (acc, segment) =>
          Math.max(
            acc,
            segment.end_time_utc_millis - segment.start_time_utc_millis
          ),
        0
      )
      const normalizedInterval =
        minInterval +
        ((durationMillis - minDuration) * (maxInterval - minInterval)) /
          (maxDuration - minDuration)

      const latStep = (end_lat - start_lat) / steps
      const lngStep = (end_lng - start_lng) / steps

      let step = 0
      const interval = setInterval(() => {
        if (step <= steps) {
          setDrawingSegment((prev) => [
            ...prev,
            [start_lat + latStep * step, start_lng + lngStep * step],
          ])
          step++
        } else {
          clearInterval(interval)
          setVisibleSegments((prev) => [
            ...prev,
            {
              path: [
                [start_lat, start_lng],
                [end_lat, end_lng],
              ],
              color: color,
            },
          ])
          setDrawingSegment([])
          setCurrentSegmentIndex((prevIndex) => prevIndex + 1)
        }
      }, normalizedInterval)

      return () => clearInterval(interval)
    }
  }, [currentSegmentIndex, routeSegments])

  return (
    <>
      <div className="ui-wrapper">
        {mph !== null && (
          <div className="current-mph">
            seg speed: <b>~{mph.toFixed(2)}</b> mph
          </div>
        )}
        <button
          disabled={currentSegmentIndex < routeSegments.length}
          className="button-go"
          tabIndex={1}
          onClick={fetchData}
        >
          {wasFetched ? "reset" : "go"}
        </button>
      </div>
      <MapContainer
        className="map"
        center={[32.737, -117.16]}
        zoom={14}
        scrollWheelZoom={false}
        attributionControl={false}
        markerZoomAnimation
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        {visibleSegments.map((segment, index) => (
          <Polyline
            key={index}
            positions={segment.path}
            color={segment.color}
            weight={8}
          />
        ))}
        {drawingSegment.length > 0 && (
          <Polyline
            positions={drawingSegment}
            color={routeSegments[currentSegmentIndex].color}
            weight={8}
          />
        )}
      </MapContainer>
    </>
  )
}

export default App
