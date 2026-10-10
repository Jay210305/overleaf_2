import { createHash } from "node:crypto";
import type { DatabaseClient } from "../src/client.js";

export const DEV_USERS = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    emailNormalized: "owner@latex-collab.test",
    displayName: "Alice Owner",
    role: "OWNER" as const,
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    emailNormalized: "editor@latex-collab.test",
    displayName: "Bob Editor",
    role: "EDITOR" as const,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    emailNormalized: "reviewer@latex-collab.test",
    displayName: "Charlie Reviewer",
    role: "REVIEWER" as const,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    emailNormalized: "viewer@latex-collab.test",
    displayName: "Dana Viewer",
    role: "VIEWER" as const,
  },
];

export const DEV_PROJECTS = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    ownerId: "10000000-0000-4000-8000-000000000001",
    title: "Master Thesis",
    description: "Academic thesis template and research",
    compiler: "pdflatex" as const,
    mainFileName: "main.tex",
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    ownerId: "10000000-0000-4000-8000-000000000001",
    title: "Research Lab Notes",
    description: "Collaborative lab documentation",
    compiler: "xelatex" as const,
    mainFileName: "notes.tex",
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    ownerId: "10000000-0000-4000-8000-000000000002",
    title: "Conference Paper Draft",
    description: "Upcoming IEEE submission draft",
    compiler: "pdflatex" as const,
    mainFileName: "paper.tex",
  },
];

export const DEV_TEMPLATES = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    title: "IEEE Conference Template",
    category: "Conference",
    description: "Standard double-column IEEE template",
    sourceManifestKey: "templates/ieee.json",
    version: "1.0.0",
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    title: "ACM Article Template",
    category: "Journal",
    description: "Standard single/double-column ACM publication template",
    sourceManifestKey: "templates/acm.json",
    version: "1.0.0",
  },
];

export async function seedDevelopment(db: DatabaseClient): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Production seed refuses fixed credentials");
  }

  // 1. Seed Users
  for (const user of DEV_USERS) {
    const dummyHash = createHash("sha256").update(`dev-password-${user.id}`).digest("hex");
    await db.query(
      `INSERT INTO users (id, email_normalized, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email_normalized) DO NOTHING`,
      [user.id, user.emailNormalized, dummyHash, user.displayName],
    );
  }

  // 2. Seed Projects & Memberships
  for (const project of DEV_PROJECTS) {
    await db.query(
      `INSERT INTO projects (id, owner_id, title, description, compiler, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [project.id, project.ownerId, project.title, project.description, project.compiler],
    );

    // Assign owner member
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, 'OWNER')
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [project.id, project.ownerId],
    );
  }

  // Assign other roles:
  // Project 1 shared with Bob Editor
  await db.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, 'EDITOR')
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [DEV_PROJECTS[0]!.id, DEV_USERS[1]!.id],
  );

  // Project 2 shared with Charlie Reviewer and Dana Viewer
  await db.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, 'REVIEWER')
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [DEV_PROJECTS[1]!.id, DEV_USERS[2]!.id],
  );
  await db.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, 'VIEWER')
     ON CONFLICT (project_id, user_id) DO NOTHING`,
    [DEV_PROJECTS[1]!.id, DEV_USERS[3]!.id],
  );

  // 3. Seed Templates
  for (const template of DEV_TEMPLATES) {
    await db.query(
      `INSERT INTO templates (id, title, category, description, source_manifest_key, version)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        template.id,
        template.title,
        template.category,
        template.description,
        template.sourceManifestKey,
        template.version,
      ],
    );
  }
}
