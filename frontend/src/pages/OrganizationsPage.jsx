import { useEffect, useState } from "react";
import { ArrowRight, Building2, MapPin, Search } from "lucide-react";
import { Link } from "react-router-dom";
import api, { getErrorMessage } from "../services/api.js";

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setError("");
      try {
        const { data } = await api.get("/organizations", {
          params: { search: search || undefined, category: category || undefined },
        });
        setOrganizations(data);
      } catch (requestError) {
        setError(getErrorMessage(requestError));
      } finally {
        setBusy(false);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, category]);

  return (
    <section className="content-stack">
      <div className="page-intro">
        <p className="eyebrow">Find your next visit</p>
        <h1>Organizations near you</h1>
        <p>Explore active organizations and the services they provide.</p>
      </div>
      <div className="discovery-controls">
        <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or service" aria-label="Search organizations" /></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
          <option value="">All categories</option><option value="clinic">Clinics</option><option value="hospital">Hospitals</option><option value="laboratory">Laboratories</option><option value="bank">Banks</option><option value="government">Government offices</option><option value="service centre">Service centres</option>
        </select>
      </div>
      {error && <div className="form-alert" role="alert">{error}</div>}
      {busy ? <div className="empty-panel">Loading organizations…</div> : organizations.length === 0 ? (
        <div className="empty-panel"><Building2 size={26} /><h2>No organizations found</h2><p>Try a different search or check back later.</p></div>
      ) : (
        <div className="organization-grid">
          {organizations.map((organization) => (
            <article className="organization-card" key={organization.id}>
              <div className="organization-card-top"><span className="organization-icon"><Building2 size={21} /></span><span className="status-pill status-active">Active</span></div>
              <p className="organization-category">{organization.category || "Service provider"}</p>
              <h2>{organization.name}</h2>
              <p className="organization-description">{organization.description || "Explore available services and book a visit at a time that works for you."}</p>
              {organization.address && <p className="organization-address"><MapPin size={14} />{organization.address}</p>}
              <Link className="organization-card-link" to={`/organizations/${organization.id}`}>View services <ArrowRight size={16} /></Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
