import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, LocateFixed, MapPin, Navigation, Phone, Pill, Search } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api, { getErrorMessage } from "../services/api.js";

function PharmacyMap({ location, pharmacies, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(
      [location.latitude, location.longitude],
      14,
    );
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [location.latitude, location.longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    markersRef.current?.remove();
    const layer = L.layerGroup().addTo(map);
    markersRef.current = layer;
    L.circleMarker([location.latitude, location.longitude], {
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: "#2457d6",
      fillOpacity: 1,
    }).bindPopup("Your location").addTo(layer);

    pharmacies.forEach((pharmacy) => {
      const marker = L.circleMarker([pharmacy.latitude, pharmacy.longitude], {
        radius: selectedId === pharmacy.id ? 9 : 7,
        color: "#fff",
        weight: 2,
        fillColor: selectedId === pharmacy.id ? "#0b997a" : "#12a88a",
        fillOpacity: 1,
      });
      const popup = document.createElement("span");
      popup.textContent = pharmacy.name;
      marker.bindPopup(popup).on("click", () => onSelect(pharmacy.id)).addTo(layer);
    });

    const selected = pharmacies.find((item) => item.id === selectedId);
    if (selected) map.flyTo([selected.latitude, selected.longitude], Math.max(map.getZoom(), 14), { duration: 0.4 });
    else if (pharmacies.length) {
      map.fitBounds(
        [[location.latitude, location.longitude], ...pharmacies.map((item) => [item.latitude, item.longitude])],
        { padding: [28, 28], maxZoom: 15 },
      );
    } else map.setView([location.latitude, location.longitude], 14);
    return () => {
      layer.remove();
      if (markersRef.current === layer) markersRef.current = null;
    };
  }, [location, onSelect, pharmacies, selectedId]);

  return <div className="pharmacy-map" ref={containerRef} aria-label="Map showing your location and nearby pharmacies" role="application" />;
}

function formatPhoneLink(phone) {
  const normalized = phone.replace(/[^\d+]/g, "");
  return normalized.replace(/(?!^)\+/g, "").length >= 7 ? normalized : "";
}

function directionsUrl(location, pharmacy) {
  const route = `${location.latitude},${location.longitude};${pharmacy.latitude},${pharmacy.longitude}`;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(route)}`;
}

function safeWebsiteUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export default function MedicationSearchPage() {
  const [medications, setMedications] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedMedication, setSelectedMedication] = useState(null);
  const [location, setLocation] = useState(null);
  const [pharmacies, setPharmacies] = useState([]);
  const [registeredStock, setRegisteredStock] = useState([]);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const loadCatalog = useCallback(async () => {
    try {
      const { data } = await api.get("/medications/catalog");
      setMedications(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoadingCatalog(false);
    }
  }, []);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const getCurrentLocation = useCallback(() => new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location services are not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (locationError) => {
        const message = locationError.code === locationError.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access in your browser and try again."
          : locationError.code === locationError.TIMEOUT
            ? "Finding your location timed out. Please try again."
            : "Your location could not be determined. Check location services and try again.";
        reject(new Error(message));
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
  }), []);

  async function useLocation() {
    setLocating(true);
    setError("");
    setStatus("");
    try {
      const currentLocation = await getCurrentLocation();
      setLocation(currentLocation);
      setPharmacies([]);
      setRegisteredStock([]);
      setStatus("Location found. Search to find mapped pharmacies near you.");
    } catch (locationError) {
      setError(locationError.message);
    } finally {
      setLocating(false);
    }
  }

  async function searchNearby() {
    if (!selectedMedication || !location) return;
    setSearching(true);
    setError("");
    setStatus("");
    setPharmacies([]);
    setRegisteredStock([]);
    setSelectedPharmacyId("");
    try {
      const [stockResult, mapResult] = await Promise.allSettled([
        api.get("/medications/nearby-stock", {
          params: {
            medication_id: selectedMedication.id,
            latitude: location.latitude,
            longitude: location.longitude,
            radius_meters: 10000,
          },
        }),
        api.get("/medications/nearby-pharmacies", {
          params: {
            latitude: location.latitude,
            longitude: location.longitude,
            radius_meters: 10000,
          },
        }),
      ]);
      if (stockResult.status === "fulfilled") setRegisteredStock(stockResult.value.data);
      if (mapResult.status === "fulfilled") setPharmacies(mapResult.value.data);
      if (stockResult.status === "rejected" && mapResult.status === "rejected") {
        setError(getErrorMessage(stockResult.reason));
      } else if (stockResult.status === "rejected") {
        setError(`Could not check QueueLess organization stock: ${getErrorMessage(stockResult.reason)}`);
      } else if (mapResult.status === "rejected") {
        setError("OpenStreetMap pharmacy search is unavailable. Showing organization-reported stock only.");
      }
      const stockCount = stockResult.status === "fulfilled" ? stockResult.value.data.length : 0;
      const mapCount = mapResult.status === "fulfilled" ? mapResult.value.data.length : 0;
      setStatus(stockCount
        ? `Found ${stockCount} organization(s) reporting ${selectedMedication.name} in stock. Contact the store to confirm availability.`
        : mapCount
          ? `No QueueLess organization reported this medication in stock. Showing ${mapCount} mapped pharmacies with no verified inventory.`
          : "No nearby organization stock or mapped pharmacies were found within 10 km.");
    } finally {
      setSearching(false);
    }
  }

  const matchingMedications = medications.filter((item) => (
    item.name.toLowerCase().includes(search.trim().toLowerCase())
  ));

  return (
    <section className="content-stack medication-search-page">
      <header className="page-intro">
        <p className="eyebrow">Customer services</p>
        <h1>Find medication nearby</h1>
        <p>Search a medication, find nearby mapped pharmacies, then contact a shop to ask whether it is available.</p>
      </header>

      <div className="medication-disclaimer" role="note">
        <Pill size={18} />
        <p><strong>Search directory only.</strong> The 10 medication names are sample search terms, not treatment recommendations. Pharmacy stock and opening hours are not verified. Confirm availability and consult a qualified health professional before using medication.</p>
      </div>

      <section className="panel medication-search-panel">
        <div className="panel-heading"><div><p className="eyebrow">Medication search</p><h2>What do you need to ask about?</h2></div></div>
        <label className="medication-directory-search">
          Search medication
          <span><Search size={16} /><input type="search" value={search} onChange={(event) => {
            setSearch(event.target.value);
            setSelectedMedication(null);
            setPharmacies([]);
            setRegisteredStock([]);
            setStatus("");
          }} placeholder="Search by medication name" aria-label="Search medication names" /></span>
        </label>
        {loadingCatalog ? <p className="muted-copy">Loading medication names…</p> : search.trim() && !selectedMedication && (
          <div className="medication-directory-results" role="listbox" aria-label="Medication results">
            {matchingMedications.map((item) => (
              <button type="button" role="option" aria-selected="false" key={item.id} onClick={() => {
                setSelectedMedication(item);
                setSearch(item.name);
                setError("");
              }}><Pill size={15} />{item.name}</button>
            ))}
            {matchingMedications.length === 0 && <p>No sample medication names match your search.</p>}
          </div>
        )}
        {selectedMedication && (
          <div className="selected-medication">
            <span><Pill size={16} /><strong>{selectedMedication.name}</strong></span>
            <button type="button" className="text-button" onClick={() => { setSelectedMedication(null); setSearch(""); setPharmacies([]); setRegisteredStock([]); setStatus(""); }}>Change</button>
          </div>
        )}
        <div className="medication-location-controls">
          <button className="button button-quiet" type="button" onClick={useLocation} disabled={locating}>
            <LocateFixed size={16} /> {locating ? "Finding location…" : location ? "Update my location" : "Use my location"}
          </button>
          <button className="button button-primary" type="button" onClick={searchNearby} disabled={!selectedMedication || !location || searching}>
            <Search size={16} /> {searching ? "Searching nearby…" : "Find nearby pharmacies"}
          </button>
        </div>
        <p className="pharmacy-privacy-note">Your browser asks permission before accessing location. A nearby-stock search sends your coordinates and selected medication ID to QueueLess. Coordinates are also sent to public OpenStreetMap to find mapped pharmacies; the medication name is not sent to OpenStreetMap.</p>
        {error && <div className="form-alert" role="alert">{error}</div>}
        {status && <div className="success-alert" role="status">{status}</div>}
      </section>

      {location && (
        <div className="pharmacy-results-layout">
          <section className="panel pharmacy-results-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">Reported by organizations</p><h2>{selectedMedication?.name} in stock nearby</h2></div>
              <span className="status-pill status-active">{registeredStock.length} found</span>
            </div>
            {registeredStock.length ? (
              <div className="pharmacy-results-list">
                {registeredStock.map((store, index) => {
                  const phoneLink = store.contact_number ? formatPhoneLink(store.contact_number) : "";
                  return (
                    <article className={`pharmacy-result${selectedPharmacyId === store.organization_id ? " is-selected" : ""}`} key={`${store.organization_id}-${store.medication_name}`} role="button" tabIndex={0} onClick={() => setSelectedPharmacyId(store.organization_id)} onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedPharmacyId(store.organization_id);
                      }
                    }}>
                      <span className="pharmacy-result-rank">{index + 1}</span>
                      <div className="pharmacy-result-main">
                        <h3>{store.organization_name}</h3>
                        <p><MapPin size={13} /> {store.distance_km.toFixed(2)} km · about {store.estimated_travel_minutes} min travel</p>
                        <small>{store.quantity} unit(s) reported in stock by this organization</small>
                        {store.address && <small>{store.address}</small>}
                        {store.contact_number
                          ? <small>Contact: {store.contact_number}</small>
                          : <small>No contact number is listed for this organization.</small>}
                        <div className="pharmacy-result-actions">
                          {phoneLink && <a className="button button-quiet" href={`tel:${phoneLink}`} onClick={(event) => event.stopPropagation()}><Phone size={14} /> Call store</a>}
                          <a className="button button-quiet" href={directionsUrl(location, store)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}><Navigation size={14} /> Directions</a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : <p className="muted-copy">No QueueLess organization has reported this medication in stock within 10 km. Mapped nearby pharmacies are shown below without verified stock information.</p>}
            {pharmacies.length > 0 && (
              <>
                <div className="panel-heading mapped-pharmacy-heading"><div><p className="eyebrow">OpenStreetMap directory</p><h2>Other mapped pharmacies · inventory unknown</h2></div><span className="status-pill status-active">{pharmacies.length}</span></div>
                <div className="pharmacy-results-list">
                  {pharmacies.map((pharmacy) => {
                    const phoneLink = pharmacy.phone ? formatPhoneLink(pharmacy.phone) : "";
                    const websiteUrl = safeWebsiteUrl(pharmacy.website);
                    return <article className="pharmacy-result" key={pharmacy.id}>
                      <div className="pharmacy-result-main">
                        <h3>{pharmacy.name}</h3><p><MapPin size={13} /> {pharmacy.distance_km.toFixed(2)} km away</p>
                        {pharmacy.address && <small>{pharmacy.address}</small>}
                        <small>{pharmacy.phone ? `Public number listed by OpenStreetMap: ${pharmacy.phone}` : "No public phone number is listed."}</small>
                        <div className="pharmacy-result-actions">
                          {phoneLink && <a className="button button-quiet" href={`tel:${phoneLink}`}><Phone size={14} /> Call to ask</a>}
                          {websiteUrl && <a className="button button-quiet" href={websiteUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Website</a>}
                          <a className="button button-quiet" href={directionsUrl(location, pharmacy)} target="_blank" rel="noreferrer"><Navigation size={14} /> Directions</a>
                        </div>
                      </div>
                    </article>;
                  })}
                </div>
              </>
            )}
          </section>
          <aside className="panel pharmacy-map-panel">
            <div className="panel-heading"><div><p className="eyebrow">OpenStreetMap</p><h2>Nearby map</h2></div></div>
            <PharmacyMap location={location} pharmacies={[
              ...registeredStock.map((store) => ({
                id: store.organization_id,
                name: store.organization_name,
                latitude: store.latitude,
                longitude: store.longitude,
              })),
              ...pharmacies,
            ]} selectedId={selectedPharmacyId} onSelect={setSelectedPharmacyId} />
            <p className="estimate-disclaimer">Map data © OpenStreetMap contributors. Pharmacy records and contact information may be incomplete or out of date.</p>
          </aside>
        </div>
      )}
      {!location && <div className="empty-panel"><MapPin size={25} /><h2>Enable location to find pharmacies</h2><p>Select a medication, then allow location access to search mapped pharmacies within 10 km.</p></div>}
    </section>
  );
}
