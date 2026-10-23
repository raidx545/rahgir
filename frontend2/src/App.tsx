import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "@/screens/Landing";
import Planning from "@/screens/Planning";
import Itinerary from "@/screens/Itinerary";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/itinerary" element={<Itinerary />} />
        {/* Never dead-end the demo on an unknown path. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
