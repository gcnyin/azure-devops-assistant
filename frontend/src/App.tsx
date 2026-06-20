import { BrowserRouter, Routes, Route } from "react-router";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { BoardRoute } from "@/routes/BoardRoute";
import FixesRoute from "@/routes/FixesRoute";
import SettingsRoute from "@/routes/SettingsRoute";
import { HistoryView } from "@/components/HistoryView";
import { DiffView } from "@/components/DiffView";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#252320",
            color: "#faf9f5",
            border: "1px solid #2e2c28",
          },
        }}
      />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<BoardRoute />} />
          <Route path="fixes" element={<FixesRoute />} />
          <Route path="history" element={<HistoryView />} />
          <Route path="diff/:idA/:idB" element={<DiffView />} />
          <Route path="settings" element={<SettingsRoute />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
