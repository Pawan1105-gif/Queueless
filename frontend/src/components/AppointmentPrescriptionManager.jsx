import { useEffect, useRef, useState } from "react";
import { ArrowLeft, FileImage, Plus, Save, Search, Trash2, X } from "lucide-react";
import api, { getErrorMessage } from "../services/api.js";
import PrescriptionImageGallery from "./PrescriptionImageGallery.jsx";

const EMPTY_MEDICATION = {
  catalog_item_id: "",
  name: "",
  dosage: "",
  frequency: "",
  duration: "",
  instructions: "",
  medication_search: "",
};

export default function AppointmentPrescriptionManager({ appointment, onClose }) {
  const [prescription, setPrescription] = useState({ images: [], medications: [] });
  const [medications, setMedications] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [files, setFiles] = useState([]);
  const [mode, setMode] = useState("details");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const uploadRef = useRef(null);

  async function loadPrescription() {
    try {
      const { data } = await api.get(`/appointments/${appointment.id}/prescription`);
      setPrescription(data);
      setMedications(data.medications.map((item) => ({
        ...item,
        catalog_item_id: item.catalog_item_id || "",
        instructions: item.instructions || "",
        medication_search: item.name,
      })));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadPrescription();
  }, [appointment.id]);

  useEffect(() => {
    if (mode !== "medications") return;
    let active = true;
    api.get(`/organizations/${appointment.organization_id}/medication-catalog`)
      .then(({ data }) => { if (active) setCatalog(data); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); });
    return () => { active = false; };
  }, [appointment.organization_id, mode]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  function updateMedication(index, field, value) {
    setMedications((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  }

  async function saveMedications(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.put(`/appointments/${appointment.id}/prescription/medications`, {
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
      setMedications(data.map((item) => ({
        ...item,
        catalog_item_id: item.catalog_item_id || "",
        instructions: item.instructions || "",
        medication_search: item.name,
      })));
      setMessage("Medications saved and visible to the patient.");
      setMode("details");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function uploadImages(event) {
    event.preventDefault();
    if (!files.length) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        await api.post(`/appointments/${appointment.id}/prescription/images`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      setFiles([]);
      uploadRef.current?.reset();
      await loadPrescription();
      setMessage("Prescription image(s) uploaded and visible to the patient.");
      setMode("details");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      await loadPrescription();
    } finally {
      setSaving(false);
    }
  }

  async function deleteImage(imageId) {
    setSaving(true);
    setError("");
    try {
      await api.delete(`/appointments/${appointment.id}/prescription/images/${imageId}`);
      setMessage("Prescription image removed.");
      await loadPrescription();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="prescription-manager-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <section className="prescription-manager" role="dialog" aria-modal="true" aria-labelledby="prescription-manager-title">
        <header className="prescription-manager-header">
          <div><p className="eyebrow">Appointment {appointment.reference}</p><h2 id="prescription-manager-title">Medications and prescription</h2></div>
          <button className="icon-button" type="button" aria-label="Close prescription manager" onClick={onClose}><X size={18} /></button>
        </header>
        {error && <div className="form-alert" role="alert">{error}</div>}
        {message && <div className="success-alert" role="status">{message}</div>}
        {busy ? <p className="muted-copy">Loading clinical record…</p> : (
          <>
            <div className="prescription-manager-tabs" role="tablist" aria-label="Prescription management">
              <button type="button" role="tab" aria-selected={mode === "details"} className={mode === "details" ? "is-selected" : ""} onClick={() => setMode("details")}>Saved record</button>
              <button type="button" role="tab" aria-selected={mode === "medications"} className={mode === "medications" ? "is-selected" : ""} onClick={() => setMode("medications")}>Edit medications</button>
              <button type="button" role="tab" aria-selected={mode === "images"} className={mode === "images" ? "is-selected" : ""} onClick={() => setMode("images")}>Prescription images</button>
            </div>
            {mode === "details" && (
              <div className="content-stack">
                <div className="panel-heading"><h3>Prescribed medications</h3><button className="button button-quiet" type="button" onClick={() => setMode("medications")}><Search size={15} /> Edit medications</button></div>
                {prescription.medications.length ? <div className="prescribed-medication-list">{prescription.medications.map((item) => <article className="prescribed-medication" key={item.id}><h3>{item.name}</h3><dl><div><dt>Dosage</dt><dd>{item.dosage}</dd></div><div><dt>Frequency</dt><dd>{item.frequency}</dd></div><div><dt>Duration</dt><dd>{item.duration}</dd></div></dl>{item.instructions && <p>{item.instructions}</p>}</article>)}</div> : <p className="muted-copy">No medications have been prescribed yet.</p>}
                <div className="panel-heading"><h3>Prescription images</h3><button className="button button-quiet" type="button" onClick={() => setMode("images")}><FileImage size={15} /> Add images</button></div>
                {prescription.images.length ? <PrescriptionImageGallery appointmentId={appointment.id} images={prescription.images} /> : <p className="muted-copy">No prescription images have been uploaded yet.</p>}
              </div>
            )}
            {mode === "medications" && (
              <div className="content-stack">
                <button className="text-button back-link" type="button" onClick={() => setMode("details")}><ArrowLeft size={15} /> Saved record</button>
                <p className="muted-copy">Choose medication names from this organization’s catalog, then enter the prescribed details. Saved changes are immediately visible to the patient.</p>
                {catalog.length === 0 && <div className="info-note">The medication catalog is empty. Add approved names under Settings → Medication catalog first.</div>}
                <form className="stack-form clinical-medication-form" onSubmit={saveMedications}>
                  {medications.map((item, index) => {
                    const term = item.medication_search.trim().toLowerCase();
                    const matches = term ? catalog.filter((entry) => entry.name.toLowerCase().includes(term)).slice(0, 8) : [];
                    return (
                      <fieldset className="medication-editor" key={`${appointment.id}-${index}`}>
                        <legend>Medication {index + 1}</legend>
                        <div className="form-grid">
                          <div className="full-span medication-search-field">
                            <label>Search medication<input type="search" required maxLength="120" value={item.medication_search} onChange={(event) => {
                              const value = event.target.value;
                              setMedications((current) => current.map((medication, medicationIndex) => medicationIndex === index ? { ...medication, medication_search: value, catalog_item_id: "", name: "" } : medication));
                            }} placeholder="Type a catalog name" /></label>
                            {matches.length > 0 && <div className="medication-search-results" role="listbox" aria-label={`Medication matches for item ${index + 1}`}>{matches.map((entry) => <button type="button" role="option" key={entry.id} onClick={() => setMedications((current) => current.map((medication, medicationIndex) => medicationIndex === index ? { ...medication, catalog_item_id: entry.id, name: entry.name, medication_search: entry.name } : medication))}>{entry.name}</button>)}</div>}
                            {item.catalog_item_id && <small className="catalog-selection">Selected: {item.name}</small>}
                          </div>
                          <label>Dosage<input required maxLength="80" value={item.dosage} onChange={(event) => updateMedication(index, "dosage", event.target.value)} /></label>
                          <label>Frequency<input required maxLength="120" value={item.frequency} onChange={(event) => updateMedication(index, "frequency", event.target.value)} /></label>
                          <label>Duration<input required maxLength="120" value={item.duration} onChange={(event) => updateMedication(index, "duration", event.target.value)} /></label>
                          <label className="full-span">Instructions <span className="optional-label">Optional</span><textarea rows="2" maxLength="2000" value={item.instructions} onChange={(event) => updateMedication(index, "instructions", event.target.value)} /></label>
                        </div>
                        <button className="button button-quiet danger-action" type="button" onClick={() => setMedications((current) => current.filter((_, medicationIndex) => medicationIndex !== index))}><Trash2 size={15} /> Remove medication</button>
                      </fieldset>
                    );
                  })}
                  <button className="button button-quiet" type="button" disabled={medications.length >= 50} onClick={() => setMedications((current) => [...current, { ...EMPTY_MEDICATION }])}><Plus size={16} /> Add medication</button>
                  <button className="button button-primary" type="submit" disabled={saving || medications.some((item) => !item.catalog_item_id || !item.dosage.trim() || !item.frequency.trim() || !item.duration.trim())}><Save size={16} /> {saving ? "Saving…" : "Save medications"}</button>
                </form>
              </div>
            )}
            {mode === "images" && (
              <div className="content-stack">
                <button className="text-button back-link" type="button" onClick={() => setMode("details")}><ArrowLeft size={15} /> Saved record</button>
                <p className="muted-copy">Upload multiple JPEG, PNG, or WebP prescription pages (up to 5 MB each, 10 images per appointment).</p>
                <form className="stack-form" ref={uploadRef} onSubmit={uploadImages}>
                  <label>Prescription image pages<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
                  <small>{files.length} selected · {prescription.images.length} already saved.</small>
                  <button className="button button-primary" type="submit" disabled={saving || !files.length || prescription.images.length + files.length > 10}><FileImage size={16} /> {saving ? "Uploading…" : "Upload images"}</button>
                </form>
                {prescription.images.length ? (
                  <div className="prescription-manager-images">
                    <PrescriptionImageGallery appointmentId={appointment.id} images={prescription.images} />
                    {prescription.images.map((image) => <button className="button button-quiet danger-action" type="button" key={image.id} disabled={saving} onClick={() => deleteImage(image.id)}><Trash2 size={14} /> Delete {image.file_name}</button>)}
                  </div>
                ) : <p className="muted-copy">No prescription images have been uploaded yet.</p>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
