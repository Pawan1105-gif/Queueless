import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, FileImage, Plus, Save, Search, Trash2 } from "lucide-react";
import api, { getErrorMessage } from "../services/api.js";

const EMPTY_MEDICATION = {
  catalog_item_id: "",
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
  medication_search: "",
};

function formatAppointmentTime(value) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export default function DoctorDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [prescription, setPrescription] = useState({ images: [], medications: [] });
  const [medications, setMedications] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [mode, setMode] = useState("details");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const uploadFormRef = useRef(null);
  const prescriptionRequestRef = useRef(0);
  const selectedAppointment = appointments.find((item) => item.id === selectedId);

  const loadAppointments = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("/appointments");
      setAppointments(data);
      setSelectedId((current) => data.some((item) => item.id === current) ? current : data[0]?.id || "");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, []);

  const loadPrescription = useCallback(async (appointmentId = selectedId) => {
    const requestId = ++prescriptionRequestRef.current;
    if (!appointmentId) {
      setPrescription({ images: [], medications: [] });
      setMedications([]);
      return;
    }
    try {
      const { data } = await api.get(`/appointments/${appointmentId}/prescription`);
      if (requestId !== prescriptionRequestRef.current) return;
      setPrescription(data);
      setMedications(data.medications.map(({ id, position, ...item }) => ({
        ...item,
        catalog_item_id: item.catalog_item_id || "",
        instructions: item.instructions || "",
        medication_search: item.name,
      })));
    } catch (requestError) {
      if (requestId === prescriptionRequestRef.current) setError(getErrorMessage(requestError));
    }
  }, [selectedId]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);
  useEffect(() => { loadPrescription(); }, [loadPrescription]);
  useEffect(() => {
    let active = true;
    if (mode !== "medications" || !selectedAppointment) return undefined;
    api.get(`/organizations/${selectedAppointment.organization_id}/medication-catalog`)
      .then(({ data }) => { if (active) setCatalog(data); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); });
    return () => { active = false; };
  }, [mode, selectedAppointment]);

  function updateMedication(index, field, value) {
    setMedications((current) => current.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  }

  function chooseCatalogMedication(index, item) {
    setMedications((current) => current.map((medication, itemIndex) => (
      itemIndex === index
        ? { ...medication, catalog_item_id: item.id, name: item.name, medication_search: item.name }
        : medication
    )));
  }

  async function uploadImages(event) {
    event.preventDefault();
    if (!selectedFiles.length || !selectedId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append("file", file);
        await api.post(`/appointments/${selectedId}/prescription/images`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setSelectedFiles([]);
      uploadFormRef.current?.reset();
      setMessage("Prescription image(s) uploaded.");
      await loadPrescription(selectedId);
      setMode("details");
    } catch (requestError) {
      setSelectedFiles([]);
      uploadFormRef.current?.reset();
      setError(getErrorMessage(requestError));
      await loadPrescription(selectedId);
    } finally {
      setSaving(false);
    }
  }

  async function deleteImage(imageId) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await api.delete(`/appointments/${selectedId}/prescription/images/${imageId}`);
      setMessage("Prescription image removed.");
      await loadPrescription(selectedId);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function saveMedications(event) {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put(`/appointments/${selectedId}/prescription/medications`, {
        medications: medications.map((item) => ({
          catalog_item_id: item.catalog_item_id || null,
          name: item.name,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions.trim() || null,
        })),
      });
      setPrescription((current) => ({ ...current, medications: data }));
      setMedications(data.map(({ id, position, ...item }) => ({
        ...item,
        catalog_item_id: item.catalog_item_id || "",
        instructions: item.instructions || "",
        medication_search: item.name,
      })));
      setMessage("Prescribed medications updated.");
      setMode("details");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-stack">
      <header className="page-intro">
        <p className="eyebrow">Organization clinical workspace</p>
        <h1>Doctor workspace</h1>
        <p>Review appointment details, then manage the patient’s medication list or prescription images. Patients can view these records but cannot edit them.</p>
      </header>
      {error && <div className="form-alert" role="alert">{error}</div>}
      {message && <div className="success-alert" role="status">{message}</div>}
      <section className="panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Organization appointments</p><h2>Appointments</h2></div>
          <span className="status-pill status-active">{appointments.length} appointments</span>
        </div>
        {busy ? <p className="muted-copy">Loading appointments…</p> : appointments.length ? (
          <div className="doctor-appointment-list">
            {appointments.map((appointment) => (
              <button
                className={`doctor-appointment-item${selectedId === appointment.id ? " is-selected" : ""}`}
                type="button"
                key={appointment.id}
                disabled={saving}
                onClick={() => {
                  setSelectedId(appointment.id);
                  setMode("details");
                  setPrescription({ images: [], medications: [] });
                  setMedications([]);
                  setSelectedFiles([]);
                  uploadFormRef.current?.reset();
                  setError("");
                  setMessage("");
                }}
              >
                <span><strong>{appointment.reference}</strong><small>{appointment.service_name} · {formatAppointmentTime(appointment.starts_at)}</small></span>
                <span className={`status-pill status-${appointment.status}`}>{appointment.status.replaceAll("_", " ")}</span>
              </button>
            ))}
          </div>
        ) : <p className="muted-copy">No appointments are currently available to this doctor account.</p>}
      </section>

      {selectedAppointment && (
        <section className="panel clinical-appointment-panel">
          {mode === "details" ? (
            <>
              <div className="panel-heading">
                <div><p className="eyebrow">Appointment details</p><h2>{selectedAppointment.reference}</h2></div>
                <span className={`status-pill status-${selectedAppointment.status}`}>{selectedAppointment.status.replaceAll("_", " ")}</span>
              </div>
              <div className="clinical-appointment-facts">
                <div><span>Service</span><strong>{selectedAppointment.service_name}</strong></div>
                <div><span>Appointment time (UTC)</span><strong>{formatAppointmentTime(selectedAppointment.starts_at)}</strong></div>
                <div className="customer-description"><span>Description from customer</span><p>{selectedAppointment.customer_notes?.trim() || "The customer did not provide a description."}</p></div>
              </div>
              <div className="clinical-action-grid">
                <button className="clinical-action-card" type="button" onClick={() => { setMode("medications"); setError(""); setMessage(""); }}>
                  <Search size={19} /><strong>Manage medications</strong><span>Search the clinic catalog and record the prescription.</span>
                </button>
                <button className="clinical-action-card" type="button" onClick={() => { setMode("images"); setError(""); setMessage(""); }}>
                  <FileImage size={19} /><strong>Upload prescription</strong><span>Add one or more prescription image slides.</span>
                </button>
              </div>
              {(prescription.medications.length > 0 || prescription.images.length > 0) && (
                <p className="clinical-record-summary">{prescription.medications.length} medication(s) · {prescription.images.length} prescription image(s) already saved.</p>
              )}
            </>
          ) : (
            <>
              <button className="button button-quiet clinical-back-button" type="button" disabled={saving} onClick={() => setMode("details")}><ArrowLeft size={15} /> Appointment details</button>
              {mode === "images" ? (
                <>
                  <div className="panel-heading">
                    <div><p className="eyebrow">Clinical record · {selectedAppointment.reference}</p><h2>Upload prescription images</h2></div>
                    <span className="status-pill status-active">{prescription.images.length} / 10 slides</span>
                  </div>
                  <p className="muted-copy">Choose multiple clear JPEG, PNG, or WebP images (up to 5 MB each). They are saved in their selected order as prescription slides.</p>
                  <form className="stack-form" ref={uploadFormRef} onSubmit={uploadImages}>
                    <label>Choose prescription image slides<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setSelectedFiles(Array.from(event.target.files || []))} /></label>
                    <small>{selectedFiles.length} file(s) selected. Maximum 10 images per appointment.</small>
                    <button className="button button-primary" type="submit" disabled={saving || !selectedFiles.length || prescription.images.length + selectedFiles.length > 10}>
                      <FileImage size={16} /> {saving ? "Uploading…" : "Upload and return to appointment"}
                    </button>
                  </form>
                  {prescription.images.length ? (
                    <div className="prescription-image-grid">
                      {prescription.images.map((image, index) => (
                        <article className="prescription-image-item" key={image.id}>
                          <span className="prescription-slide-label">Slide {index + 1}</span>
                          <PrescriptionImage appointmentId={selectedId} image={image} />
                          <div className="prescription-image-actions">
                            <span title={image.file_name}>{image.file_name}</span>
                            <button className="icon-button danger-action" type="button" aria-label={`Delete ${image.file_name}`} disabled={saving} onClick={() => deleteImage(image.id)}><Trash2 size={15} /></button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <p className="muted-copy">No prescription images have been uploaded for this appointment.</p>}
                </>
              ) : (
                <>
                  <div className="panel-heading"><div><p className="eyebrow">Clinical record · {selectedAppointment.reference}</p><h2>Confirm prescribed medications</h2></div></div>
                  <p className="muted-copy">Select medication names from this organization’s catalog, then enter the doctor-prescribed dosage and instructions. QueueLess does not generate medical advice.</p>
                  {catalog.length === 0 && <div className="info-note">This organization’s medication catalog is empty. Ask an organization admin to add approved names under Settings → Medication catalog.</div>}
                  <form className="stack-form clinical-medication-form" onSubmit={saveMedications}>
                    {medications.map((medication, index) => {
                      const term = medication.medication_search.trim().toLowerCase();
                      const matches = term
                        ? catalog.filter((item) => item.name.toLowerCase().includes(term)).slice(0, 8)
                        : [];
                      return (
                        <fieldset className="medication-editor" key={`${selectedId}-${index}`}>
                          <legend>Medication {index + 1}</legend>
                          <div className="form-grid">
                            <div className="full-span medication-search-field">
                              <label>Search medication<input type="search" required maxLength="120" value={medication.medication_search} onChange={(event) => {
                                const value = event.target.value;
                                setMedications((current) => current.map((item, itemIndex) => itemIndex === index
                                  ? { ...item, medication_search: value, catalog_item_id: "", name: "" }
                                  : item));
                              }} placeholder="Type a clinic catalog name" /></label>
                              {matches.length > 0 && (
                                <div className="medication-search-results" role="listbox" aria-label={`Medication matches for item ${index + 1}`}>
                                  {matches.map((item) => <button type="button" role="option" aria-selected={medication.catalog_item_id === item.id} key={item.id} onClick={() => chooseCatalogMedication(index, item)}>{item.name}</button>)}
                                </div>
                              )}
                              {medication.catalog_item_id && <small className="catalog-selection">Selected: {medication.name}</small>}
                              {term && matches.length === 0 && <small>No active catalog medication matches. Ask the organization admin to add it first.</small>}
                            </div>
                            <label>Dosage<input required maxLength="80" value={medication.dosage} onChange={(event) => updateMedication(index, "dosage", event.target.value)} /></label>
                            <label>Frequency<input required maxLength="120" value={medication.frequency} onChange={(event) => updateMedication(index, "frequency", event.target.value)} /></label>
                            <label>Duration<input required maxLength="120" value={medication.duration} onChange={(event) => updateMedication(index, "duration", event.target.value)} /></label>
                            <label className="full-span">Instructions <span className="optional-label">Optional</span><textarea rows="2" maxLength="2000" value={medication.instructions} onChange={(event) => updateMedication(index, "instructions", event.target.value)} /></label>
                          </div>
                          <button className="button button-quiet danger-action" type="button" onClick={() => setMedications((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /> Remove medication</button>
                        </fieldset>
                      );
                    })}
                    <button className="button button-quiet" type="button" disabled={medications.length >= 50} onClick={() => setMedications((current) => [...current, { ...EMPTY_MEDICATION }])}>
                      <Plus size={16} /> Add medication
                    </button>
                    <button className="button button-primary" type="submit" disabled={saving || medications.some((item) => !item.catalog_item_id || !item.dosage.trim() || !item.frequency.trim() || !item.duration.trim())}>
                      <Save size={16} /> {saving ? "Saving…" : "Confirm medications"}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </section>
      )}
      {!selectedAppointment && !busy && appointments.length === 0 && (
        <div className="empty-panel"><CalendarDays size={24} /><h2>Waiting for appointments</h2><p>Prescriptions can be added after a patient appointment is available to your organization.</p></div>
      )}
    </section>
  );
}

function PrescriptionImage({ appointmentId, image }) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    api.get(`/appointments/${appointmentId}/prescription/images/${image.id}`, { responseType: "blob" })
      .then(({ data }) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(data);
        setSource(objectUrl);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [appointmentId, image.id]);

  if (error) return <p className="form-alert" role="alert">{error}</p>;
  if (!source) return <div className="prescription-image-placeholder">Loading image…</div>;
  return <img className="prescription-image" src={source} alt={`Prescription: ${image.file_name}`} />;
}
