import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createSessionFixture, origin } from "../helpers/s02-session.js";
import { createProject } from "../../apps/api/src/modules/projects/create.js";

describe("S04-T08 Persistent Unicode editing integration", () => {
  let fixture: Awaited<ReturnType<typeof createSessionFixture>>;
  let owner: { id: string; email: string };

  const unicodeCorpus = [
    "% Documento en español con caracteres Unicode avanzados",
    "\\section{Lingüística y Fonética}",
    "Acentos españoles: á é í ó ú ñ ü ¿ ¡",
    "Frase pangrama: El veloz murciélago hindú comía feliz cardillo y kiwi.",
    "\\section{Símbolos Matemáticos y Operadores}",
    "Conjuntos y análisis: ℝ ℂ ℤ ℕ ℚ ∅ ∈ ∉ ⊆ ⊂ ∪ ∩",
    "Cálculo: ∫_{a}^{b} f(x) dx = F(b) - F(a), ∑_{n=1}^{∞} \\frac{1}{n^2} = \\frac{π^2}{6}",
    "Operadores vectoriales: ∇ · E = \\frac{ρ}{ε_0}, ∇ × B = μ_0 J + μ_0 ε_0 \\frac{∂E}{∂t}",
    "Lógica: ∀ x, ∃ y : x ≠ y ∧ x ≤ y ∨ x ≥ y",
    "\\section{Emojis y Variantes Gráficas}",
    "Laboratorio colaborativo: 🚀 🎉 🔬 📚 ✍️ 👨‍🔬 💡 ✨",
    "\\section{Escritura Bidireccional (RTL)}",
    "Texto en árabe: مرحبا بك في محرر المستندات التعاوني",
    "Texto en hebreo: ברוכים הבאים לעורך המסמכים השיתופי",
  ].join("\n");

  beforeAll(async () => {
    fixture = await createSessionFixture();
    owner = await fixture.seed();
  });

  afterAll(async () => {
    await fixture.close();
  });

  async function getSession() {
    const res = await fixture.login(owner.email);
    expect(res.statusCode).toBe(200);
    return {
      cookie: String(res.headers["set-cookie"]).split(";")[0]!,
      csrf: String(res.headers["x-csrf-token"]),
    };
  }

  it("writes UTF-8/emoji/Spanish/RTL, restarts API; recovered confirmed text equals original bytes", async () => {
    const session = await getSession();

    const proj = await createProject(fixture.db, owner.id, {
      title: `Unicode-${randomUUID().slice(0, 8)}`,
      compiler: "pdflatex",
    });
    const projectId = proj.id;
    const fileId = proj.mainFileId!;

    // 1. Read initial text state
    const getRes = await fixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: session.cookie },
    });
    expect(getRes.statusCode).toBe(200);
    const state = getRes.json();

    // 2. Insert unicode corpus into doc
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(state.updateBase64, "base64"));
    const text = doc.getText("content");
    text.delete(0, text.length);
    text.insert(0, unicodeCorpus);

    const updateB64 = Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64");

    // 3. Commit update
    const putRes = await fixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: session.cookie,
        "x-csrf-token": session.csrf,
        "content-type": "application/json",
      },
      payload: {
        updateBase64: updateB64,
        baseStateVectorBase64: state.stateVectorBase64,
      },
    });

    expect(putRes.statusCode).toBe(200);
    const putResult = putRes.json();
    expect(putResult.ack.type).toBe("text.durable_ack");
    expect(putResult.ack.persistedSeq).toBe(1);

    // 4. Simulate controlled server restart
    await fixture.app.close();

    const restartedFixture = await createSessionFixture();
    const loginRestored = await restartedFixture.login(owner.email);
    const restoredCookie = String(loginRestored.headers["set-cookie"]).split(";")[0]!;

    // 5. Read canonical text from restarted server
    const restoredRes = await restartedFixture.app.inject({
      method: "GET",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: { origin, cookie: restoredCookie },
    });

    expect(restoredRes.statusCode).toBe(200);
    const restoredState = restoredRes.json();
    expect(restoredState.persistedSeq).toBe(1);

    const recoveredDoc = new Y.Doc();
    Y.applyUpdate(recoveredDoc, Buffer.from(restoredState.updateBase64, "base64"));
    const recoveredString = recoveredDoc.getText("content").toString();

    // Invariant: recovered confirmed text equals original bytes
    expect(recoveredString).toBe(unicodeCorpus);
    const originalBytes = Buffer.from(unicodeCorpus, "utf8");
    const recoveredBytes = Buffer.from(recoveredString, "utf8");
    expect(recoveredBytes.equals(originalBytes)).toBe(true);

    // 6. Append additional Unicode text after restart to verify continuous edit capability
    const appendedText = "\n% Edición adicional post-reinicio: café y matemática avanzada ∑_{k=0}^{n} k";
    recoveredDoc.getText("content").insert(recoveredString.length, appendedText);
    const nextUpdateB64 = Buffer.from(Y.encodeStateAsUpdate(recoveredDoc)).toString("base64");

    const secondPutRes = await restartedFixture.app.inject({
      method: "PUT",
      url: `/api/v1/projects/${projectId}/files/${fileId}/text`,
      headers: {
        origin,
        cookie: restoredCookie,
        "x-csrf-token": String(loginRestored.headers["x-csrf-token"]),
        "content-type": "application/json",
      },
      payload: {
        updateBase64: nextUpdateB64,
        baseStateVectorBase64: restoredState.stateVectorBase64,
      },
    });

    expect(secondPutRes.statusCode).toBe(200);
    expect(secondPutRes.json().ack.persistedSeq).toBe(2);

    await restartedFixture.close();
  });
});
