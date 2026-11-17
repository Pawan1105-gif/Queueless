import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import api, { getErrorMessage } from "../services/api.js";

function usePrescriptionImage(appointmentId, imageId) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSource("");
    setError("");
    api.get(`/appointments/${appointmentId}/prescription/images/${imageId}`, { responseType: "blob" })
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
  }, [appointmentId, imageId]);

  return { source, error };
}

function SecurePrescriptionImage({ appointmentId, image, className = "" }) {
  const { source, error } = usePrescriptionImage(appointmentId, image.id);
  if (error) return <span className="prescription-image-placeholder" role="alert">{error}</span>;
  if (!source) return <span className="prescription-image-placeholder">Loading image…</span>;
  return <img className={className || "prescription-image"} src={source} alt={`Prescription: ${image.file_name}`} />;
}

export default function PrescriptionImageGallery({ appointmentId, images }) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeImage = images[activeIndex];

  useEffect(() => {
    if (!activeImage) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setActiveIndex(-1);
      if (event.key === "ArrowLeft") setActiveIndex((index) => (index - 1 + images.length) % images.length);
      if (event.key === "ArrowRight") setActiveIndex((index) => (index + 1) % images.length);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeImage, images.length]);

  return (
    <>
      {images.length ? (
        <div className="prescription-image-grid">
          {images.map((image, index) => (
            <button className="prescription-gallery-thumb" type="button" key={image.id} onClick={() => setActiveIndex(index)} aria-label={`View prescription image ${index + 1}: ${image.file_name}`}>
              <SecurePrescriptionImage appointmentId={appointmentId} image={image} />
              <span>Prescription {index + 1} · {image.file_name}</span>
            </button>
          ))}
        </div>
      ) : <p className="muted-copy">No prescription images have been shared for this appointment yet.</p>}
      {activeImage && (
        <div className="prescription-viewer-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setActiveIndex(-1);
        }}>
          <section className="prescription-viewer" role="dialog" aria-modal="true" aria-label="Prescription image viewer">
            <header><span>{activeImage.file_name} · {activeIndex + 1} of {images.length}</span><button className="icon-button" type="button" aria-label="Close image viewer" onClick={() => setActiveIndex(-1)}><X size={18} /></button></header>
            <div className="prescription-viewer-image"><SecurePrescriptionImage appointmentId={appointmentId} image={activeImage} className="prescription-image prescription-image-large" /></div>
            {images.length > 1 && (
              <footer>
                <button className="button button-quiet" type="button" onClick={() => setActiveIndex((index) => (index - 1 + images.length) % images.length)}><ChevronLeft size={16} /> Previous</button>
                <button className="button button-quiet" type="button" onClick={() => setActiveIndex((index) => (index + 1) % images.length)}>Next <ChevronRight size={16} /></button>
              </footer>
            )}
          </section>
        </div>
      )}
    </>
  );
}
