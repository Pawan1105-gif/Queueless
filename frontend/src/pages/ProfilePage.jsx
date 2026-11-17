import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  CircleUserRound,
  FileImage,
  KeyRound,
  Save,
  Trash2,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import api, { getErrorMessage } from "../services/api.js";
import PrescriptionImageGallery from "../components/PrescriptionImageGallery.jsx";

const HISTORY_STATUSES = new Set(["completed", "cancelled", "rejected", "no_show"]);
const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

function formatAppointmentDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AppointmentHistoryEntry({ appointment }) {
  const [expanded, setExpanded] = useState(false);
  const [prescription, setPrescription] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [recordError, setRecordError] = useState("");

  async function toggleRecords() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!prescription) {
      setLoadingRecords(true);
      setRecordError("");
      try {
        const { data } = await api.get(`/appointments/${appointment.id}/prescription`);
        setPrescription(data);
      } catch (requestError) {
        setRecordError(getErrorMessage(requestError));
      } finally {
        setLoadingRecords(false);
      }
    }
    setExpanded(true);
  }

  return (
    <article className="profile-history-item">
      <div className="profile-history-summary">
        <div className="profile-history-icon" aria-hidden="true"><CalendarDays size={18} /></div>
        <div className="profile-history-main">
          <strong>{appointment.organization_name}</strong>
          <span>{appointment.service_name}</span>
          <small>{formatAppointmentDate(appointment.starts_at)}</small>
        </div>
        <span className={`profile-status profile-status-${appointment.status}`}>
          {appointment.status.replaceAll("_", " ")}
        </span>
        <button
          className="button button-quiet profile-record-toggle"
          type="button"
          onClick={toggleRecords}
          aria-expanded={expanded}
          aria-controls={`records-${appointment.id}`}
        >
          <FileImage size={15} />
          {loadingRecords ? "Loading…" : expanded ? "Hide records" : "View records"}
        </button>
      </div>
      <div className="profile-history-meta">
        <span>Reference: {appointment.reference}</span>
        {appointment.token_number && <span>Queue token: {appointment.token_number}</span>}
      </div>
      {appointment.customer_notes && (
        <p className="profile-appointment-notes"><strong>Your notes:</strong> {appointment.customer_notes}</p>
      )}
      {expanded && (
        <section className="profile-records" id={`records-${appointment.id}`} aria-label="Appointment medical records">
          {recordError ? (
            <p className="form-alert" role="alert">{recordError}</p>
          ) : !prescription ? (
            <p className="muted-copy">Loading appointment records…</p>
          ) : (
            <>
              <div>
                <h3>Prescribed medications</h3>
                {prescription.medications.length ? (
                  <ul className="profile-medication-list">
                    {prescription.medications.map((medication) => (
                      <li key={medication.id}>
                        <strong>{medication.name}</strong>
                        <span>{medication.dosage} · {medication.frequency} · {medication.duration}</span>
                        {medication.instructions && <small>{medication.instructions}</small>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted-copy">No medications have been prescribed for this appointment.</p>}
              </div>
              <div>
                <h3>Prescription images</h3>
                <PrescriptionImageGallery
                  appointmentId={appointment.id}
                  images={prescription.images}
                />
              </div>
            </>
          )}
        </section>
      )}
    </article>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const fileInput = useRef(null);
  const [profile, setProfile] = useState({
    full_name: user?.full_name || "",
    phone: user?.phone || "",
  });
  const [password, setPassword] = useState({ current_password: "", new_password: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState("");
  const [photoVersion, setPhotoVersion] = useState(0);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentsError, setAppointmentsError] = useState("");

  const history = useMemo(() => {
    const now = Date.now();
    return appointments.filter((appointment) => (
      HISTORY_STATUSES.has(appointment.status) ||
      new Date(appointment.starts_at).getTime() < now
    ));
  }, [appointments]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setPhoto("");
    api.get("/auth/me/profile-image", { responseType: "blob" })
      .then(({ data }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(data);
        setPhoto(objectUrl);
      })
      .catch((requestError) => {
        if (active && requestError.response?.status !== 404) {
          setPhotoError(getErrorMessage(requestError));
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [user?.id, photoVersion]);

  useEffect(() => {
    if (user?.role !== "customer") {
      setAppointmentsLoading(false);
      return undefined;
    }
    let active = true;
    api.get("/appointments")
      .then(({ data }) => { if (active) setAppointments(data); })
      .catch((requestError) => {
        if (active) setAppointmentsError(getErrorMessage(requestError));
      })
      .finally(() => { if (active) setAppointmentsLoading(false); });
    return () => { active = false; };
  }, [user?.role]);

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await api.patch("/auth/me", profile);
      await refreshUser();
      setInfo("Profile updated.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await api.post("/auth/change-password", password);
      setPassword({ current_password: "", new_password: "" });
      setInfo("Password changed. Sign in again on other devices.");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoError("");
    setPhotoMessage("");
    if (file.size > MAX_PROFILE_IMAGE_BYTES) {
      setPhotoError("Choose an image that is 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    setPhotoBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.put("/auth/me/profile-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setPhotoVersion((version) => version + 1);
      setPhotoMessage("Profile photo updated.");
    } catch (requestError) {
      setPhotoError(getErrorMessage(requestError));
    } finally {
      setPhotoBusy(false);
      event.target.value = "";
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setPhotoError("");
    setPhotoMessage("");
    try {
      await api.delete("/auth/me/profile-image");
      setPhotoVersion((version) => version + 1);
      setPhotoMessage("Profile photo removed.");
    } catch (requestError) {
      setPhotoError(getErrorMessage(requestError));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <section className="content-stack profile-page">
      <div className="page-intro">
        <p className="eyebrow">Account settings</p>
        <h1>Your profile</h1>
        <p>Manage your personal information, profile photo, appointments, and medical records.</p>
      </div>
      {error && <div className="form-alert" role="alert">{error}</div>}
      {info && <div className="success-alert" role="status">{info}</div>}

      <section className="panel profile-overview">
        <div className="profile-photo-wrap">
          <div className="profile-photo" aria-label="Profile photo">
            {photo ? (
              <img src={photo} alt={`${user?.full_name || "Your"} profile`} />
            ) : (
              <span>{user?.full_name?.trim().charAt(0).toUpperCase() || <CircleUserRound size={36} />}</span>
            )}
          </div>
          <div className="profile-photo-actions">
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={uploadPhoto}
              aria-label="Choose profile photo"
            />
            <button
              className="button button-secondary"
              type="button"
              disabled={photoBusy}
              onClick={() => fileInput.current?.click()}
            >
              <Camera size={16} /> {photoBusy ? "Saving…" : photo ? "Change photo" : "Add photo"}
            </button>
            {photo && (
              <button
                className="button button-quiet"
                type="button"
                disabled={photoBusy}
                onClick={removePhoto}
              >
                <Trash2 size={15} /> Remove
              </button>
            )}
            <small>JPEG, PNG, or WebP · 5 MB maximum</small>
          </div>
        </div>
        <div className="profile-overview-details">
          <p className="eyebrow">Personal account</p>
          <h2>{user?.full_name || "Your account"}</h2>
          <p>{user?.email}</p>
          <div className="profile-facts">
            <span><strong>Role</strong>{user?.role?.replaceAll("_", " ") || "—"}</span>
            <span><strong>Member since</strong>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</span>
            <span><strong>Phone</strong>{user?.phone || "Not provided"}</span>
          </div>
          {(photoError || photoMessage) && (
            <p className={photoError ? "form-alert" : "success-alert"} role={photoError ? "alert" : "status"}>
              {photoError || photoMessage}
            </p>
          )}
        </div>
      </section>

      <div className="dashboard-columns align-start">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Personal information</p>
              <h2><CircleUserRound size={18} /> Profile details</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={saveProfile}>
            <label>
              Full name
              <input
                required
                minLength={1}
                maxLength={160}
                value={profile.full_name}
                onChange={(event) => setProfile({ ...profile, full_name: event.target.value })}
              />
            </label>
            <label>Email address<input disabled value={user?.email || ""} /></label>
            <label>
              Phone
              <input
                maxLength={32}
                value={profile.phone}
                onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
              />
            </label>
            <label>Account role<input disabled value={user?.role?.replaceAll("_", " ") || ""} /></label>
            <button className="button button-primary" disabled={busy}>
              <Save size={16} /> Save changes
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Account security</p>
              <h2><KeyRound size={18} /> Change password</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={changePassword}>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password.current_password}
                onChange={(event) => setPassword({ ...password, current_password: event.target.value })}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password.new_password}
                onChange={(event) => setPassword({ ...password, new_password: event.target.value })}
              />
              <small>Use at least 12 characters.</small>
            </label>
            <button className="button button-primary" disabled={busy}>Update password</button>
          </form>
        </section>
      </div>

      {user?.role === "customer" && (
        <section className="panel profile-history-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Appointments and records</p>
              <h2><CalendarDays size={18} /> Past appointments</h2>
            </div>
            <span className="profile-history-count">{history.length}</span>
          </div>
          {appointmentsLoading ? (
            <p className="muted-copy">Loading your appointment history…</p>
          ) : appointmentsError ? (
            <div className="form-alert" role="alert">{appointmentsError}</div>
          ) : history.length ? (
            <div className="profile-history-list">
              {history.map((appointment) => (
                <AppointmentHistoryEntry key={appointment.id} appointment={appointment} />
              ))}
            </div>
          ) : (
            <p className="muted-copy">Your past appointments and their medical records will appear here.</p>
          )}
        </section>
      )}
    </section>
  );
}
