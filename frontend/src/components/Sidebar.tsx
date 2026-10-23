import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutGrid,
  Map,
  Bookmark,
  BookOpen,
  Bot,
  Plus,
  HelpCircle,
  LogOut,
  Compass,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/routes", label: "Routes", icon: Map },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/assistant", label: "AI Assistant", icon: Bot },
];

export default function Sidebar() {
  const navigate = useNavigate();
  return (
    <aside className="fixed left-0 top-16 bottom-0 w-64 bg-sand border-r border-field shadow-subtle flex flex-col px-4 py-6 z-20">
      {/* Profile */}
      <div className="flex items-center gap-3 px-2 pb-6">
        <div className="size-10 shrink-0 rounded-full bg-avatar border border-field flex items-center justify-center overflow-hidden">
          <Compass className="size-5 text-ink" />
        </div>
        <div>
          <p className="font-serif font-semibold text-ink text-[18px] leading-[22px]">
            The Local Friend
          </p>
          <p className="text-muted text-[12px] tracking-[0.03em] font-medium">
            Your Indian Guide
          </p>
        </div>
      </div>

      {/* Start New Detour */}
      <button
        onClick={() => navigate("/")}
        className="w-full flex items-center justify-center gap-2 bg-rust text-white rounded-lg py-2.5 shadow-subtle text-[14px] font-semibold tracking-[0.05em] hover:brightness-110 transition"
      >
        <Plus className="size-4" />
        Start New Detour
      </button>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-1 pt-4">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 rounded-lg pl-3 pr-4 py-2 text-[14px] font-semibold tracking-[0.05em] transition",
                isActive
                  ? "bg-white/50 border-r-4 border-rust text-ink"
                  : "text-muted hover:bg-white/40",
              ].join(" ")
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="pt-4 border-t border-field flex flex-col gap-1">
        <a className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted text-[14px] font-semibold tracking-[0.05em] hover:bg-white/40 cursor-pointer">
          <HelpCircle className="size-5" />
          Help
        </a>
        <a className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted text-[14px] font-semibold tracking-[0.05em] hover:bg-white/40 cursor-pointer">
          <LogOut className="size-[18px]" />
          Logout
        </a>
      </div>
    </aside>
  );
}
