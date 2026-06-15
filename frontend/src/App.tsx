import { BrowserRouter, Routes, Route } from "react-router";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { BoardRoute } from "@/routes/BoardRoute";
import FixesRoute from "@/routes/FixesRoute";
import { HistoryView } from "@/components/HistoryView";
import { SnapshotDetail } from "@/components/SnapshotDetail";
import { DiffView } from "@/components/DiffView";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#181715",
            color: "#faf9f5",
            border: "1px solid #252320",
          },
        }}
      />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<BoardRoute />} />
          <Route path="fixes" element={<FixesRoute />} />
          <Route path="history" element={<HistoryView />} />
          <Route path="history/:id" element={<SnapshotDetail />} />
          <Route path="diff/:idA/:idB" element={<DiffView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
