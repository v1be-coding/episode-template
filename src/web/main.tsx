import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((body: { status: string }) => setStatus(body.status))
      .catch(() => setStatus("unavailable"));
  }, []);

  return (
    <main>
      <h1>V1be Coding</h1>
      <p>API: {status}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
