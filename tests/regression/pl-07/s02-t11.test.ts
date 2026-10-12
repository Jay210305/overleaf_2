import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  assertAvatarKeyScope,
  StorageSecurityError,
  validateKey,
} from "../../../packages/storage/src/s3.js";

it("confines avatar objects to the owning user without granting arbitrary object access", () => {
  const owner = randomUUID();
  const other = randomUUID();
  const key = `avatars/${owner}/${randomUUID()}.png`;
  expect(() => assertAvatarKeyScope(key, owner)).not.toThrow();
  expect(() => assertAvatarKeyScope(key, other)).toThrow(StorageSecurityError);
  expect(() => validateKey(`avatars/${owner}/../${other}/image.png`)).toThrow(StorageSecurityError);
  expect(() => validateKey(`avatars/${owner}/%252e%252e/secret.png`)).toThrow(StorageSecurityError);
});
