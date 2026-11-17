import { useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";

const links = [
  { label: "How it works", href: "#how-it-works" },
  { label: "For organizations", href: "#organizations" },
  { label: "Benefits", href: "#benefits" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="site-header">
      <nav className="nav-shell" aria-label="Main navigation">
        <a className="brand-lockup" href="#top" onClick={closeMenu}>
          <span className="brand-mark" aria-hidden="true">
            Q
          </span>
          <span>QueueLess</span>
        </a>
        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div className={`nav-content${menuOpen ? " is-open" : ""}`}>
          <div className="nav-links">
            {links.map((link) => (
              <a href={link.href} key={link.label} onClick={closeMenu}>
                {link.label}
              </a>
            ))}
          </div>
          <a className="button button-small button-dark" href="#how-it-works" onClick={closeMenu}>
            Get started <ArrowUpRight size={16} aria-hidden="true" />
          </a>
          <Link className="nav-signin" to="/login" onClick={closeMenu}>Sign in</Link>
        </div>
      </nav>
    </header>
  );
}
