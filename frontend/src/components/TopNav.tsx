import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Bell, Settings, Search } from "lucide-react";

/**
 * Top navigation bar. `variant="dashboard"` shows the search box + center
 * links (matches the Route Dashboard); default is the minimal planner bar.
 */
export default function TopNav({
  variant = "planner",
}: {
  variant?: "planner" | "dashboard";
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const centerLink = (to: string, label: string) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        isActive
          ? "text-rust font-semibold border-b-2 border-rust pb-0.5"
          : "text-muted hover:text-ink"
      }
    >
      {label}
    </NavLink>
  );

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-paper shadow-subtle flex items-center justify-between px-10 z-30">
      <div className="flex items-center gap-6">
        <Link to="/" className="font-serif font-medium text-ink text-[24px] leading-8">
          RahGir
        </Link>
        {variant === "dashboard" && (
          <div className="hidden md:flex items-center gap-2 w-64 rounded-lg border border-field bg-white px-3 py-2">
            <Search className="size-[14px] text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && q.trim()) {
                  navigate(`/?dest=${encodeURIComponent(q.trim())}`);
                  setQ("");
                }
              }}
              placeholder="Search a destination..."
              className="bg-transparent outline-none text-[14px] text-ink placeholder:text-muted w-full"
            />
          </div>
        )}
      </div>

      {variant === "dashboard" && (
        <nav className="hidden lg:flex items-center gap-8 text-[14px]">
          {centerLink("/routes", "Trips")}
          {centerLink("/dashboard", "Dashboard")}
          {centerLink("/saved", "Explore")}
        </nav>
      )}

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-ink">
          <Bell className="size-5 cursor-pointer" />
          <Settings className="size-5 cursor-pointer" />
        </div>
        <button
          onClick={() => navigate("/")}
          className="bg-ink text-white rounded-full px-4 py-2 text-[14px] font-semibold tracking-[0.05em] shadow-subtle hover:brightness-125 transition"
        >
          Plan Trip
        </button>
        <div className="size-8 rounded-full bg-avatar border border-field overflow-hidden flex items-center justify-center text-[11px] text-muted">
          RP
        </div>
      </div>
    </header>
  );
}
