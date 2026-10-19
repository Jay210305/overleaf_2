import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setupApiClient } from "./app/api-client";
import { Providers } from "./app/providers";
import { Router } from "./app/router";
import "./styles.css";

setupApiClient();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <Router />
    </Providers>
  </StrictMode>,
);
