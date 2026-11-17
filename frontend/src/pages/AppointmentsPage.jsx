import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import PrescriptionImageGallery from "../components/PrescriptionImageGallery.jsx";
import api, { getErrorMessage } from "../services/api.js";
import useQueueUpdates from "../hooks/useQueueUpdates.js";

function formatDate(value) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export function AppointmentsPage() {
  const location = useLocation();
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("/appointments");
      setAppointments(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="content-stack">
      <div className="page-intro"><p className="eyebrow">Your visit history</p><h1>Appointments</h1><p>Keep track of upcoming visits and the services you’ve completed.</p></div>
      {location.state?.appointmentConfirmed && (
        <div className="success-alert" role="status">
          <strong>Appointment confirmed.</strong>
          {location.state.appointmentReference && <> Reference: {location.state.appointmentReference}.</>}
        </div>
      )}
      {error && <div className="form-alert" role="alert">{error}</div>}
      {busy ? <div className="empty-panel">Loading appointments…</div> : appointments.length === 0 ? (
        <div className="empty-panel"><CalendarDays size={26} /><h2>No appointments yet</h2><p>Browse organizations to book your first visit.</p><Link className="button button-primary" to="/organizations">Find a service <ArrowRight size={16} /></Link></div>
      ) : (
        <div className="appointment-list">
          {appointments.map((appointment) => (
            <article className="appointment-row" key={appointment.id}>
              <span className="appointment-date-icon"><CalendarDays size={20} /></span>
              <div className="appointment-main">
                <h2>{appointment.organization_name}</h2>
                <p>{appointment.service_name} · {formatDate(appointment.starts_at)}</p>
                {appointment.token_number && <span className="token-inline">Token {appointment.token_number}</span>}
              </div>
              <span className={`status-pill status-${appointment.status}`}>{appointment.status.replaceAll("_", " ")}</span>
              <Link className="icon-link" to={`/appointments/${appointment.id}`} aria-label={`View appointment ${appointment.reference}`}><ArrowRight size={18} /></Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function AppointmentDetailsPage() {
  const { appointmentId } = useParams();
  const [appointment, setAppointment] = useState(null);
  const [queue, setQueue] = useState(null);
  const [prescription, setPrescription] = useState({ images: [], medications: [] });
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/appointments/${appointmentId}`);
      setAppointment(data);
      const prescriptionResponse = await api.get(`/appointments/${appointmentId}/prescription`);
      setPrescription(prescriptionResponse.data);
      if (data.token_id) {
        const queueResponse = await api.get("/queue/mine");
        setQueue(queueResponse.data.find((item) => item.id === data.token_id) || null);
      }
      if (["confirmed", "checked_in"].includes(data.status)) {
        const qrResponse = await api.get(`/appointments/${appointmentId}/qr`);
        setQr(qrResponse.data.qr_code);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, [appointmentId]);

  useEffect(() => { load(); }, [load]);
  useQueueUpdates(appointment?.organization_id, load);

  async function cancelAppointment() {
    setActionBusy(true);
    setError("");
    try {
      await api.post(`/appointments/${appointmentId}/cancel`);
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionBusy(false);
    }
  }

  if (busy) return <div className="empty-panel">Loading appointment…</div>;
  if (!appointment) return <div className="empty-panel" role="alert">{error || "Appointment not found."}<p><Link to="/appointments">Back to appointments</Link></p></div>;

  return (
    <section className="content-stack">
      <Link className="back-link" to="/appointments"><ArrowRight className="back-arrow" size={15} /> All appointments</Link>
      <div className="page-intro"><p className="eyebrow">Appointment {appointment.reference}</p><h1>{appointment.organization_name}</h1><p>{appointment.service_name} · {formatDate(appointment.starts_at)}</p></div>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <div className="details-layout">
        <section className="panel queue-detail-panel">
          <div className="panel-heading"><div><p className="eyebrow">Your queue token</p><h2>{appointment.token_number || "Appointment"}</h2></div><span className={`status-pill status-${queue?.status || appointment.status}`}>{(queue?.status || appointment.status).replaceAll("_", " ")}</span></div>
          {queue ? (
            <>
              <div className="queue-metrics">
                <div><strong>{queue.customers_ahead}</strong><span>people ahead</span></div>
                <div><strong>{queue.estimated_wait_minutes} min</strong><span>estimated wait</span></div>
              </div>
              {queue.counter_name && <p className="info-note">Counter: {queue.counter_name}</p>}
              <p className="estimate-disclaimer">Waiting time is an estimate, not a guaranteed service time.</p>
            </>
          ) : <p className="muted-copy">Your queue details will appear here when available.</p>}
          {["pending", "confirmed"].includes(appointment.status) && (
            <button className="button button-quiet danger-action" type="button" disabled={actionBusy} onClick={cancelAppointment}>{actionBusy ? "Cancelling…" : "Cancel appointment"}</button>
          )}
        </section>
        <section className="panel qr-panel">
          <div className="panel-heading"><div><p className="eyebrow">At the organization</p><h2>Check in with your QR</h2></div></div>
          {qr ? <><img className="qr-image" src={qr} alt={`Check-in QR code for token ${appointment.token_number}`} /><p>Show this code to staff when you arrive. It expires after 24 hours.</p></> : <div className="qr-placeholder"><Clock3 size={24} /><p>A QR code is available for confirmed appointments.</p></div>}
        </section>
      </div>
      <div className="details-layout">
        <section className="panel prescription-panel">
          <div className="panel-heading"><div><p className="eyebrow">From your care team</p><h2>Prescription images</h2></div></div>
          {prescription.images.length ? (
            <PrescriptionImageGallery appointmentId={appointmentId} images={prescription.images} />
          ) : <p className="muted-copy">No prescription images have been shared for this appointment yet.</p>}
        </section>
        <section className="panel prescription-panel">
          <div className="panel-heading"><div><p className="eyebrow">Doctor-entered record</p><h2>Prescribed medications</h2></div></div>
          {prescription.medications.length ? (
            <div className="prescribed-medication-list">
              {prescription.medications.map((medication) => (
                <article className="prescribed-medication" key={medication.id}>
                  <h3>{medication.name}</h3>
                  <dl>
                    <div><dt>Dosage</dt><dd>{medication.dosage}</dd></div>
                    <div><dt>Frequency</dt><dd>{medication.frequency}</dd></div>
                    <div><dt>Duration</dt><dd>{medication.duration}</dd></div>
                  </dl>
                  {medication.instructions && <p>{medication.instructions}</p>}
                </article>
              ))}
            </div>
          ) : <p className="muted-copy">No medications have been prescribed or shared for this appointment.</p>}
          <p className="estimate-disclaimer">This section displays only information entered by your care team. Contact your doctor or pharmacist if you have questions.</p>
        </section>
      </div>
    </section>
  );
}

