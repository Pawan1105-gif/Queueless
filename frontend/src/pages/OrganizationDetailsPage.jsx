import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api, { getErrorMessage } from "../services/api.js";
import { useAuth } from "../context/AuthContext.jsx";

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function OrganizationDetailsPage() {
  const { organizationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [services, setServices] = useState([]);
  const [hours, setHours] = useState([]);
  const [date, setDate] = useState(() => localDateString(new Date(Date.now() + 86400000)));
  const [selectedService, setSelectedService] = useState("");
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(true);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get(`/organizations/${organizationId}`),
      api.get(`/organizations/${organizationId}/services`),
      api.get(`/organizations/${organizationId}/operating-hours`),
    ])
      .then(([organizationResponse, serviceResponse, hoursResponse]) => {
        if (!active) return;
        setOrganization(organizationResponse.data);
        setServices(serviceResponse.data);
        setHours(hoursResponse.data);
      })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [organizationId]);

  useEffect(() => {
    if (!selectedService || !date) {
      setSlots([]);
      return;
    }
    let active = true;
    setError("");
    setSelectedSlot("");
    api.get("/appointments/availability", {
      params: { organization_id: organizationId, service_id: selectedService, service_date: date },
    })
      .then(({ data }) => { if (active) setSlots(data); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); });
    return () => { active = false; };
  }, [organizationId, selectedService, date]);

  const chosenService = useMemo(
    () => services.find((service) => service.id === selectedService),
    [services, selectedService],
  );

  async function bookAppointment(event) {
    event.preventDefault();
    if (!user) {
      navigate("/login", { state: { from: `/organizations/${organizationId}` } });
      return;
    }
    setBooking(true);
    setError("");
    try {
      const { data } = await api.post(`/appointments?organization_id=${organizationId}`, {
        service_id: selectedService,
        starts_at: new Date(selectedSlot).toISOString(),
        customer_notes: notes || null,
      });
      navigate("/appointments", {
        replace: true,
        state: { appointmentConfirmed: true, appointmentReference: data.reference },
      });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBooking(false);
    }
  }

  if (busy) return <div className="empty-panel">Loading organization…</div>;
  if (!organization) return <div className="empty-panel" role="alert">{error || "Organization not found."}<p><Link to="/organizations">Back to organizations</Link></p></div>;

  return (
    <section className="content-stack">
      <Link className="back-link" to="/organizations"><ArrowLeft size={15} /> All organizations</Link>
      <header className="organization-hero-card">
        <span className="organization-icon"><CalendarDays size={23} /></span>
        <p className="organization-category">{organization.category || "Service provider"} · Active</p>
        <h1>{organization.name}</h1>
        <p>{organization.description || "Choose a service and find an appointment time that works for you."}</p>
        {organization.address && <span className="organization-address"><MapPin size={15} />{organization.address}</span>}
        {organization.contact_number && <span className="organization-address">Contact: {organization.contact_number}</span>}
      </header>

      <div className="details-layout">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">What we offer</p><h2>Available services</h2></div></div>
          {services.length === 0 ? <p className="muted-copy">No services are available right now.</p> : (
            <div className="service-list">
              {services.map((service) => (
                <button className={`service-choice${selectedService === service.id ? " is-selected" : ""}`} type="button" key={service.id} onClick={() => setSelectedService(service.id)}>
                  <span><strong>{service.name}</strong><small>{service.description || service.category || "Appointment service"}</small></span>
                  <span className="service-duration"><Clock3 size={14} />{service.duration_minutes} min</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel booking-panel">
          <div className="panel-heading"><div><p className="eyebrow">Reserve a time</p><h2>Book an appointment</h2></div></div>
          {error && <div className="form-alert" role="alert">{error}</div>}
          {!user && <p className="info-note">Sign in or create an account to confirm your booking.</p>}
          <form className="stack-form" onSubmit={bookAppointment}>
            <label>Service<select required value={selectedService} onChange={(event) => setSelectedService(event.target.value)}><option value="">Choose a service</option>{services.map((service) => <option value={service.id} key={service.id}>{service.name} ({service.duration_minutes} min)</option>)}</select></label>
            <label>Date<input type="date" min={localDateString(new Date())} value={date} onChange={(event) => setDate(event.target.value)} required /></label>
            <div className="slot-label">Available times</div>
            {!chosenService ? <p className="muted-copy">Choose a service to see available times.</p> : slots.length === 0 ? <p className="muted-copy">No available times on this date.</p> : (
              <div className="slot-grid">
                {slots.map((slot) => (
                  <button className={`slot-button${selectedSlot === slot.starts_at ? " is-selected" : ""}`} type="button" key={slot.starts_at} onClick={() => setSelectedSlot(slot.starts_at)}>
                    {new Date(slot.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC
                  </button>
                ))}
              </div>
            )}
            <label>Notes <span className="optional-label">Optional</span><textarea rows="3" maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the team should know?" /></label>
            <button className="button button-primary form-submit" type="submit" disabled={booking || !selectedService || !selectedSlot}>
              {booking ? "Booking…" : "Confirm appointment"} <ArrowRight size={16} />
            </button>
          </form>
          <p className="estimate-disclaimer">Appointment availability is provided by the organization. Please arrive on time for your visit.</p>
        </section>
      </div>

      {hours.length > 0 && (
        <section className="panel hours-panel">
          <div className="panel-heading"><div><p className="eyebrow">Plan ahead</p><h2>Operating hours <span className="timezone-note">Times shown in UTC</span></h2></div></div>
          <div className="hours-grid">{hours.map((hour) => <span key={hour.weekday}><strong>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][hour.weekday]}</strong>{hour.is_closed ? "Closed" : `${hour.opens_at?.slice(0, 5)} – ${hour.closes_at?.slice(0, 5)}`}</span>)}</div>
        </section>
      )}
    </section>
  );
}
