import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { test, expect } from "@playwright/test";
import { parseServerConfig } from "@latex-collab/config/server";
import { DatabaseClient } from "@latex-collab/db";
import * as Y from "yjs";
import { createAuthenticatedContext } from "./authenticated-context.js";

loadEnvFile(".env");
const config = parseServerConfig(process.env);

test("Unicode editor persistence journey: UTF-8, Spanish, math, emojis, RTL across refresh", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const db = new DatabaseClient(config.DATABASE_URL);

  // Per-context session: session reads rotate the token, so one stored
  // storageState cannot be reused by another context.
  const { context, csrf: csrfToken } = await createAuthenticatedContext(browser);
  const request = context.request;

  // Check backend readiness
  await expect
    .poll(
      async () => {
        try {
          return (await fetch("http://127.0.0.1:3000/api/v1/health/ready")).status;
        } catch {
          return 0;
        }
      },
      { timeout: 15000 },
    )
    .toBe(200);

  // Seed data lives in the shared-session project created below.

  // 1. Create Project with the shared session
  const createProjRes = await request.post("http://127.0.0.1:3000/api/v1/projects", {
    headers: { origin: "http://127.0.0.1:5173", "x-csrf-token": csrfToken },
    data: { title: `Unicode Test ${randomUUID()}` },
  });
  expect(createProjRes.status()).toBe(201);
  const project = await createProjRes.json();
  const projectId = project.id;
  const fileId = project.mainFileId;

  // 3. Get initial text state
  const textGetRes = await request.get(
    `http://127.0.0.1:3000/api/v1/projects/${projectId}/files/${fileId}/text`,
    {
      headers: { origin: "http://127.0.0.1:5173" },
    },
  );
  expect(textGetRes.status()).toBe(200);
  const initialTextState = await textGetRes.json();

  // 4. Construct rich Unicode text payload: Spanish accents, math symbols, emojis, and RTL
  const unicodeContent = [
    "% Documento de investigación en español: lingüística y matemáticas",
    "\\documentclass{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\begin{document}",
    "\\section{Sección en Español: Análisis Matemático}",
    "El rápido murciélago hindú comía feliz cardillo y kiwi.",
    "Comprobación de acentos: á, é, í, ó, ú, ñ, ¿, ¡.",
    "",
    "\\subsection{Símbolos Matemáticos}",
    "Operadores: ∫_{0}^{∞} e^{-x^2} dx = \\frac{\\sqrt{π}}{2}.",
    "Conjuntos y cuantificadores: ∀ x ∈ ℝ, ∃ y ∈ ℂ : x ⊆ y ∧ x ⊗ y ≠ 0, ∇ × B = μ_0 J.",
    "",
    "\\subsection{Iconos y Emojis}",
    "Colaboración activa: 🚀 🎉 🔬 📚 ✍️ 👨‍🔬.",
    "",
    "\\subsection{Texto Bidireccional (RTL)}",
    "Árabe: مرحبا بالعالم",
    "Hebreo: שלום עולם",
    "\\end{document}",
  ].join("\n");

  const doc = new Y.Doc();
  Y.applyUpdate(doc, Buffer.from(initialTextState.updateBase64, "base64"));
  const text = doc.getText("content");
  text.delete(0, text.length);
  text.insert(0, unicodeContent);

  const updateB64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");

  // 5. Commit update to server
  const textPutRes = await request.put(
    `http://127.0.0.1:3000/api/v1/projects/${projectId}/files/${fileId}/text`,
    {
      headers: {
        origin: "http://127.0.0.1:5173",
        "x-csrf-token": csrfToken,
        "content-type": "application/json",
      },
      data: {
        updateBase64: updateB64,
        baseStateVectorBase64: initialTextState.stateVectorBase64,
      },
    },
  );
  expect(textPutRes.status()).toBe(200);
  const putResult = await textPutRes.json();
  expect(putResult.ack.type).toBe("text.durable_ack");

  // 6. Refresh / simulate re-opening file from server
  const refreshRes = await request.get(
    `http://127.0.0.1:3000/api/v1/projects/${projectId}/files/${fileId}/text`,
    {
      headers: { origin: "http://127.0.0.1:5173" },
    },
  );
  expect(refreshRes.status()).toBe(200);
  const refreshedState = await refreshRes.json();

  const verifyDoc = new Y.Doc();
  Y.applyUpdate(verifyDoc, Buffer.from(refreshedState.updateBase64, "base64"));
  const recoveredText = verifyDoc.getText("content").toString();

  // Invariant: recovered confirmed text equals original bytes exactly
  expect(recoveredText).toBe(unicodeContent);
  expect(Buffer.from(recoveredText, "utf8").equals(Buffer.from(unicodeContent, "utf8"))).toBe(true);

  await context.close();
  await db.close();
});
