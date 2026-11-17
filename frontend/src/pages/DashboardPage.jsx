import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Ambulance,
  ArrowRight,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CircleCheck,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Star,
  Stethoscope,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import useQueueUpdates from "../hooks/useQueueUpdates.js";
import api, { getErrorMessage } from "../services/api.js";
import AppointmentPrescriptionManager from "../components/AppointmentPrescriptionManager.jsx";
import DoctorDashboard from "./DoctorDashboard.jsx";

const adminSections = [
  ["overview", "Overview"],
  ["services", "Services"],
  ["counters", "Counters"],
  ["staff", "Staff"],
  ["doctors", "Doctors"],
  ["appointments", "Appointments"],
  ["medication_center", "Medication centre"],
  ["queue", "Live queue"],
  ["analytics", "Analytics"],
  ["feedback", "Feedback"],
  ["settings", "Settings"],
];

const chartColors = ["#2457d6", "#12a88a", "#f0ac48", "#e36c76", "#7758c8"];

function PageTitle({ eyebrow, title, description, action }) {
  return (
    <div className="page-intro page-intro-row">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {action}
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, tone = "" }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon size={18} /></span><span className="metric-label">{label}</span><strong>{value ?? "—"}</strong></article>;
}

function EmptyState({ title, description, action }) {
  return <div className="empty-panel"><Building2 size={26} /><h2>{title}</h2><p>{description}</p>{action}</div>;
}

function Notice({ error, info }) {
  if (error) return <div className="form-alert" role="alert">{error}</div>;
  if (info) return <div className="success-alert" role="status">{info}</div>;
  return null;
}

function CustomerDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState("");
  const [showOrganizationApplication, setShowOrganizationApplication] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const [appointmentResult, tokenResult, notificationResult] = await Promise.all([
        api.get("/appointments"),
        api.get("/queue/mine"),
        api.get("/notifications"),
      ]);
      setAppointments(appointmentResult.data);
      setTokens(tokenResult.data);
      setNotifications(notificationResult.data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20000);
    return () => window.clearInterval(timer);
  }, [load]);
  const activeToken = tokens.find((token) => ["waiting", "checked_in", "called", "serving"].includes(token.status));
  useQueueUpdates(activeToken?.organization_id, load);

  async function markAllRead() {
    try {
      await api.post("/notifications/read-all");
      await load();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  if (showOrganizationApplication) {
    return (
      <section className="content-stack">
        <button className="text-button back-link" type="button" onClick={() => setShowOrganizationApplication(false)}>
          Back to your dashboard
        </button>
        <OrganizationApplication onCreated={() => setShowOrganizationApplication(false)} />
      </section>
    );
  }

  return (
    <section className="content-stack">
      <PageTitle eyebrow="Your QueueLess account" title="Your day, at a glance" description="Your upcoming visits, live queue updates, and helpful reminders." action={<div className="dashboard-actions"><button className="button button-quiet" type="button" onClick={() => setShowOrganizationApplication(true)}><Building2 size={16} /> Register an organization</button><Link className="button button-primary" to="/organizations">Find a service <ArrowRight size={16} /></Link></div>} />
      <Notice error={error} />
      <Link className="ambulance-dashboard-link" to="/ambulance">
        <span className="ambulance-dashboard-icon"><Ambulance size={21} /></span>
        <span><strong>Ambulance service demo</strong><small>Explore simulated nearby drivers. Not an emergency dispatch service.</small></span>
        <ArrowRight size={17} />
      </Link>
      <div className="metric-grid">
        <MetricCard label="Appointments" value={appointments.length} icon={CalendarDays} />
        <MetricCard label="Upcoming" value={appointments.filter((item) => ["pending", "confirmed", "checked_in"].includes(item.status)).length} icon={Clock3} tone="mint" />
        <MetricCard label="Active queue tokens" value={tokens.filter((item) => ["waiting", "checked_in", "called", "serving"].includes(item.status)).length} icon={Activity} tone="amber" />
      </div>
      <div className="dashboard-columns">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Next on your calendar</p><h2>Upcoming appointments</h2></div><Link className="subtle-link" to="/appointments">View all <ArrowRight size={14} /></Link></div>
          {appointments.filter((item) => ["pending", "confirmed", "checked_in"].includes(item.status)).slice(0, 4).map((appointment) => (
            <Link className="compact-row" key={appointment.id} to={`/appointments/${appointment.id}`}>
              <span className="compact-icon"><CalendarDays size={17} /></span><span className="compact-copy"><strong>{appointment.organization_name}</strong><small>{appointment.service_name} · {new Date(appointment.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC</small></span><span className={`status-pill status-${appointment.status}`}>{appointment.status.replaceAll("_", " ")}</span>
            </Link>
          ))}
          {appointments.filter((item) => ["pending", "confirmed", "checked_in"].includes(item.status)).length === 0 && <p className="muted-copy">No upcoming appointments. Find an organization to book a visit.</p>}
        </section>
        <section className="panel" id="notifications">
          <div className="panel-heading"><div><p className="eyebrow">Stay in the loop</p><h2>Notifications</h2></div>{notifications.some((item) => !item.is_read) && <button className="text-button" type="button" onClick={markAllRead}>Mark all read</button>}</div>
          <div className="notification-list">
            {notifications.slice(0, 6).map((item) => <article className={`notification-item${item.is_read ? "" : " is-unread"}`} key={item.id}><span className="notification-dot" /><div><strong>{item.title}</strong><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></article>)}
            {notifications.length === 0 && <p className="muted-copy">Appointment and queue updates will show up here.</p>}
          </div>
        </section>
      </div>
      {tokens.filter((item) => ["waiting", "checked_in", "called", "serving"].includes(item.status)).length > 0 && (
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Live queue</p><h2>Your active tokens</h2></div><span className="live-badge"><span /> Updates live</span></div>
          <div className="queue-card-grid">{tokens.filter((item) => ["waiting", "checked_in", "called", "serving"].includes(item.status)).map((token) => <article className="queue-mini-card" key={token.id}><span className="token-number">{token.token_number}</span><strong>{token.organization_name}</strong><p>{token.service_name}</p><div className="queue-mini-metrics"><span>{token.customers_ahead} ahead</span><span>~{token.estimated_wait_minutes} min</span></div><span className={`status-pill status-${token.status}`}>{token.status.replaceAll("_", " ")}</span></article>)}</div>
          <p className="estimate-disclaimer">Wait estimates can change with service demand and are not guaranteed.</p>
        </section>
      )}
    </section>
  );
}

function OrganizationApplication({ onCreated }) {
  const { refreshUser } = useAuth();
  const [values, setValues] = useState({ name: "", slug: "", category: "", description: "", address: "", email: "", contact_number: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function updateName(value) {
    setValues((current) => ({
      ...current,
      name: value,
      slug: value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.post("/organizations", {
        ...values,
        email: values.email.trim() || null,
        category: values.category.trim() || null,
        description: values.description.trim() || null,
        address: values.address.trim() || null,
        contact_number: values.contact_number.trim() || null,
      });
      await refreshUser();
      onCreated();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-stack">
      <PageTitle eyebrow="Organization setup" title="Bring your organization to QueueLess" description="Submit your organization for review. Once approved, you can configure services, counters, staff, and operating hours." />
      <div className="panel form-panel">
        <Notice error={error} />
        <form className="form-grid" onSubmit={submit}>
          <label>Organization name<input required minLength={2} maxLength={200} value={values.name} onChange={(event) => updateName(event.target.value)} /></label>
          <label>Unique identifier<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={120} value={values.slug} onChange={(event) => setValues({ ...values, slug: event.target.value })} /></label>
          <label>Category<input placeholder="Clinic, laboratory, bank…" maxLength={100} value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value })} /></label>
          <label>Contact email<input type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
          <label>Contact number<input type="tel" maxLength={32} value={values.contact_number} onChange={(event) => setValues({ ...values, contact_number: event.target.value })} /></label>
          <label>Address<input value={values.address} onChange={(event) => setValues({ ...values, address: event.target.value })} /></label>
          <label className="full-span">Description<textarea rows="3" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label>
          <div className="full-span"><button className="button button-primary" disabled={busy}>{busy ? "Submitting…" : "Submit for approval"} <ArrowRight size={16} /></button></div>
        </form>
      </div>
    </section>
  );
}

function useOrganizationData(organizationId, section) {
  const [loadedData, setLoadedData] = useState({ key: "", value: null });
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const dataKey = `${organizationId}:${section}`;
  const reload = useCallback(async () => {
    if (!organizationId) return;
    setBusy(true);
    setError("");
    const urls = {
      overview: [`/organizations/${organizationId}/analytics`],
      services: [`/organizations/${organizationId}/services?include_unavailable=true`, `/organizations/${organizationId}/operating-hours`],
      counters: [`/organizations/${organizationId}/counters`],
      staff: [`/organizations/${organizationId}/staff`, `/organizations/${organizationId}/counters`],
      doctors: [`/organizations/${organizationId}/doctors`],
      appointments: [`/appointments?organization_id=${organizationId}`],
      medication_center: [
        `/organizations/${organizationId}/medication-stock`,
        `/organizations/${organizationId}/medication-stock/catalog`,
      ],
      queue: [`/queue/organizations/${organizationId}?active_only=false`, `/organizations/${organizationId}/counters`],
      analytics: [`/organizations/${organizationId}/analytics`],
      feedback: [`/organizations/${organizationId}/feedback`],
      settings: [`/organizations/${organizationId}`, `/organizations/${organizationId}/operating-hours`, `/organizations/${organizationId}/holidays`, `/organizations/${organizationId}/medication-catalog?include_inactive=true`],
    }[section] || [];
    try {
      const responses = await Promise.all(urls.map((url) => api.get(url)));
      const [primary, secondary, third, fourth] = responses;
      const result = section === "staff" || section === "queue"
        ? { items: primary.data, counters: secondary.data }
        : section === "services"
          ? { items: primary.data, hours: secondary.data }
          : section === "medication_center"
            ? { items: primary.data, medicationDirectory: secondary.data }
          : section === "settings"
          ? { organization: primary.data, hours: secondary.data, holidays: third.data, medicationCatalog: fourth.data }
          : section === "analytics" || section === "overview"
            ? primary.data
            : primary.data;
      setLoadedData({ key: dataKey, value: result });
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, [dataKey, organizationId, section]);
  useEffect(() => { reload(); }, [reload]);
  return {
    data: loadedData.key === dataKey ? loadedData.value : null,
    busy: busy || loadedData.key !== dataKey,
    error,
    reload,
    setError,
  };
}

function OrganizationWorkspace({ organizations, refreshOrganizations }) {
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id || "");
  const [section, setSection] = useState("overview");
  const selectedOrg = organizations.find((item) => item.id === organizationId);
  const { data, busy, error, reload, setError } = useOrganizationData(organizationId, section);
  const [info, setInfo] = useState("");
  const [serviceForm, setServiceForm] = useState({ name: "", description: "", category: "", duration_minutes: 30, max_appointment_capacity: 1 });
  const [counterName, setCounterName] = useState("");
  const [catalogMedicationName, setCatalogMedicationName] = useState("");
  const [staffForm, setStaffForm] = useState({
    email: "",
    full_name: "",
    password: "",
    phone: "",
    counter_id: "",
    role: "staff",
    specialization: "",
    qualification: "",
    registration_number: "",
    experience_years: "",
    department: "",
    consultation_fee: "",
  });
  const [scanToken, setScanToken] = useState("");
  const [operatingHours, setOperatingHours] = useState([]);
  const [organizationCoordinates, setOrganizationCoordinates] = useState({ latitude: "", longitude: "" });
  const [stockMedicationId, setStockMedicationId] = useState("");
  const [stockQuantity, setStockQuantity] = useState("1");
  const [newDirectoryMedicationName, setNewDirectoryMedicationName] = useState("");
  const [queueActionBusy, setQueueActionBusy] = useState("");
  const [appointmentActionBusy, setAppointmentActionBusy] = useState("");
  const [doctorActionBusy, setDoctorActionBusy] = useState("");
  useQueueUpdates(organizationId, reload);

  useEffect(() => {
    if (section === "settings" && data?.hours) setOperatingHours(data.hours);
  }, [section, data]);
  useEffect(() => {
    if (section === "settings" && data?.organization) {
      setOrganizationCoordinates({
        latitude: data.organization.latitude ?? "",
        longitude: data.organization.longitude ?? "",
      });
    }
  }, [section, data]);
  useEffect(() => {
    setInfo("");
    setError("");
  }, [section, organizationId, setError]);

  const counters = Array.isArray(data?.counters)
    ? data.counters
    : section === "counters" && Array.isArray(data)
      ? data
      : [];
  const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];

  async function submitService(event) {
    event.preventDefault();
    try {
      await api.post(`/organizations/${organizationId}/services`, serviceForm);
      setServiceForm({ name: "", description: "", category: "", duration_minutes: 30, max_appointment_capacity: 1 });
      setInfo("Service saved.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function submitCounter(event) {
    event.preventDefault();
    try {
      await api.post(`/organizations/${organizationId}/counters`, { name: counterName });
      setCounterName("");
      setInfo("Counter created.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function submitStaff(event) {
    event.preventDefault();
    try {
      const isDoctor = staffForm.role === "doctor";
      await api.post(`/organizations/${organizationId}/staff`, {
        ...staffForm,
        counter_id: isDoctor ? null : staffForm.counter_id || null,
        phone: staffForm.phone.trim() || null,
        specialization: isDoctor ? staffForm.specialization.trim() : null,
        qualification: isDoctor ? staffForm.qualification.trim() : null,
        registration_number: isDoctor ? staffForm.registration_number.trim() : null,
        experience_years: isDoctor ? Number(staffForm.experience_years) : null,
        department: isDoctor ? staffForm.department.trim() : null,
        consultation_fee: isDoctor ? Number(staffForm.consultation_fee) : null,
      });
      setStaffForm({
        email: "", full_name: "", password: "", phone: "", counter_id: "", role: "staff",
        specialization: "", qualification: "", registration_number: "", experience_years: "",
        department: "", consultation_fee: "",
      });
      setInfo(`The ${isDoctor ? "doctor" : "staff"} account was created. Share its initial password securely.`);
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function changeDoctorAvailability(doctor, availabilityStatus) {
    setDoctorActionBusy(doctor.id);
    try {
      await api.patch(
        `/organizations/${organizationId}/doctors/${doctor.id}/availability`,
        { availability_status: availabilityStatus },
      );
      setInfo(`${doctor.full_name} marked ${availabilityStatus}.`);
      await reload();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setDoctorActionBusy("");
    }
  }

  async function manageAppointment(appointmentId, status) {
    setAppointmentActionBusy(appointmentId);
    try {
      await api.patch(`/appointments/${appointmentId}/status`, { status });
      setInfo(`Appointment ${status}.`);
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setAppointmentActionBusy(""); }
  }

  async function queueAction(tokenId, action) {
    setQueueActionBusy(tokenId + action);
    try {
      await api.post(`/queue/organizations/${organizationId}/tokens/${tokenId}/${action}`);
      setInfo(`Queue token ${action}.`);
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setQueueActionBusy(""); }
  }

  async function callNext(counterId) {
    setQueueActionBusy(`call-${counterId}`);
    try {
      await api.post(`/queue/organizations/${organizationId}/counters/${counterId}/call-next`);
      setInfo("Next checked-in customer has been called.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setQueueActionBusy(""); }
  }

  async function verifyQr(event) {
    event.preventDefault();
    try {
      const { data: token } = await api.post("/queue/check-in", { qr_token: scanToken.trim() });
      setInfo(`Checked in token ${token.token_number}.`);
      setScanToken("");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function saveHours(event) {
    event.preventDefault();
    try {
      const values = Array.from({ length: 7 }, (_, weekday) => {
        const hour = operatingHours.find((item) => item.weekday === weekday);
        return hour || { weekday, opens_at: null, closes_at: null, is_closed: true };
      });
      await api.put(`/organizations/${organizationId}/operating-hours`, values);
      setInfo("Operating hours updated.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function addHoliday(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api.post(`/organizations/${organizationId}/holidays`, {
        holiday_date: form.get("holiday_date"),
        name: form.get("name"),
      });
      event.currentTarget.reset();
      setInfo("Holiday added.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function addCatalogMedication(event) {
    event.preventDefault();
    try {
      await api.post(`/organizations/${organizationId}/medication-catalog`, {
        name: catalogMedicationName,
      });
      setCatalogMedicationName("");
      setInfo("Medication added to the organization catalog.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function setCatalogMedicationActive(item) {
    try {
      await api.patch(`/organizations/${organizationId}/medication-catalog/${item.id}`, {
        is_active: !item.is_active,
      });
      setInfo(`${item.name} ${item.is_active ? "deactivated" : "activated"}.`);
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function updateOrganization(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if ((organizationCoordinates.latitude === "") !== (organizationCoordinates.longitude === "")) {
      setError("Enter both organization coordinates or leave both blank.");
      return;
    }
    try {
      await api.patch(`/organizations/${organizationId}`, {
        name: form.get("name"),
        description: form.get("description"),
        address: form.get("address"),
        contact_number: form.get("contact_number"),
        latitude: organizationCoordinates.latitude === "" ? null : Number(organizationCoordinates.latitude),
        longitude: organizationCoordinates.longitude === "" ? null : Number(organizationCoordinates.longitude),
        email: form.get("email") || null,
        category: form.get("category") || null,
      });
      setInfo("Organization profile saved.");
      await reload();
      await refreshOrganizations();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function addMedicationStock(event) {
    event.preventDefault();
    try {
      await api.post(`/organizations/${organizationId}/medication-stock`, {
        medication_id: stockMedicationId,
        quantity: Number(stockQuantity),
      });
      setStockMedicationId("");
      setStockQuantity("1");
      setInfo("Medication stock added and now visible to customers.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function addMedicationDirectoryItem(event) {
    event.preventDefault();
    try {
      await api.post(`/organizations/${organizationId}/medication-stock/catalog`, {
        name: newDirectoryMedicationName,
      });
      setNewDirectoryMedicationName("");
      setInfo("Medication name added to the shared search list. Add your stock quantity below.");
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function updateMedicationStock(item, quantity) {
    try {
      await api.patch(`/organizations/${organizationId}/medication-stock/${item.id}`, {
        quantity: Number(quantity),
      });
      setInfo(`${item.medication_name} stock updated.`);
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  async function removeMedicationStock(item) {
    try {
      await api.delete(`/organizations/${organizationId}/medication-stock/${item.id}`);
      setInfo(`${item.medication_name} removed from customer inventory.`);
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  function useOrganizationLocation() {
    if (!navigator.geolocation) {
      setError("Location services are not available in this browser.");
      return;
    }
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setOrganizationCoordinates({
        latitude: coords.latitude.toFixed(7),
        longitude: coords.longitude.toFixed(7),
      }),
      (locationError) => setError(locationError.code === locationError.PERMISSION_DENIED
        ? "Location access was denied. Allow location access in your browser and try again."
        : "Could not determine your organization location. Please try again."),
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
  }

  async function setCounterStatus(counter) {
    const status = counter.status === "active" ? "paused" : "active";
    try {
      await api.patch(`/queue/organizations/${organizationId}/counters/${counter.id}/status`, { status });
      setInfo(`${counter.name} is ${status}.`);
      await reload();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  if (!selectedOrg) {
    return <EmptyState title="Organization not found" description="Refresh the workspace to see your organizations." action={<button className="button button-primary" type="button" onClick={refreshOrganizations}>Refresh</button>} />;
  }

  return (
    <section className="content-stack">
      <PageTitle eyebrow={selectedOrg.category || "Organization workspace"} title={selectedOrg.name} description={selectedOrg.status === "active" ? "Manage visits, services, staff, and your live queue." : `Organization status: ${selectedOrg.status}. Platform approval is required before customers can book.`} action={<button className="icon-button" type="button" aria-label="Refresh workspace" onClick={reload}><RefreshCw size={17} /></button>} />
      <div className="workspace-toolbar">
        {organizations.length > 1 && <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} aria-label="Select organization">{organizations.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select>}
        <div className="workspace-tabs" role="tablist" aria-label="Organization workspace sections">{adminSections.map(([value, label]) => <button className={section === value ? "is-selected" : ""} type="button" role="tab" aria-selected={section === value} onClick={() => setSection(value)} key={value}>{label}</button>)}</div>
      </div>
      <Notice error={error} info={info} />
      {busy ? <div className="empty-panel">Loading {section}…</div> : null}
      {!busy && section === "overview" && <OverviewPanel data={data} organization={selectedOrg} />}
      {!busy && section === "analytics" && <AnalyticsPanel data={data} />}
      {!busy && section === "services" && <ServicesPanel services={items} hours={data?.hours || []} form={serviceForm} setForm={setServiceForm} submit={submitService} openSettings={() => setSection("settings")} />}
      {!busy && section === "counters" && <CountersPanel counters={counters} counterName={counterName} setCounterName={setCounterName} submit={submitCounter} setCounterStatus={setCounterStatus} />}
      {!busy && section === "staff" && <StaffPanel staff={items} counters={counters} organization={selectedOrg} form={staffForm} setForm={setStaffForm} submit={submitStaff} />}
      {!busy && section === "doctors" && <DoctorsPanel doctors={items} organization={selectedOrg} actionBusy={doctorActionBusy} updateAvailability={changeDoctorAvailability} />}
      {!busy && section === "appointments" && <AppointmentsPanel appointments={items} manage={manageAppointment} busyId={appointmentActionBusy} />}
      {!busy && section === "medication_center" && <MedicationCenterPanel organization={selectedOrg} items={items} catalog={data?.medicationDirectory || []} selectedMedicationId={stockMedicationId} setSelectedMedicationId={setStockMedicationId} quantity={stockQuantity} setQuantity={setStockQuantity} newMedicationName={newDirectoryMedicationName} setNewMedicationName={setNewDirectoryMedicationName} addDirectoryItem={addMedicationDirectoryItem} addStock={addMedicationStock} updateStock={updateMedicationStock} removeStock={removeMedicationStock} />}
      {!busy && section === "queue" && <QueuePanel tokens={items} counters={counters} scanToken={scanToken} setScanToken={setScanToken} verifyQr={verifyQr} queueAction={queueAction} callNext={callNext} actionBusy={queueActionBusy} setCounterStatus={setCounterStatus} />}
      {!busy && section === "feedback" && <FeedbackPanel feedback={items} />}
      {!busy && section === "settings" && <SettingsPanel organization={data?.organization} coordinates={organizationCoordinates} setCoordinates={setOrganizationCoordinates} useOrganizationLocation={useOrganizationLocation} hours={operatingHours} setHours={setOperatingHours} holidays={data?.holidays || []} medicationCatalog={data?.medicationCatalog || []} catalogMedicationName={catalogMedicationName} setCatalogMedicationName={setCatalogMedicationName} saveHours={saveHours} addHoliday={addHoliday} addCatalogMedication={addCatalogMedication} setCatalogMedicationActive={setCatalogMedicationActive} updateOrganization={updateOrganization} />}
    </section>
  );
}

function OverviewPanel({ data, organization }) {
  const metrics = data?.appointments || {};
  return (
    <div className="content-stack">
      {organization.status !== "active" && <div className="info-note">Your organization profile can be prepared while approval is pending. Booking opens after approval.</div>}
      <div className="metric-grid">
        <MetricCard label="Appointments" value={metrics.total ?? 0} icon={CalendarDays} />
        <MetricCard label="Today" value={metrics.today ?? 0} icon={Clock3} tone="mint" />
        <MetricCard label="Completed" value={metrics.completed ?? 0} icon={CircleCheck} tone="mint" />
        <MetricCard label="Waiting now" value={metrics.waiting ?? 0} icon={Activity} tone="amber" />
        <MetricCard label="Cancelled" value={metrics.cancelled ?? 0} icon={CalendarDays} tone="rose" />
        <MetricCard label="No-show" value={metrics.no_show ?? 0} icon={Users} tone="purple" />
      </div>
      <div className="dashboard-columns">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Service insight</p><h2>Popular services</h2></div></div><PopularityChart data={data?.service_popularity || []} /></section>
        <section className="panel performance-panel"><div className="panel-heading"><div><p className="eyebrow">Service quality</p><h2>Performance snapshot</h2></div></div><div className="performance-value"><Clock3 size={18} /><span>Average wait</span><strong>{data?.average_wait_minutes == null ? "—" : `${data.average_wait_minutes} min`}</strong></div><div className="performance-value"><Activity size={18} /><span>Average service</span><strong>{data?.average_service_minutes == null ? "—" : `${data.average_service_minutes} min`}</strong></div><div className="performance-value"><Star size={18} /><span>Customer satisfaction</span><strong>{data?.customer_satisfaction == null ? "—" : `${data.customer_satisfaction} / 5`}</strong></div><p className="estimate-disclaimer">Metrics reflect recorded appointments and queue activity.</p></section>
      </div>
      {data?.counter_performance?.length > 0 && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Counter status</p><h2>Service counters</h2></div></div><div className="table-scroll"><table><thead><tr><th>Counter</th><th>Status</th><th>Completed tokens</th></tr></thead><tbody>{data.counter_performance.map((counter) => <tr key={counter.counter}><td>{counter.counter}</td><td><span className={`status-pill status-${counter.status}`}>{counter.status}</span></td><td>{counter.completed_tokens}</td></tr>)}</tbody></table></div></section>}
    </div>
  );
}

function PopularityChart({ data }) {
  if (!data.length) return <p className="muted-copy">Service popularity appears after customers book appointments.</p>;
  return <div className="chart-wrap"><ResponsiveContainer width="100%" height={250}><BarChart data={data} margin={{ top: 10, right: 12, bottom: 8, left: -20 }}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="service" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="appointments" fill="#2457d6" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>;
}

function AnalyticsPanel({ data }) {
  const trends = data?.daily_trends || [];
  const popularity = data?.service_popularity || [];
  return (
    <div className="content-stack">
      <div className="metric-grid"><MetricCard label="Average wait" value={data?.average_wait_minutes == null ? "—" : `${data.average_wait_minutes} min`} icon={Clock3} /><MetricCard label="Service duration" value={data?.average_service_minutes == null ? "—" : `${data.average_service_minutes} min`} icon={Activity} tone="mint" /><MetricCard label="Satisfaction" value={data?.customer_satisfaction == null ? "—" : `${data.customer_satisfaction} / 5`} icon={Star} tone="amber" /></div>
      <div className="dashboard-columns">
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Last 14 days</p><h2>Appointment trends</h2></div></div>{trends.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={290}><BarChart data={trends}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="appointments" fill="#12a88a" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="muted-copy">No appointment trends to display yet.</p>}</section>
        <section className="panel"><div className="panel-heading"><div><p className="eyebrow">By service</p><h2>Service popularity</h2></div></div>{popularity.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={290}><PieChart><Pie data={popularity} dataKey="appointments" nameKey="service" outerRadius={90} label>{popularity.map((item, index) => <Cell key={item.service} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div> : <p className="muted-copy">No service bookings to display yet.</p>}</section>
      </div>
      <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Activity by counter</p><h2>Counter performance</h2></div></div><div className="table-scroll"><table><thead><tr><th>Counter</th><th>Current status</th><th>Completed tokens</th></tr></thead><tbody>{(data?.counter_performance || []).map((item) => <tr key={item.counter}><td>{item.counter}</td><td>{item.status}</td><td>{item.completed_tokens}</td></tr>)}</tbody></table></div></section>
    </div>
  );
}

function ServicesPanel({ services, hours, form, setForm, submit, openSettings }) {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const duration = Math.max(1, Number(form.duration_minutes) || 30);
  const scheduledDays = weekdays.flatMap((day, weekday) => {
    const schedule = hours.find((item) => item.weekday === weekday);
    if (!schedule || schedule.is_closed || !schedule.opens_at || !schedule.closes_at) return [];
    const toMinutes = (value) => {
      const [hour, minute] = value.split(":").map(Number);
      return hour * 60 + minute;
    };
    const opening = toMinutes(schedule.opens_at);
    const closing = toMinutes(schedule.closes_at);
    const starts = [];
    for (let minute = opening; minute + duration <= closing; minute += duration) starts.push(minute);
    return starts.length ? [{ day, starts }] : [];
  });
  const formatTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  return <div className="dashboard-columns align-start"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Service catalogue</p><h2>Services</h2></div></div>{services.length ? <div className="table-scroll"><table><thead><tr><th>Service</th><th>Duration</th><th>Daily capacity</th><th>Availability</th></tr></thead><tbody>{services.map((service) => <tr key={service.id}><td><strong>{service.name}</strong><small className="table-subtext">{service.category || ""}</small></td><td>{service.duration_minutes} min</td><td>{service.max_appointment_capacity}</td><td><span className={`status-pill status-${service.is_available ? "active" : "inactive"}`}>{service.is_available ? "Available" : "Hidden"}</span></td></tr>)}</tbody></table></div> : <p className="muted-copy">Add a service to begin taking appointments.</p>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Set up your catalogue</p><h2>Add service</h2></div></div><form className="stack-form" onSubmit={submit}><label>Service name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label>Category<input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label><label>Description<textarea rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className="form-grid"><label>Duration (minutes)<input type="number" min="1" max="480" required value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })} /></label><label>Capacity per slot<input type="number" min="1" max="1000" required value={form.max_appointment_capacity} onChange={(event) => setForm({ ...form, max_appointment_capacity: Number(event.target.value) })} /></label></div><div className="slot-preview"><div className="slot-preview-heading"><strong>Appointment time slots</strong><span>Every {duration} minutes</span></div><p>Slots are generated from your organization’s operating hours. Changing the service duration updates the slot interval automatically.</p>{scheduledDays.length ? <div className="slot-preview-days">{scheduledDays.map(({ day, starts }) => <div className="slot-preview-day" key={day}><strong>{day}</strong><span>{starts.slice(0, 5).map(formatTime).join(" · ")}{starts.length > 5 ? ` · +${starts.length - 5} more` : ""}</span></div>)}</div> : <p className="slot-preview-empty">No bookable hours are configured yet. Add your weekly hours to make appointment slots available.</p>}<button className="button button-quiet" type="button" onClick={openSettings}>Configure operating hours</button></div><button className="button button-primary"><Plus size={16} /> Save service</button></form></section></div>;
}

function CountersPanel({ counters, counterName, setCounterName, submit, setCounterStatus }) {
  return <div className="dashboard-columns align-start"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Service desks</p><h2>Your counters</h2></div></div>{counters.length ? <div className="table-scroll"><table><thead><tr><th>Counter</th><th>Status</th><th>Action</th></tr></thead><tbody>{counters.map((counter) => <tr key={counter.id}><td>{counter.name}</td><td><span className={`status-pill status-${counter.status}`}>{counter.status}</span></td><td><button className="button button-quiet" type="button" onClick={() => setCounterStatus(counter)}>{counter.status === "active" ? "Pause" : "Activate"}</button></td></tr>)}</tbody></table></div> : <p className="muted-copy">Create a counter to organize service queues.</p>}</section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Add a service desk</p><h2>New counter</h2></div></div><form className="stack-form" onSubmit={submit}><label>Counter name<input required value={counterName} onChange={(event) => setCounterName(event.target.value)} placeholder="Counter 1" /></label><button className="button button-primary"><Plus size={16} /> Create counter</button></form></section></div>;
}

function StaffPanel({ staff, counters, organization, form, setForm, submit }) {
  const isDoctor = form.role === "doctor";
  return (
    <div className="dashboard-columns align-start">
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Team access</p><h2>Staff and doctors</h2></div>
        </div>
        {staff.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Counter</th><th>Status</th></tr></thead>
              <tbody>{staff.map((member) => (
                <tr key={member.id}>
                  <td>{member.full_name}</td>
                  <td>{member.email}</td>
                  <td>{member.role}</td>
                  <td>{counters.find((item) => item.id === member.counter_id)?.name || "Unassigned"}</td>
                  <td>{member.status}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted-copy">Add staff accounts or doctor accounts for prescriptions.</p>}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Invite your team</p><h2>Create account</h2></div>
        </div>
        <form className="stack-form" onSubmit={submit}>
          <label>
            Account type
            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value, counter_id: "" })}
            >
              <option value="staff">Queue staff</option>
              <option value="doctor">Doctor (prescriptions)</option>
            </select>
          </label>
          <label>Full name<input required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
          <label>Email<input type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          <label>Initial password<input type="password" minLength="12" required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /><small>Share this initial password securely with the account holder.</small></label>
          {isDoctor ? (
            <>
              <div className="doctor-organization-id">
                <span>Organization</span>
                <strong>{organization.name}</strong>
                <small>Organization ID: <code>{organization.id}</code></small>
              </div>
              <label>Phone number<input type="tel" maxLength="32" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label>Specialization<input required maxLength="120" value={form.specialization} onChange={(event) => setForm({ ...form, specialization: event.target.value })} placeholder="e.g. Cardiology" /></label>
              <label>Qualification / degree<input required maxLength="200" value={form.qualification} onChange={(event) => setForm({ ...form, qualification: event.target.value })} placeholder="e.g. MBBS, MD" /></label>
              <label>Medical registration number<input required maxLength="80" value={form.registration_number} onChange={(event) => setForm({ ...form, registration_number: event.target.value })} /></label>
              <label>Years of experience<input type="number" min="0" max="80" step="1" required value={form.experience_years} onChange={(event) => setForm({ ...form, experience_years: event.target.value })} /></label>
              <label>Department<input required maxLength="120" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
              <label>Consultation fee<input type="number" min="0" step="0.01" required value={form.consultation_fee} onChange={(event) => setForm({ ...form, consultation_fee: event.target.value })} /><small>Enter the amount in your organization’s currency.</small></label>
            </>
          ) : (
            <label>
              Assigned counter
              <select value={form.counter_id} onChange={(event) => setForm({ ...form, counter_id: event.target.value })}>
                <option value="">Unassigned</option>
                {counters.map((counter) => <option value={counter.id} key={counter.id}>{counter.name}</option>)}
              </select>
            </label>
          )}
          <button className="button button-primary"><Plus size={16} /> Add {isDoctor ? "doctor" : "staff"}</button>
        </form>
      </section>
    </div>
  );
}

function DoctorsPanel({ doctors, organization, actionBusy, updateAvailability }) {
  const [tab, setTab] = useState("available");
  const activeDoctors = doctors.filter((doctor) => doctor.status === "active");
  const availableDoctors = activeDoctors.filter((doctor) => doctor.availability_status === "available");
  const occupiedDoctors = activeDoctors.filter((doctor) => doctor.availability_status === "occupied");
  const shownDoctors = tab === "available" ? availableDoctors : occupiedDoctors;

  return (
    <section className="content-stack">
      <PageTitle
        eyebrow="Organization doctors"
        title="Doctors"
        description="Review your doctors and keep their current availability up to date."
      />
      <section className="panel doctors-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Doctor roster</p><h2><Stethoscope size={18} /> {organization.name}</h2></div>
          <small className="muted-copy">Organization ID: {organization.id}</small>
        </div>
        <div className="workspace-tabs doctor-tabs" role="tablist" aria-label="Doctor availability">
          <button className={tab === "available" ? "is-selected" : ""} type="button" role="tab" aria-selected={tab === "available"} onClick={() => setTab("available")}>
            Available <span>{availableDoctors.length}</span>
          </button>
          <button className={tab === "occupied" ? "is-selected" : ""} type="button" role="tab" aria-selected={tab === "occupied"} onClick={() => setTab("occupied")}>
            Occupied <span>{occupiedDoctors.length}</span>
          </button>
        </div>
        <p className="estimate-disclaimer">Availability is maintained by your organization; update it when a doctor’s status changes.</p>
        {shownDoctors.length ? (
          <div className="doctor-roster-list">
            {shownDoctors.map((doctor) => (
              <article className="doctor-roster-card" key={doctor.id}>
                <div className="doctor-roster-title">
                  <div>
                    <h3>Dr. {doctor.full_name}</h3>
                    <p>{doctor.specialization} · {doctor.department}</p>
                  </div>
                  <span className={`status-pill status-${doctor.availability_status}`}>{doctor.availability_status}</span>
                </div>
                <dl className="doctor-details-grid">
                  <div><dt>Email</dt><dd>{doctor.email}</dd></div>
                  <div><dt>Phone</dt><dd>{doctor.phone}</dd></div>
                  <div><dt>Qualification</dt><dd>{doctor.qualification}</dd></div>
                  <div><dt>Registration</dt><dd>{doctor.registration_number}</dd></div>
                  <div><dt>Experience</dt><dd>{doctor.experience_years} years</dd></div>
                  <div><dt>Consultation fee</dt><dd>{doctor.consultation_fee}</dd></div>
                  <div><dt>Organization ID</dt><dd><code>{doctor.organization_id}</code></dd></div>
                </dl>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={actionBusy === doctor.id}
                  onClick={() => updateAvailability(doctor, tab === "available" ? "occupied" : "available")}
                >
                  {actionBusy === doctor.id ? "Updating…" : tab === "available" ? "Mark occupied" : "Mark available"}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">
            No active doctors are currently {tab}. Add doctors from the Staff section or update a doctor’s availability.
          </p>
        )}
        {doctors.some((doctor) => doctor.status !== "active") && (
          <p className="muted-copy">Inactive doctor accounts are hidden from the availability tabs.</p>
        )}
      </section>
    </section>
  );
}

function AppointmentsPanel({ appointments, manage, busyId }) {
  const [expandedId, setExpandedId] = useState("");
  const [prescriptionAppointment, setPrescriptionAppointment] = useState(null);
  const rows = Array.isArray(appointments) ? appointments : [];
  const selected = rows.find((item) => item.id === expandedId);
  return (
    <>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Visit bookings</p><h2>Appointments</h2></div><span className="status-pill status-active">{rows.length} appointments</span></div>
        {rows.length ? (
          <div className="table-scroll"><table>
            <thead><tr><th>Reference</th><th>Customer</th><th>Service</th><th>Time (UTC)</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{rows.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.reference}</strong></td><td>{item.customer_id.slice(0, 8)}</td><td>{item.service_name}</td>
                <td>{new Date(item.starts_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short", timeZone: "UTC" })}</td>
                <td><span className={`status-pill status-${item.status}`}>{item.status.replaceAll("_", " ")}</span></td>
                <td><div className="table-actions">
                  <button className="button button-quiet" type="button" aria-expanded={expandedId === item.id} onClick={() => setExpandedId((current) => current === item.id ? "" : item.id)}>{expandedId === item.id ? "Hide details" : "Details"}</button>
                  {["pending", "confirmed"].includes(item.status) && <><button className="button button-quiet" disabled={busyId === item.id} onClick={() => manage(item.id, "confirmed")}>Confirm</button><button className="button button-quiet danger-action" disabled={busyId === item.id} onClick={() => manage(item.id, "rejected")}>Reject</button></>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="muted-copy">Appointments will appear here after customers book.</p>}
        {selected && (
          <div className="appointment-customer-details">
            <div><span>Appointment</span><strong>{selected.reference}</strong></div>
            <div><span>Service</span><strong>{selected.service_name}</strong></div>
            <div><span>Scheduled time (UTC)</span><strong>{new Date(selected.starts_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })}</strong></div>
            <div className="customer-description"><span>Customer description</span><p>{selected.customer_notes?.trim() || "The customer did not provide a description."}</p></div>
            <div className="full-span"><button className="button button-primary" type="button" onClick={() => setPrescriptionAppointment(selected)}>Manage medications and prescription</button></div>
          </div>
        )}
      </section>
      {prescriptionAppointment && <AppointmentPrescriptionManager appointment={prescriptionAppointment} onClose={() => setPrescriptionAppointment(null)} />}
    </>
  );
}

function QueuePanel({ tokens, counters, scanToken, setScanToken, verifyQr, queueAction, callNext, actionBusy }) {
  return (
    <div className="content-stack">
      <div className="dashboard-columns align-start">
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Counter controls</p><h2>Call next customer</h2></div></div>
          {counters.length ? counters.map((counter) => (
            <div className="compact-row" key={counter.id}>
              <span className="compact-icon"><Building2 size={17} /></span>
              <span className="compact-copy"><strong>{counter.name}</strong><small>{counter.status}</small></span>
              <button
                className="button button-primary button-small"
                disabled={counter.status !== "active" || actionBusy === `call-${counter.id}`}
                onClick={() => callNext(counter.id)}
              >
                Call next <ArrowRight size={15} />
              </button>
            </div>
          )) : <p className="muted-copy">Create a counter before serving the queue.</p>}
        </section>
        <section className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Verify check-in</p><h2>Scan customer QR</h2></div></div>
          <p className="muted-copy">Paste the QR payload here, or focus this field and use a QR scanner that types into the active field.</p>
          <form className="stack-form" onSubmit={verifyQr}>
            <label>QR token<textarea rows="3" required value={scanToken} onChange={(event) => setScanToken(event.target.value)} /></label>
            <button className="button button-primary"><Check size={16} /> Verify and check in</button>
          </form>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Today's flow</p><h2>Queue activity</h2></div><span className="live-badge"><span /> Live</span></div>
        {tokens.length ? (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Token</th><th>Appointment</th><th>Service</th><th>Counter</th><th>Position</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{tokens.map((token) => (
                <tr key={token.id}>
                  <td><strong>{token.token_number}</strong></td><td>{token.reference}</td><td>{token.service_name}</td>
                  <td>{token.counter_name || "Unassigned"}</td><td>{token.queue_position}</td>
                  <td><span className={`status-pill status-${token.status}`}>{token.status.replaceAll("_", " ")}</span></td>
                  <td><div className="table-actions">
                    {token.status === "called" && <button className="button button-quiet" disabled={Boolean(actionBusy)} onClick={() => queueAction(token.id, "start")}>Start</button>}
                    {token.status === "serving" && <button className="button button-quiet" disabled={Boolean(actionBusy)} onClick={() => queueAction(token.id, "complete")}>Complete</button>}
                    {["checked_in", "called"].includes(token.status) && <button className="button button-quiet" disabled={Boolean(actionBusy)} onClick={() => queueAction(token.id, "skip")}>Skip</button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted-copy">No tokens in the queue yet.</p>}
      </section>
      <div className="queue-note">Call-next only selects customers who have checked in. Estimated waits can change during service.</div>
    </div>
  );
}

function FeedbackPanel({ feedback }) {
  return <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Customer experience</p><h2>Feedback and ratings</h2></div><span className="rating-summary"><Star size={16} />{feedback.length ? (feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(1) : "—"} / 5</span></div>{feedback.length ? <div className="feedback-list">{feedback.map((item) => <article className="feedback-item" key={item.id}><span className="feedback-rating"><Star size={15} />{item.rating}</span><p>{item.comments || "No written comment."}</p><small>{new Date(item.created_at).toLocaleDateString()}</small></article>)}</div> : <p className="muted-copy">Customer feedback appears after completed appointments.</p>}</section>;
}

function MedicationStockRow({ item, onSave, onRemove }) {
  const [quantity, setQuantity] = useState(String(item.quantity));
  useEffect(() => setQuantity(String(item.quantity)), [item.quantity]);
  return (
    <article className="medication-stock-row">
      <div className="medication-stock-name"><strong>{item.medication_name}</strong><small>Visible to customers with stock in their area</small></div>
      <label>Units in stock<input type="number" min="0" max="1000000" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      <div className="table-actions">
        <button className="button button-quiet" type="button" disabled={quantity === String(item.quantity)} onClick={() => onSave(item, quantity)}>Save stock</button>
        <button className="button button-quiet danger-action" type="button" onClick={() => onRemove(item)}>Remove</button>
      </div>
    </article>
  );
}

function MedicationCenterPanel({
  organization,
  items,
  catalog,
  selectedMedicationId,
  setSelectedMedicationId,
  quantity,
  setQuantity,
  newMedicationName,
  setNewMedicationName,
  addDirectoryItem,
  addStock,
  updateStock,
  removeStock,
}) {
  const availableCatalog = catalog.filter((medication) => !items.some((item) => item.medication_id === medication.id));
  const hasLocation = organization?.latitude != null && organization?.longitude != null;
  return (
    <div className="content-stack">
      <section className="panel medication-stock-location">
        <div className="panel-heading"><div><p className="eyebrow">Customer discovery</p><h2>Store location and contact</h2></div></div>
        {hasLocation ? (
          <p className="success-alert">Store location saved. Customers can see distance and an approximate travel time.</p>
        ) : (
          <div className="info-note">Add your store address, phone, and map coordinates in Settings → Organization details. Inventory is not shown in nearby searches until coordinates are set.</div>
        )}
        <p className="muted-copy">Address and contact number are taken from the organization profile. Customers see a rough travel-time estimate based on distance; it does not include live traffic or an exact route.</p>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Your organization only</p><h2>Medication stock</h2></div><span className="status-pill status-active">{items.length} items</span></div>
        <p className="muted-copy">Add or update your organization’s available quantity. Each organization maintains its own inventory; customers only see positive stock from active organizations.</p>
        <form className="medication-stock-add-form" onSubmit={addStock}>
          <label>Medication<select required value={selectedMedicationId} onChange={(event) => setSelectedMedicationId(event.target.value)}>
            <option value="">Select a medication</option>
            {availableCatalog.map((medication) => <option value={medication.id} key={medication.id}>{medication.name}</option>)}
          </select></label>
          <label>Quantity in stock<input required type="number" min="0" max="1000000" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
          <button className="button button-primary" type="submit" disabled={!selectedMedicationId}><Plus size={15} /> Add stock</button>
        </form>
        <details className="medication-directory-add">
          <summary>Add a medication name not in the list</summary>
          <p className="muted-copy">Medication names are shared for customer search; stock quantity remains private to this organization.</p>
          <form className="medication-stock-add-form" onSubmit={addDirectoryItem}>
            <label className="full-span">Medication name<input required minLength="2" maxLength="120" value={newMedicationName} onChange={(event) => setNewMedicationName(event.target.value)} placeholder="Enter the medication name" /></label>
            <button className="button button-quiet" type="submit">Add name to search list</button>
          </form>
        </details>
        {items.length ? (
          <div className="medication-stock-list">{items.map((item) => <MedicationStockRow key={item.id} item={item} onSave={updateStock} onRemove={removeStock} />)}</div>
        ) : <p className="muted-copy">No medication stock has been added for this organization.</p>}
      </section>
    </div>
  );
}

function SettingsPanel({
  organization,
  coordinates,
  setCoordinates,
  useOrganizationLocation,
  hours,
  setHours,
  holidays,
  medicationCatalog,
  catalogMedicationName,
  setCatalogMedicationName,
  saveHours,
  addHoliday,
  addCatalogMedication,
  setCatalogMedicationActive,
  updateOrganization,
}) {
  const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Organization details</p><h2>Profile and contact</h2></div></div>
        <form className="form-grid" onSubmit={updateOrganization}>
          <label>Name<input name="name" required defaultValue={organization?.name || ""} /></label>
          <label>Category<input name="category" defaultValue={organization?.category || ""} /></label>
          <label>Contact email<input name="email" type="email" defaultValue={organization?.email || ""} /></label>
          <label>Contact number<input name="contact_number" defaultValue={organization?.contact_number || ""} /></label>
          <label className="full-span">Address<input name="address" defaultValue={organization?.address || ""} /></label>
          <div className="full-span organization-location-fields">
            <div className="panel-heading">
              <div><p className="eyebrow">For nearby medication searches</p><h3>Store map location</h3></div>
              <button className="button button-quiet" type="button" onClick={useOrganizationLocation}><MapPin size={15} /> Use this device’s location</button>
            </div>
            <p className="muted-copy">Allow browser location while at your store, or enter coordinates manually. Customers use these coordinates to find your in-stock medications nearby.</p>
            <label>Latitude<input type="number" min="-90" max="90" step="any" value={coordinates.latitude} onChange={(event) => setCoordinates((current) => ({ ...current, latitude: event.target.value }))} /></label>
            <label>Longitude<input type="number" min="-180" max="180" step="any" value={coordinates.longitude} onChange={(event) => setCoordinates((current) => ({ ...current, longitude: event.target.value }))} /></label>
          </div>
          <label className="full-span">Description<textarea name="description" rows="3" defaultValue={organization?.description || ""} /></label>
          <div className="full-span"><button className="button button-primary">Save profile</button></div>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">UTC schedule</p><h2>Operating hours</h2></div></div>
        <p className="muted-copy">Customer appointment slots are created within these hours using each service’s duration as the interval. For example, a 30-minute service offers slots every 30 minutes.</p>
        <form className="hours-editor" onSubmit={saveHours}>
          {weekDays.map((day, weekday) => {
            const entry = hours.find((item) => item.weekday === weekday);
            return (
              <div className="hours-editor-row" key={day}>
                <strong>{day}</strong>
                <label className="closed-toggle"><input type="checkbox" checked={entry?.is_closed ?? true} onChange={(event) => {
                  const value = event.target.checked;
                  setHours((current) => [...current.filter((item) => item.weekday !== weekday), { weekday, opens_at: value ? null : "09:00:00", closes_at: value ? null : "17:00:00", is_closed: value }].sort((a, b) => a.weekday - b.weekday));
                }} />Closed</label>
                <input aria-label={`${day} opening time`} type="time" disabled={entry?.is_closed ?? true} value={entry?.opens_at?.slice(0, 5) || ""} onChange={(event) => setHours((current) => [...current.filter((item) => item.weekday !== weekday), { weekday, opens_at: `${event.target.value}:00`, closes_at: entry?.closes_at || "17:00:00", is_closed: false }].sort((a, b) => a.weekday - b.weekday))} />
                <span>to</span>
                <input aria-label={`${day} closing time`} type="time" disabled={entry?.is_closed ?? true} value={entry?.closes_at?.slice(0, 5) || ""} onChange={(event) => setHours((current) => [...current.filter((item) => item.weekday !== weekday), { weekday, opens_at: entry?.opens_at || "09:00:00", closes_at: `${event.target.value}:00`, is_closed: false }].sort((a, b) => a.weekday - b.weekday))} />
              </div>
            );
          })}
          <button className="button button-primary">Save operating hours</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Non-working days</p><h2>Holidays</h2></div></div>
        <form className="inline-form" onSubmit={addHoliday}>
          <label>Date<input type="date" name="holiday_date" required /></label>
          <label>Holiday name<input name="name" required maxLength={160} /></label>
          <button className="button button-primary">Add holiday</button>
        </form>
        <div className="holiday-list">{holidays.map((holiday) => <div className="compact-row" key={holiday.id}><span className="compact-icon"><CalendarDays size={16} /></span><span className="compact-copy"><strong>{holiday.name}</strong><small>{holiday.holiday_date}</small></span></div>)}</div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><p className="eyebrow">Doctor selection</p><h2>Medication catalog</h2></div></div>
        <p className="muted-copy">Add the medication names your clinicians may select when preparing a prescription. The doctor enters dosage and instructions for each appointment.</p>
        <form className="inline-form medication-catalog-form" onSubmit={addCatalogMedication}>
          <label className="full-span">Medication name<input required minLength={2} maxLength={120} value={catalogMedicationName} onChange={(event) => setCatalogMedicationName(event.target.value)} placeholder="Enter a clinic-approved medication name" /></label>
          <button className="button button-primary"><Plus size={16} /> Add to catalog</button>
        </form>
        {medicationCatalog.length ? (
          <div className="medication-catalog-list">
            {medicationCatalog.map((item) => (
              <div className="compact-row" key={item.id}>
                <span className="compact-copy"><strong>{item.name}</strong><small>{item.is_active ? "Available to doctors" : "Inactive"}</small></span>
                <button className={`button button-quiet${item.is_active ? " danger-action" : ""}`} type="button" onClick={() => setCatalogMedicationActive(item)}>{item.is_active ? "Deactivate" : "Reactivate"}</button>
              </div>
            ))}
          </div>
        ) : <p className="muted-copy">No medication names have been added to this organization yet.</p>}
      </section>
    </div>
  );
}

function StaffDashboard() {
  const [organizations, setOrganizations] = useState([]);
  const [organizationId, setOrganizationId] = useState("");
  const [membership, setMembership] = useState(null);
  const [queue, setQueue] = useState([]);
  const [qrToken, setQrToken] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/organizations/mine");
      setOrganizations(data);
      if (!organizationId && data.length) setOrganizationId(data[0].id);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }, [organizationId]);

  const loadQueue = useCallback(async () => {
    if (!organizationId) return;
    try {
      const [membershipResult, queueResult] = await Promise.all([
        api.get(`/organizations/${organizationId}/my-membership`),
        api.get(`/queue/organizations/${organizationId}`),
      ]);
      setMembership(membershipResult.data);
      setQueue(queueResult.data);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadQueue(); }, [loadQueue]);
  useQueueUpdates(organizationId, loadQueue);
  const selected = organizations.find((item) => item.id === organizationId);

  async function verify(event) {
    event.preventDefault();
    setBusy(true); setError(""); setInfo("");
    try {
      const { data } = await api.post("/queue/check-in", { qr_token: qrToken.trim() });
      setInfo(`Checked in ${data.token_number}.`);
      setQrToken("");
      await loadQueue();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function operate(tokenId, action) {
    setBusy(true); setError(""); setInfo("");
    try {
      const { data } = await api.post(`/queue/organizations/${organizationId}/tokens/${tokenId}/${action}`);
      setInfo(`${data.token_number} ${action === "start" ? "is now serving" : "has been completed"}.`);
      await loadQueue();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  async function callNext() {
    if (!membership?.counter_id) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const { data } = await api.post(`/queue/organizations/${organizationId}/counters/${membership.counter_id}/call-next`);
      setInfo(`Called token ${data.token_number}.`);
      await loadQueue();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }

  if (!organizations.length) return <EmptyState title="No counter assigned" description="Ask your organization administrator to add you to a team and assign a counter." />;
  async function toggleCounter() {
    if (!membership?.counter_id) return;
    const status = membership.counter_status === "active" ? "paused" : "active";
    try {
      await api.patch(`/queue/organizations/${organizationId}/counters/${membership.counter_id}/status`, { status });
      setInfo(`Counter ${status}.`);
      await loadQueue();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  return <section className="content-stack"><PageTitle eyebrow="Staff workspace" title={selected?.name || "Assigned counter"} description={`Counter: ${membership?.counter_name || "Not assigned"}. Verify check-ins and serve customers in order.`} action={organizations.length > 1 ? <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select> : null} /><Notice error={error} info={info} /><div className="dashboard-columns align-start"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">QR check-in</p><h2>Verify a customer</h2></div><ShieldCheck size={19} /></div><form className="stack-form" onSubmit={verify}><label>QR token<textarea rows="4" required value={qrToken} onChange={(event) => setQrToken(event.target.value)} placeholder="Scan with a keyboard QR scanner or paste the customer token." /></label><button className="button button-primary" disabled={busy}>Verify and check in</button></form></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Counter {membership?.counter_name || ""}</p><h2>Queue controls</h2></div><span className="live-badge"><span /> Live</span></div><button className="button button-primary" disabled={busy || !membership?.counter_id} onClick={callNext}>Call next checked-in token <ArrowRight size={16} /></button><button className="button button-quiet counter-toggle" disabled={busy || !membership?.counter_id} onClick={toggleCounter}>{membership?.counter_status === "active" ? "Pause counter" : "Resume counter"}</button><p className="estimate-disclaimer">Only customers who have checked in can be called.</p></section></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">Assigned counter</p><h2>Waiting queue</h2></div><span className="status-pill status-active">{queue.length} active</span></div>{queue.length ? <div className="queue-staff-list">{queue.map((token) => <article className="queue-staff-row" key={token.id}><span className="staff-token">{token.token_number}</span><div className="compact-copy"><strong>{token.service_name}</strong><small>{token.reference} · {token.customers_ahead} ahead · ~{token.estimated_wait_minutes} min estimate</small></div><span className={`status-pill status-${token.status}`}>{token.status.replaceAll("_", " ")}</span><div className="table-actions">{token.status === "called" && <button className="button button-quiet" disabled={busy} onClick={() => operate(token.id, "start")}>Start service</button>}{token.status === "serving" && <button className="button button-quiet" disabled={busy} onClick={() => operate(token.id, "complete")}>Complete</button>}</div></article>)}</div> : <p className="muted-copy">No checked-in customers are waiting at this counter.</p>}</section></section>;
}

function SuperAdminDashboard() {
  const [section, setSection] = useState("overview");
  const [metrics, setMetrics] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      if (section === "overview") {
        const { data } = await api.get("/admin/analytics");
        setMetrics(data);
      } else if (section === "organizations") {
        const { data } = await api.get("/admin/organizations");
        setOrganizations(data);
      } else if (section === "users") {
        const { data } = await api.get("/admin/users");
        setUsers(data);
      } else {
        const { data } = await api.get("/admin/audit-logs");
        setAuditLogs(data);
      }
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [section]);
  useEffect(() => { load(); }, [load]);

  async function setOrganizationStatus(id, status) {
    try {
      await api.patch(`/organizations/_admin/${id}/status?new_status=${status}`);
      await load();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }
  async function setUserStatus(id, active) {
    try {
      await api.patch(`/admin/users/${id}/active?is_active=${active}`);
      await load();
    } catch (requestError) { setError(getErrorMessage(requestError)); }
  }

  return <section className="content-stack"><PageTitle eyebrow="QueueLess platform" title="Platform control room" description="Platform-level organization approvals, usage, account status, and audit history." /><div className="workspace-tabs" role="tablist" aria-label="Platform sections">{[["overview", "Overview"], ["organizations", "Organizations"], ["users", "Users"], ["audit", "Audit log"]].map(([value, label]) => <button className={section === value ? "is-selected" : ""} type="button" role="tab" aria-selected={section === value} onClick={() => setSection(value)} key={value}>{label}</button>)}</div><Notice error={error} />{busy && <div className="empty-panel">Loading platform data…</div>}{!busy && section === "overview" && metrics && <div className="content-stack"><div className="metric-grid"><MetricCard label="Customers" value={metrics.customers} icon={Users} /><MetricCard label="Organizations" value={metrics.organizations} icon={Building2} tone="mint" /><MetricCard label="Active organizations" value={metrics.active_organizations} icon={ShieldCheck} tone="mint" /><MetricCard label="Appointments" value={metrics.appointments} icon={CalendarDays} /><MetricCard label="Waiting" value={metrics.queue.waiting} icon={Clock3} tone="amber" /><MetricCard label="Serving" value={metrics.queue.serving} icon={Activity} tone="purple" /></div><section className="panel"><div className="panel-heading"><div><p className="eyebrow">By organization</p><h2>Platform usage</h2></div></div>{metrics.organization_performance.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={300}><BarChart data={metrics.organization_performance}><CartesianGrid stroke="#edf0f5" vertical={false} /><XAxis dataKey="organization" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="appointments" fill="#2457d6" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="muted-copy">Platform activity will appear here as appointments are created.</p>}</section></div>}{!busy && section === "organizations" && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Tenant administration</p><h2>Organizations</h2></div></div><div className="table-scroll"><table><thead><tr><th>Organization</th><th>Category</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{organizations.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small className="table-subtext">{item.slug}</small></td><td>{item.category || "—"}</td><td><span className={`status-pill status-${item.status}`}>{item.status}</span></td><td>{new Date(item.created_at).toLocaleDateString()}</td><td><div className="table-actions">{item.status !== "active" && <button className="button button-quiet" onClick={() => setOrganizationStatus(item.id, "active")}>Approve</button>}{item.status !== "suspended" && <button className="button button-quiet danger-action" onClick={() => setOrganizationStatus(item.id, "suspended")}>Suspend</button>}{item.status !== "pending" && <button className="button button-quiet" onClick={() => setOrganizationStatus(item.id, "pending")}>Reopen</button>}</div></td></tr>)}</tbody></table></div></section>}{!busy && section === "users" && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Account administration</p><h2>Users</h2></div></div><div className="table-scroll"><table><thead><tr><th>User</th><th>Role</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map((item) => <tr key={item.id}><td><strong>{item.full_name}</strong><small className="table-subtext">{item.email}</small></td><td>{item.role}</td><td>{new Date(item.created_at).toLocaleDateString()}</td><td>{item.is_active ? "Active" : "Suspended"}</td><td>{item.id !== JSON.parse(localStorage.getItem("queueless.user") || "{}").id && <button className="button button-quiet" onClick={() => setUserStatus(item.id, !item.is_active)}>{item.is_active ? "Suspend" : "Activate"}</button>}</td></tr>)}</tbody></table></div></section>}{!busy && section === "audit" && <section className="panel"><div className="panel-heading"><div><p className="eyebrow">Administrative activity</p><h2>Audit log</h2></div></div>{auditLogs.length ? <div className="table-scroll"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>Organization</th></tr></thead><tbody>{auditLogs.map((item) => <tr key={item.id}><td>{new Date(item.created_at).toLocaleString()}</td><td>{item.action}</td><td>{item.entity_type} {item.entity_id?.slice(0, 8)}</td><td>{item.organization_id?.slice(0, 8) || "Platform"}</td></tr>)}</tbody></table></div> : <p className="muted-copy">Administrative activity will appear here.</p>}</section>}</section>;
}

export default function DashboardPage() {
  const { user, refreshUser } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [busy, setBusy] = useState(user?.role === "organization_admin" || user?.role === "staff");
  const [error, setError] = useState("");

  const loadOrganizations = useCallback(async () => {
    if (!["organization_admin", "staff"].includes(user?.role)) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get("/organizations/mine");
      setOrganizations(data);
    } catch (requestError) { setError(getErrorMessage(requestError)); }
    finally { setBusy(false); }
  }, [user?.role]);
  useEffect(() => { loadOrganizations(); }, [loadOrganizations]);
  async function createdOrganization() {
    await refreshUser();
    const { data } = await api.get("/organizations/mine");
    setOrganizations(data);
    setBusy(false);
  }

  if (user?.role === "super_admin") return <SuperAdminDashboard />;
  if (user?.role === "staff") return busy ? <div className="empty-panel">Loading staff workspace…</div> : <StaffDashboard />;
  if (user?.role === "doctor") return <DoctorDashboard />;
  if (user?.role === "organization_admin") {
    if (busy) return <div className="empty-panel">Loading organization workspace…</div>;
    if (organizations.length) return <OrganizationWorkspace organizations={organizations} refreshOrganizations={loadOrganizations} />;
    return <><Notice error={error} /><OrganizationApplication onCreated={createdOrganization} /></>;
  }
  return <CustomerDashboard />;
}
