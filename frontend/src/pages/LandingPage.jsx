import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  HeartPulse,
  MapPin,
  ShieldCheck,
  Sparkles,
  TicketCheck,
} from "lucide-react";
import Navbar from "../components/Navbar.jsx";

const steps = [
  {
    number: "01",
    title: "Choose where to go",
    description: "Find a nearby organization and the service that fits your needs.",
    icon: MapPin,
  },
  {
    number: "02",
    title: "Book a time that works",
    description: "See availability up front and reserve your appointment in a few taps.",
    icon: CalendarDays,
  },
  {
    number: "03",
    title: "Arrive when it’s your turn",
    description: "Check in with your digital token and follow your place in the queue.",
    icon: TicketCheck,
  },
];

const benefits = [
  {
    title: "Less waiting, more living",
    description: "Spend less time standing in line and more time on what matters.",
    icon: Clock3,
  },
  {
    title: "A calmer visit",
    description: "Know what to expect before you arrive, from appointment to check-in.",
    icon: HeartPulse,
  },
  {
    title: "Your details stay yours",
    description: "Your appointment information is handled with care and privacy.",
    icon: ShieldCheck,
  },
];

function SectionHeading({ eyebrow, title, description, centered = false }) {
  return (
    <div className={`section-heading${centered ? " is-centered" : ""}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {description && <p className="section-description">{description}</p>}
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="preview-wrap" aria-label="Illustration of the QueueLess booking flow">
      <div className="preview-orbit orbit-one" />
      <div className="preview-orbit orbit-two" />
      <div className="preview-card">
        <div className="preview-topline">
          <div>
            <p className="preview-label">THE QUEUELESS EXPERIENCE</p>
            <h2>A clearer visit starts here.</h2>
          </div>
          <span className="preview-check">
            <Check size={18} />
          </span>
        </div>
        <div className="appointment-preview">
          <div className="clinic-icon">
            <CalendarDays size={22} />
          </div>
          <div>
            <strong>Book your visit</strong>
            <span>Choose a service and time</span>
          </div>
          <ArrowRight className="appointment-arrow" size={18} />
        </div>
        <div className="preview-divider" />
        <div className="queue-row">
          <div>
            <span className="preview-label">WHEN YOU ARRIVE</span>
            <strong className="queue-number">Check in</strong>
          </div>
          <div className="queue-wait">
            <span className="live-dot" />
            <span>Stay up to date</span>
          </div>
        </div>
        <div className="queue-progress" aria-hidden="true">
          <span />
        </div>
        <div className="preview-footer">
          <span><MapPin size={14} /> Your visit, in one place</span>
          <span>Booking · Check-in · Updates</span>
        </div>
      </div>
      <div className="floating-note">
        <span className="floating-icon"><Sparkles size={16} /></span>
        <span><strong>Made for your day</strong><small>Not the waiting room’s</small></span>
      </div>
      <div className="hero-blob" />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div id="top" className="min-h-screen">
      <Navbar />
      <main>
        <section className="hero-section page-shell">
          <div className="hero-copy">
            <div className="hero-tag"><span /> A better way to wait</div>
            <h1>Your time is<br />too valuable to <span>wait.</span></h1>
            <p className="hero-description">
              Book appointments, check in digitally, and know when it’s your turn.
              QueueLess makes every visit feel a little easier.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#how-it-works">
                See how it works <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a className="text-link" href="#organizations">
                For organizations <ArrowDown size={15} aria-hidden="true" />
              </a>
            </div>
            <div className="hero-reassurance">
              <span className="reassurance-check"><Check size={13} /></span>
              No more guesswork. Just a better visit.
            </div>
          </div>
          <HeroPreview />
        </section>

        <section className="trust-strip" aria-label="QueueLess services">
          <div className="page-shell trust-inner">
            <span>One smoother experience for</span>
            <div className="trust-tags">
              <span><HeartPulse size={16} /> Clinics</span>
              <span><ShieldCheck size={16} /> Service centres</span>
              <span><CalendarDays size={16} /> Everyday appointments</span>
            </div>
          </div>
        </section>

        <section className="steps-section page-shell" id="how-it-works">
          <SectionHeading
            eyebrow="A simpler visit, step by step"
            title="From booking to done."
            description="Everything you need for your next visit, right where you need it."
            centered
          />
          <div className="steps-grid">
            {steps.map(({ number, title, description, icon: Icon }) => (
              <article className="step-card" key={number}>
                <div className="step-card-top">
                  <span className="step-number">{number}</span>
                  <span className="step-icon"><Icon size={20} /></span>
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="benefits-section" id="benefits">
          <div className="page-shell benefits-layout">
            <SectionHeading
              eyebrow="Built around your day"
              title="Good visits start before you arrive."
              description="QueueLess keeps the details clear, so you can focus on the reason you came."
            />
            <div className="benefit-list">
              {benefits.map(({ title, description, icon: Icon }) => (
                <article className="benefit-item" key={title}>
                  <span className="benefit-icon"><Icon size={19} /></span>
                  <div><h3>{title}</h3><p>{description}</p></div>
                  <Check className="benefit-check" size={18} />
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="organization-cta page-shell" id="organizations">
          <div className="cta-pattern" aria-hidden="true" />
          <div className="cta-copy">
            <p className="eyebrow">For service teams</p>
            <h2>Make every queue work better.</h2>
            <p>Give your visitors a clearer, more comfortable way to access the services they need.</p>
          </div>
          <a className="button button-light" href="#how-it-works">
            Explore QueueLess <ArrowRight size={17} aria-hidden="true" />
          </a>
        </section>
      </main>
      <footer className="site-footer page-shell">
        <a className="brand-lockup" href="#top">
          <span className="brand-mark" aria-hidden="true">Q</span>
          <span>QueueLess</span>
        </a>
        <p>More time for what matters.</p>
        <span className="copyright">© {new Date().getFullYear()} QueueLess</span>
      </footer>
    </div>
  );
}
