import { useState } from "react";
import {
  Bell,
  Ambulance,
  Atom,
  Building2,
  CalendarDays,
  CircleUserRound,
  Compass,
  LayoutDashboard,
  LogOut,
  Menu,
  Pill,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const roleLinks = {
  customer: [
    { to: "/dashboard", label: "My dashboard", icon: LayoutDashboard },
    { to: "/organizations", label: "Find a service", icon: Compass },
    { to: "/medications", label: "Find medication", icon: Pill },
    { to: "/study", label: "Body study", icon: Atom },
    { to: "/ambulance", label: "Ambulance demo", icon: Ambulance },
    { to: "/appointments", label: "My appointments", icon: CalendarDays },
    { to: "/profile", label: "My profile", icon: CircleUserRound },
  ],
  organization_admin: [
    { to: "/dashboard", label: "Organization workspace", icon: LayoutDashboard },
    { to: "/profile", label: "My profile", icon: CircleUserRound },
  ],
  staff: [
    { to: "/dashboard", label: "Counter desk", icon: LayoutDashboard },
    { to: "/profile", label: "My profile", icon: CircleUserRound },
  ],
  doctor: [
    { to: "/dashboard", label: "Clinical workspace", icon: LayoutDashboard },
    { to: "/profile", label: "My profile", icon: CircleUserRound },
  ],
  super_admin: [
    { to: "/dashboard", label: "Platform overview", icon: LayoutDashboard },
    { to: "/profile", label: "My profile", icon: CircleUserRound },
  ],
};

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <Link className="brand-lockup" to="/">
          <span className="brand-mark">Q</span><span>QueueLess</span>
        </Link>
        <button
          className="shell-menu-toggle"
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="topbar-actions">
          <Link className="topbar-user" to="/profile">
            <span className="avatar">{user?.full_name?.slice(0, 1)?.toUpperCase() || "Q"}</span>
            <span>{user?.full_name}</span>
          </Link>
          <button className="icon-button" type="button" aria-label="Notifications" onClick={() => navigate("/dashboard#notifications")}>
            <Bell size={17} />
          </button>
          <button className="icon-button" type="button" aria-label="Sign out" onClick={handleLogout}>
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="app-body">
        <aside className={`app-sidebar${menuOpen ? " is-open" : ""}`}>
          <div className="sidebar-heading">WORKSPACE</div>
          <nav aria-label="Workspace navigation">
            {(roleLinks[user?.role] || roleLinks.customer).map(({ to, label, icon: Icon }) => (
              <NavLink
                className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
                to={to}
                key={to}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={17} /><span>{label}</span>
              </NavLink>
            ))}
          </nav>
          {user?.role === "organization_admin" && (
            <div className="sidebar-tip">
              <Building2 size={17} />
              <span>Organization approval and staff tools live in your workspace.</span>
            </div>
          )}
          <div className="sidebar-footer">
            <span className="sidebar-secure"><span /> Secure session</span>
          </div>
        </aside>
        <main className="app-content"><Outlet /></main>
      </div>
    </div>
  );
}
