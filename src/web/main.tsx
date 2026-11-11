import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, failureMessage } from "./api.js";

function App() {
  const [status, setStatus] = useState("checking");
  const [notesSaved, setNotesSaved] = useState("checking");

  useEffect(() => {
    api<{ status: string }>("/api/health")
      .then((body) => setStatus(body.status))
      .catch((error: unknown) => setStatus(failureMessage(error)));
  }, []);

  useEffect(() => {
    api<{ count: number }>("/api/notes/count")
      .then((body) => setNotesSaved(String(body.count)))
      .catch((error: unknown) => setNotesSaved(failureMessage(error)));
  }, []);

  return (
    <main>
      <h1>V1be Coding</h1>
      <p>API: {status}</p>
      <p>Notes saved: {notesSaved}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
