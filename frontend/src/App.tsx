import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import TopNav from "./components/TopNav";
import Sidebar from "./components/Sidebar";
import Planner from "./pages/Planner";
import Dashboard from "./pages/Dashboard";
import TripsList from "./pages/TripsList";
import Assistant from "./pages/Assistant";
import Journal from "./pages/Journal";
import { pageVariants } from "./motion";

function Shell() {
  const location = useLocation();
  const isDash = location.pathname === "/dashboard";

  return (
    <div className="min-h-full bg-paper">
      {/* Persistent shell — stays mounted so nav never flashes on navigation */}
      <TopNav variant={isDash ? "dashboard" : "planner"} />
      <Sidebar />

      <main className="pl-64 pt-16 min-h-screen">
        <AnimatePresence mode="wait" initial={false}>
          {/* Only the content area animates; fixed nav is a sibling, so the
              transform here never affects its positioning. */}
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={isDash ? "" : "px-8 py-12"}
            style={{ willChange: "transform, opacity" }}
          >
            <Routes location={location}>
              <Route path="/" element={<Planner />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/routes" element={<TripsList mode="all" />} />
              <Route path="/saved" element={<TripsList mode="saved" />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/assistant" element={<Assistant />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <Shell />
      </MotionConfig>
    </BrowserRouter>
  );
}
