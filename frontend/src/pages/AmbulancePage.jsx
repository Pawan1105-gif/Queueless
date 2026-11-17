import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ambulance,
  ArrowLeft,
  Clock3,
  MapPin,
  Navigation,
  Phone,
  ShieldAlert,
  Signal,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const DISPATCH_PHONE = "8899665510";
const INITIAL_MAP_CENTER = [20, 0];

const demoDrivers = [
  { id: "demo-1", name: "Demo Driver A", vehicle: "Demo Ambulance 01", eta: 5, northKm: 0.55, eastKm: 0.24, x: 68, y: 35 },
  { id: "demo-2", name: "Demo Driver B", vehicle: "Demo Ambulance 02", eta: 9, northKm: -0.75, eastKm: 0.62, x: 37, y: 54 },
  { id: "demo-3", name: "Demo Driver C", vehicle: "Demo Ambulance 03", eta: 13, northKm: 1.3, eastKm: -0.7, x: 76, y: 69 },
  { id: "demo-4", name: "Demo Driver D", vehicle: "Demo Ambulance 04", eta: 18, northKm: -1.65, eastKm: -0.3, x: 22, y: 31 },
  { id: "demo-5", name: "Demo Driver E", vehicle: "Demo Ambulance 05", eta: 24, northKm: 0.25, eastKm: 2.05, x: 53, y: 19 },
];

function haversineKm(from, to) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude))
    * Math.cos(radians(to.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function getDriverCoordinates(origin, driver) {
  const latitude = origin.latitude + driver.northKm / 111;
  const longitudeScale = 111 * Math.max(Math.cos(origin.latitude * Math.PI / 180), 0.01);
  return {
    latitude,
    longitude: origin.longitude + driver.eastKm / longitudeScale,
  };
}

function ProximityMap({ origin, drivers, selectedDriverId }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return undefined;

    const map = L.map(mapContainerRef.current, {
      scrollWheelZoom: true,
    }).setView(INITIAL_MAP_CENTER, 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    markerLayerRef.current?.remove();
    markerLayerRef.current = null;
    if (!origin) return undefined;

    const markerLayer = L.layerGroup().addTo(map);
    markerLayerRef.current = markerLayer;
    const originPoint = [origin.latitude, origin.longitude];
    L.circleMarker(originPoint, {
      color: "#fff",
      weight: 3,
      fillColor: "#2457d6",
      fillOpacity: 1,
      radius: 9,
    }).bindPopup("Your location (kept in this browser)").addTo(markerLayer);

    for (const driver of drivers) {
      const location = getDriverCoordinates(origin, driver);
      const point = [location.latitude, location.longitude];
      L.circleMarker(point, {
        color: "#fff",
        weight: 2,
        fillColor: selectedDriverId === driver.id ? "#8e2d38" : "#c94f57",
        fillOpacity: 1,
        radius: selectedDriverId === driver.id ? 9 : 7,
      })
        .bindPopup(`${driver.name} — fictional demo vehicle, not a live ambulance`)
        .addTo(markerLayer);
    }

    const selectedDriver = drivers.find((driver) => driver.id === selectedDriverId);
    if (selectedDriver) {
      const selectedLocation = getDriverCoordinates(origin, selectedDriver);
      map.flyTo(
        [selectedLocation.latitude, selectedLocation.longitude],
        Math.max(map.getZoom(), 14),
        { duration: 0.5 },
      );
    } else {
      map.flyTo(originPoint, Math.max(map.getZoom(), 14), { duration: 0.5 });
    }

    return () => {
      markerLayer.remove();
      if (markerLayerRef.current === markerLayer) markerLayerRef.current = null;
    };
  }, [drivers, origin, selectedDriverId]);

  return (
    <div
      aria-label="Interactive OpenStreetMap with a local user marker and simulated ambulance markers"
      className="ambulance-map"
      ref={mapContainerRef}
      role="application"
    />
  );
}

export default function AmbulancePage() {
  const [origin, setOrigin] = useState(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [contactDriver, setContactDriver] = useState(null);
  const [locating, setLocating] = useState(false);
  const contactDialogRef = useRef(null);
  const locationRequestStartedRef = useRef(false);

  const useCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser. Showing sample distances.");
      return;
    }

    setLocating(true);
    setLocationMessage("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setOrigin({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationMessage("Distances are calculated in this browser. OpenStreetMap receives map-tile requests for the area you view; your exact coordinates are not sent as a separate location request.");
        setLocating(false);
      },
      () => {
        setLocationMessage("Location permission was not granted. Showing sample distances instead.");
        setLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);

  useEffect(() => {
    if (locationRequestStartedRef.current) return;
    locationRequestStartedRef.current = true;
    useCurrentLocation();
  }, [useCurrentLocation]);

  useEffect(() => {
    if (!contactDriver) return undefined;
    contactDialogRef.current?.focus();
    function dismissOnEscape(event) {
      if (event.key === "Escape") setContactDriver(null);
    }
    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [contactDriver]);

  const drivers = useMemo(() => demoDrivers
    .map((driver) => {
      if (!origin) return { ...driver, distanceKm: driver.eta / 6 };
      return {
        ...driver,
        distanceKm: haversineKm(origin, getDriverCoordinates(origin, driver)),
      };
    })
    .sort((left, right) => left.distanceKm - right.distanceKm), [origin]);

  function showContact(driver) {
    setSelectedDriverId(driver.id);
    setContactDriver(driver);
  }

  return (
    <section className="content-stack ambulance-page">
      <Link className="subtle-link ambulance-back" to="/dashboard"><ArrowLeft size={15} /> Back to dashboard</Link>
      <div className="ambulance-heading">
        <div>
          <p className="eyebrow">QueueLess sample directory</p>
          <h1><Ambulance size={27} /> Ambulance service demo</h1>
          <p>Browse a simulated list of available vehicles ordered by distance.</p>
        </div>
        <button className="button button-quiet" type="button" onClick={useCurrentLocation} disabled={locating}>
          <Navigation size={16} /> {locating ? "Finding location…" : "Use my location"}
        </button>
      </div>

      <div className="ambulance-safety" role="alert">
        <ShieldAlert size={20} />
        <p><strong>Demo directory—not an emergency dispatch or booking service.</strong> Driver identities, availability, positions, distances, and ETAs are simulated. The displayed phone number is a shared contact and does not connect to a listed driver. In an emergency, call your local emergency services directly.</p>
      </div>
      {locationMessage && <p className="ambulance-location-message" role="status">{locationMessage}</p>}

      <div className="ambulance-layout">
        <section className="panel ambulance-driver-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Sorted nearest first</p><h2>Available demo drivers</h2></div>
            <span className="status-pill status-active">{drivers.length} simulated</span>
          </div>
          <div className="ambulance-driver-list">
            {drivers.map((driver, index) => (
              <article className={`ambulance-driver${selectedDriverId === driver.id ? " is-selected" : ""}`} key={driver.id}>
                <span className="ambulance-driver-rank">{index + 1}</span>
                <span className="ambulance-driver-icon"><Ambulance size={19} /></span>
                <div className="ambulance-driver-details">
                  <strong>{driver.name}</strong>
                  <span>{driver.vehicle} · fictional</span>
                  <div className="ambulance-driver-meta">
                    <span><MapPin size={13} /> {driver.distanceKm.toFixed(1)} km</span>
                    <span><Clock3 size={13} /> ~{driver.eta} min</span>
                    <span><Signal size={13} /> Demo available</span>
                  </div>
                </div>
                <button className="button button-quiet ambulance-contact" type="button" onClick={() => showContact(driver)}>
                  <Phone size={15} /> Contact
                </button>
              </article>
            ))}
          </div>
          <p className="estimate-disclaimer">Distance and arrival time are estimates for this demo only, not a real vehicle location or response time.</p>
        </section>

        <aside className="panel ambulance-map-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Nearby overview</p><h2>Demo area map</h2></div>
            <span className="map-demo-tag"><AlertTriangle size={13} /> Simulated</span>
          </div>
          <ProximityMap origin={origin} drivers={drivers} selectedDriverId={selectedDriverId} />
          {!origin && <p className="ambulance-map-help">{locating ? "Finding your location and centering the map…" : <>Location could not be found automatically. Select <strong>Use my location</strong> to try again.</>} You can also pan and zoom the map.</p>}
          <p className="ambulance-map-caption">Real map tiles by OpenStreetMap. Vehicle markers remain simulated and do not show live ambulance locations.</p>
        </aside>
      </div>

      {contactDriver && (
        <div
          className="ambulance-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setContactDriver(null);
          }}
        >
          <section
            aria-labelledby="ambulance-contact-title"
            aria-modal="true"
            className="ambulance-contact-dialog"
            ref={contactDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <button
              aria-label="Close contact details"
              className="icon-button ambulance-dialog-close"
              onClick={() => setContactDriver(null)}
              type="button"
            >
              <X size={18} />
            </button>
            <span className="ambulance-dialog-icon"><Phone size={21} /></span>
            <p className="eyebrow">Shared contact number</p>
            <h2 id="ambulance-contact-title">Contact for {contactDriver.name}</h2>
            <p className="ambulance-dialog-note">
              This is the shared provider contact, not a direct line to the fictional demo driver.
              No booking or dispatch request is created by QueueLess.
            </p>
            <a className="ambulance-phone-number" href={`tel:${DISPATCH_PHONE}`}>{DISPATCH_PHONE}</a>
            <a className="button button-primary ambulance-call-button" href={`tel:${DISPATCH_PHONE}`}>
              <Phone size={16} /> Call {DISPATCH_PHONE}
            </a>
            <button
              className="button button-quiet ambulance-dismiss"
              onClick={() => setContactDriver(null)}
              type="button"
            >
              Close
            </button>
          </section>
        </div>
      )}
    </section>
  );
}
