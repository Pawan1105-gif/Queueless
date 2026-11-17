import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Atom,
  Bone,
  CircleHelp,
  Info,
  RotateCcw,
  Scan,
  Wind,
} from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const anatomy = [
  {
    id: "whole-body",
    name: "Whole body",
    system: "Muscles and skeleton",
    color: "#5bd6dc",
    icon: Atom,
    summary: "Muscles and bones working together",
    description: "The musculoskeletal system supports the body, protects structures, and creates movement through coordinated work between bones, muscles, and connective tissues.",
    facts: ["Bones provide support and attachment points", "Muscles produce movement by contracting", "Tendons connect many muscles to bones"],
  },
  {
    id: "head",
    name: "Head & face",
    system: "Muscles and skeleton",
    color: "#b695ff",
    icon: Atom,
    summary: "A coordinated set of structures",
    description: "The skull protects the brain, while the muscles of the face and jaw support expression, chewing, and other movements.",
    facts: ["The skull is made of several bones", "Jaw muscles help move the mandible", "Facial muscles attach to skin and bone"],
  },
  {
    id: "spine",
    name: "Spine",
    system: "Skeletal system",
    color: "#ffe08b",
    icon: Bone,
    summary: "Support, movement, and protection",
    description: "The spine supports the body and protects the spinal cord. Vertebrae, cushioning discs, and surrounding muscles work together to allow movement.",
    facts: ["The spine has cervical, thoracic, and lumbar regions", "Discs cushion many vertebrae", "Deep back muscles help stabilize the spine"],
  },
  {
    id: "chest",
    name: "Chest",
    system: "Muscles and skeleton",
    color: "#59dddb",
    icon: Wind,
    summary: "A strong, mobile protective wall",
    description: "The rib cage protects organs in the chest. Muscles across the chest and between the ribs contribute to movement and breathing.",
    facts: ["The rib cage includes ribs and the sternum", "Pectoral muscles move the shoulder and arm", "The diaphragm is the main muscle of breathing"],
  },
  {
    id: "arms",
    name: "Arms & hands",
    system: "Muscular and skeletal systems",
    color: "#ffad67",
    icon: Activity,
    summary: "Built for reach, grip, and precision",
    description: "Arm and hand bones provide a light but strong framework. Muscles and tendons coordinate large movements with fine control of the fingers.",
    facts: ["The radius and ulna form the forearm", "The hand contains many small bones", "Tendons connect muscles to bones"],
  },
  {
    id: "abdomen",
    name: "Abdomen",
    system: "Muscular system",
    color: "#ffc46b",
    icon: Activity,
    summary: "Core muscles support the trunk",
    description: "Layers of abdominal muscle help support the trunk, move the torso, and contribute to pressure changes used in everyday actions.",
    facts: ["The abdominal wall has several muscle layers", "Core muscles work with the back muscles", "The rectus abdominis runs along the front of the trunk"],
  },
  {
    id: "back",
    name: "Back",
    system: "Muscular system",
    color: "#e978bf",
    icon: Activity,
    summary: "Muscles that support posture and movement",
    description: "Superficial and deep back muscles connect the trunk, shoulders, and spine. Together they help stabilize and move the upper body.",
    facts: ["The trapezius spans the upper back", "The latissimus dorsi links the trunk to the arm", "Deep muscles help control spinal movement"],
  },
  {
    id: "pelvis",
    name: "Pelvis & hips",
    system: "Muscular and skeletal systems",
    color: "#7ee3a5",
    icon: Bone,
    summary: "A stable link between trunk and legs",
    description: "The pelvis transfers forces between the spine and lower limbs. Surrounding muscles support the hip and help move the thigh.",
    facts: ["The pelvis supports the trunk", "Gluteal muscles move and stabilize the hip", "Hip muscles work during walking and standing"],
  },
  {
    id: "legs",
    name: "Legs & feet",
    system: "Muscular and skeletal systems",
    color: "#7aa9ff",
    icon: Bone,
    summary: "Strength and balance from hip to toe",
    description: "The lower-limb bones carry body weight while muscles around the thigh, lower leg, and foot support standing and movement.",
    facts: ["The femur is the thigh bone", "The calf includes several muscles", "Foot bones and muscles help maintain balance"],
  },
];

const initialPart = anatomy.find((part) => part.id === "chest");
const anatomyModelUrl = `${import.meta.env.BASE_URL}models/ecorche.meshopt.glb`;

function classifyStructure(name, layer) {
  const value = name.toLowerCase();
  if (/skull|cranium|frontal|parietal|occipital|sphenoid|ethmoid|temporal bone|mandible|maxilla|masseter|temporalis|facial|orbicularis|zygomaticus|frontalis/.test(value)) return "head";
  if (/vertebr|spine|atlas|axis|sacrum|coccyx|intervertebral|multifidus|rotatores|erector spinae|longissimus|spinalis/.test(value)) return "spine";
  if (/pectoralis|sternum|rib|intercostal|serratus|thoracic|diaphragm/.test(value)) return "chest";
  if (/biceps brachii|triceps brachii|deltoid|brachialis|forearm|radius|ulna|humerus|carpi|hand|finger|metacarpal|thenar|hypothenar|opponens|pollicis|lumbrical|interosseous|brachioradialis|wrist|palm/.test(value)) return "arms";
  if (/abdominal|rectus abdominis|oblique|transversus abdominis/.test(value)) return "abdomen";
  if (/trapezius|latissimus|rhomboid|back|thoracolumbar|teres major|teres minor/.test(value)) return "back";
  if (/glute|iliacus|psoas|piriformis|obturator|pelvis|pelvic|hip|ischium|ilium|pubis/.test(value)) return "pelvis";
  if (/femur|quadriceps|hamstring|biceps femoris|tibia|fibula|gastrocnemius|soleus|triceps surae|tibialis|patella|foot|talus|calcane|metatarsal|tarsal|toe|plantar|leg/.test(value)) return "legs";
  if (layer === "skeleton") return "spine";
  return "whole-body";
}

function disposeObject(root) {
  root.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = new Set([
      ...(Array.isArray(object.material) ? object.material : object.material ? [object.material] : []),
      ...(object.userData.baseMaterials || []),
      ...(object.userData.highlightMaterials || []),
    ]);
    materials.forEach((material) => material.dispose());
  });
}

function AnatomyScene({ selectedId, onSelect, reducedMotion, resetRotationRef, layerVisibility }) {
  const hostRef = useRef(null);
  const selectRef = useRef(onSelect);
  const selectedRef = useRef(selectedId);
  const layerVisibilityRef = useRef(layerVisibility);

  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { layerVisibilityRef.current = layerVisibility; }, [layerVisibility]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    } catch (error) {
      console.error("Unable to initialize the anatomy 3D view.", error);
      host.dataset.webglError = "true";
      return undefined;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional human muscle and skeleton model. Select a body structure to learn about it.");
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    camera.position.set(1.4, 0.3, 4.8);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight("#d9f5ff", "#17213c", 2.4));
    const keyLight = new THREE.PointLight("#8deaff", 38, 12);
    keyLight.position.set(-3.2, 4.1, 5);
    scene.add(keyLight);
    const rimLight = new THREE.PointLight("#a386ff", 46, 12);
    rimLight.position.set(3.2, 1.2, -3);
    scene.add(rimLight);
    const frontLight = new THREE.PointLight("#ffffff", 18, 10);
    frontLight.position.set(1.5, 1, 5);
    scene.add(frontLight);

    const body = new THREE.Group();
    const initialRotation = 0;
    body.rotation.y = initialRotation;
    body.position.y = -0.14;
    scene.add(body);
    resetRotationRef.current = () => body.rotation.set(0, initialRotation, 0);
    host.dataset.modelLoading = "true";
    let disposed = false;
    let loadedRoot = null;
    const partMeshes = new Map(anatomy.map((part) => [part.id, []]));
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

    loader.loadAsync(anatomyModelUrl).then((gltf) => {
      if (disposed) {
        disposeObject(gltf.scene);
        return;
      }
      loadedRoot = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(loadedRoot);
      const center = bounds.getCenter(new THREE.Vector3());
      const height = bounds.getSize(new THREE.Vector3()).y;
      loadedRoot.position.set(-center.x, -center.y, -center.z);
      if (height > 0) loadedRoot.scale.multiplyScalar(2.35 / height);
      loadedRoot.traverse((object) => {
        if (!object.isMesh) return;
        const structureName = object.userData.name || object.name || "Anatomical structure";
        const partId = classifyStructure(structureName, object.userData.layer);
        object.userData.anatomyPart = partId;
        object.userData.structureName = structureName;
        const baseMaterials = Array.isArray(object.material) ? object.material : [object.material];
        const highlightMaterials = baseMaterials.map((material) => {
          const highlight = material.clone();
          if (highlight.emissive) {
            highlight.emissive.set("#51e4ff");
            highlight.emissiveIntensity = Math.max(highlight.emissiveIntensity || 0, 0.5);
          }
          return highlight;
        });
        object.userData.baseMaterials = baseMaterials;
        object.userData.highlightMaterials = highlightMaterials;
        object.material = Array.isArray(object.material) ? baseMaterials : baseMaterials[0];
        object.userData.isHighlighted = false;
        partMeshes.get(partId).push(object);
      });
      body.add(loadedRoot);
      host.dataset.modelLoading = "false";
    }).catch((error) => {
      if (disposed) return;
      console.error("Unable to load the licensed anatomy model.", error);
      host.dataset.modelLoading = "false";
      host.dataset.modelError = "true";
    });

    const particles = new THREE.BufferGeometry();
    const points = [];
    for (let index = 0; index < 280; index += 1) {
      points.push((Math.random() - 0.5) * 11, (Math.random() - 0.5) * 8, -1.8 - Math.random() * 5);
    }
    particles.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const stars = new THREE.Points(
      particles,
      new THREE.PointsMaterial({ color: "#8cd9f1", size: 0.018, transparent: true, opacity: 0.45 }),
    );
    scene.add(stars);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragStart = null;
    let dragMoved = false;
    let animationFrame = 0;

    function resize() {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    function updatePointer(event) {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    }

    function getAnatomyPart(object) {
      let candidate = object;
      while (candidate && candidate !== body) {
        if (candidate.userData.anatomyPart) return candidate;
        candidate = candidate.parent;
      }
      return null;
    }

    function onPointerDown(event) {
      dragStart = { x: event.clientX, rotation: body.rotation.y };
      dragMoved = false;
      renderer.domElement.setPointerCapture?.(event.pointerId);
    }

    function onPointerMove(event) {
      if (dragStart && event.buttons === 1) {
        const delta = event.clientX - dragStart.x;
        if (Math.abs(delta) > 4) dragMoved = true;
        body.rotation.y = dragStart.rotation + delta * 0.009;
        return;
      }
      updatePointer(event);
      const hit = raycaster.intersectObjects(body.children, true).find((item) => getAnatomyPart(item.object));
      renderer.domElement.style.cursor = hit ? "pointer" : "grab";
    }

    function onPointerUp(event) {
      renderer.domElement.releasePointerCapture?.(event.pointerId);
      dragStart = null;
    }

    function onClick(event) {
      if (dragMoved) return;
      updatePointer(event);
      const hit = raycaster.intersectObjects(body.children, true).find((item) => getAnatomyPart(item.object));
      if (!hit) return;
      const structure = getAnatomyPart(hit.object);
      selectRef.current(structure.userData.anatomyPart, structure.userData.structureName);
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("click", onClick);

    const clock = new THREE.Timer();
    clock.connect(document);
    function animate() {
      if (disposed) return;
      clock.update();
      stars.rotation.y += reducedMotion ? 0 : 0.00018;
      const visibility = layerVisibilityRef.current;
      for (const meshes of partMeshes.values()) {
        for (const mesh of meshes) {
          const layer = mesh.userData.layer;
          if (layer === "skeleton") mesh.visible = visibility.skeleton;
          else mesh.visible = visibility.muscles;
          const highlighted = selectedRef.current === mesh.userData.anatomyPart && mesh.visible;
          if (mesh.userData.isHighlighted !== highlighted) {
            mesh.material = highlighted ? mesh.userData.highlightMaterials : mesh.userData.baseMaterials;
            if (Array.isArray(mesh.userData.baseMaterials) && mesh.userData.baseMaterials.length === 1) {
              mesh.material = (highlighted ? mesh.userData.highlightMaterials : mesh.userData.baseMaterials)[0];
            }
            mesh.userData.isHighlighted = highlighted;
          }
        }
      }
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }
    animate();

    return () => {
      disposed = true;
      resetRotationRef.current = null;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("click", onClick);
      disposeObject(scene);
      renderer.dispose();
      clock.dispose();
      renderer.domElement.remove();
    };
  }, [reducedMotion, resetRotationRef]);

  return (
    <div className="anatomy-canvas-wrap" ref={hostRef}>
      <div className="anatomy-scene-grid" aria-hidden="true" />
      <div className="anatomy-scene-orbit anatomy-scene-orbit-one" aria-hidden="true" />
      <div className="anatomy-scene-orbit anatomy-scene-orbit-two" aria-hidden="true" />
      <div className="anatomy-scene-scanline" aria-hidden="true" />
      <div className="anatomy-scene-caption">
        <span className="anatomy-live-dot" /> INTERACTIVE 3D ATLAS
      </div>
      <span className="anatomy-drag-hint"><RotateCcw size={12} /> Drag to rotate</span>
      <span className="anatomy-model-loading" role="status">Loading 3D anatomy model…</span>
      <span className="anatomy-webgl-fallback" role="status">3D view could not be started or the anatomy model could not be loaded.</span>
    </div>
  );
}

export default function AnatomyStudyPage() {
  const [selectedId, setSelectedId] = useState(initialPart.id);
  const [selectedStructure, setSelectedStructure] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [layerVisibility, setLayerVisibility] = useState({ muscles: true, skeleton: false });
  const resetRotationRef = useRef(null);
  const selected = anatomy.find((part) => part.id === selectedId) || initialPart;
  const SelectedIcon = selected.icon;

  function choosePart(id, structureName = "") {
    setSelectedId(id);
    setSelectedStructure(structureName);
  }

  function resetView() {
    choosePart(initialPart.id);
    resetRotationRef.current?.();
  }

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return (
    <section className="content-stack anatomy-study-page">
      <div className="anatomy-page-heading">
        <div>
          <p className="eyebrow"><Atom size={13} /> QUEUELESS LEARNING LAB</p>
          <h1>Meet the <span>human body.</span></h1>
          <p>Explore a detailed 3D muscle and skeleton model. Select a structure to discover how it works.</p>
        </div>
        <span className="anatomy-learning-chip"><Scan size={15} /> INTERACTIVE ANATOMY</span>
      </div>

      <div className="anatomy-learning-layout">
        <section className="anatomy-stage-card" aria-label="Interactive three-dimensional body model">
          <AnatomyScene
            selectedId={selectedId}
            onSelect={choosePart}
            reducedMotion={reducedMotion}
            resetRotationRef={resetRotationRef}
            layerVisibility={layerVisibility}
          />
          <div className="anatomy-stage-footer">
            <span><span className="anatomy-legend-dot" /> Select a highlighted structure to explore it</span>
            <div className="anatomy-stage-controls" role="group" aria-label="Visible anatomy layers">
              <button
                type="button"
                className={layerVisibility.muscles ? "is-selected" : ""}
                aria-pressed={layerVisibility.muscles}
                onClick={() => setLayerVisibility((current) => ({ ...current, muscles: !current.muscles }))}
              >Muscles</button>
              <button
                type="button"
                className={layerVisibility.skeleton ? "is-selected" : ""}
                aria-pressed={layerVisibility.skeleton}
                onClick={() => setLayerVisibility((current) => ({ ...current, skeleton: !current.skeleton }))}
              >Skeleton</button>
              <button type="button" onClick={resetView}><RotateCcw size={14} /> Reset</button>
            </div>
          </div>
        </section>

        <aside className="anatomy-info-panel" aria-live="polite">
          <div className="anatomy-info-topline">
            <span className="anatomy-info-icon" style={{ "--part-color": selected.color }}><SelectedIcon size={21} /></span>
            <span className="anatomy-system-label">{selected.system}</span>
          </div>
          <p className="anatomy-card-overline">YOUR BODY, UP CLOSE</p>
          <h2>{selectedStructure || selected.name}</h2>
          {selectedStructure && <p className="anatomy-summary">{selected.name} · selected structure</p>}
          {!selectedStructure && <p className="anatomy-summary">{selected.summary}</p>}
          <p className="anatomy-description">{selected.description}</p>
          <div className="anatomy-fact-title"><Activity size={14} /> QUICK DISCOVERIES</div>
          <ul className="anatomy-facts">
            {selected.facts.map((fact, index) => (
              <li key={fact}><span>{String(index + 1).padStart(2, "0")}</span>{fact}</li>
            ))}
          </ul>
          <div className="anatomy-education-note">
            <Info size={15} />
            <span>For learning only. This anatomical model is not a medical diagnostic tool.</span>
          </div>
        </aside>
      </div>

      <section className="anatomy-explorer">
        <div className="anatomy-explorer-heading">
          <div><p className="eyebrow">PICK A BODY PART</p><h2>Explore the system</h2></div>
          <span>{anatomy.length} body regions</span>
        </div>
        <div className="anatomy-part-list" role="group" aria-label="Choose a body region">
          {anatomy.map((part) => {
            const Icon = part.icon;
            return (
              <button
                type="button"
                key={part.id}
                className={`anatomy-part-button${part.id === selectedId ? " is-active" : ""}`}
                style={{ "--part-color": part.color }}
                aria-pressed={part.id === selectedId}
                onClick={() => choosePart(part.id)}
              >
                <Icon size={17} />
                <span>{part.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <p className="anatomy-page-footnote"><CircleHelp size={13} /> Anatomy asset: Écorché / BodyParts3D / Z-Anatomy, used under CC BY-SA 4.0. Educational visualization only.</p>
    </section>
  );
}
