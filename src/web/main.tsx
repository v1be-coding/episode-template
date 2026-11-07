import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, limitMessage, RateLimitedError } from "./api.js";

function App() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    api<{ status: string }>("/api/health")
      .then((body) => setStatus(body.status))
      .catch((error: unknown) =>
        setStatus(error instanceof RateLimitedError ? limitMessage(error) : "unavailable"),
      );
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
