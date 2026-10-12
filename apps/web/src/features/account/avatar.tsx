import { useEffect, useState, type FormEvent } from "react";
import { parsePublicConfig } from "@latex-collab/config";
import { accountProfileViewSchema, type AccountProfileView } from "@latex-collab/contracts";

const { VITE_API_URL } = parsePublicConfig(import.meta.env);
const maxAvatarBytes = 1_000_000;

export function AvatarSettings({
  profile,
  csrf,
  onProfileChange,
}: {
  profile: AccountProfileView;
  csrf: string;
  onProfileChange: (profile: AccountProfileView) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.avatarUrl) {
      setPreview(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await fetch(`${VITE_API_URL}/me/avatar/content`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/png"))
          throw new Error("Avatar unavailable");
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
      } catch {
        if (active) setNotice("Avatar preview is unavailable. Try reloading this page.");
      }
    })();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile.avatarUrl, version]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || pending) return;
    if (file.type !== "image/png" || file.size < 1 || file.size > maxAvatarBytes) {
      setNotice("Choose a PNG image smaller than 1 MB.");
      return;
    }
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch(`${VITE_API_URL}/me/avatar`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "image/png", "x-csrf-token": csrf },
        body: file,
      });
      if (!response.ok) {
        setNotice(
          response.status === 429
            ? "Too many attempts. Try again later."
            : response.status === 401 || response.status === 403
              ? "Session denied. Sign in again."
              : "Avatar upload failed. Check the image and try again.",
        );
        return;
      }
      onProfileChange(accountProfileViewSchema.parse(await response.json()));
      setFile(null);
      setVersion((value) => value + 1);
      setNotice("Avatar saved.");
    } catch {
      setNotice("Connection failed. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="avatar-heading">
      <h2 id="avatar-heading">Avatar</h2>
      {preview && (
        <img className="avatar-preview" src={preview} alt={`${profile.displayName} avatar`} />
      )}
      <form onSubmit={(event) => void upload(event)}>
        <label>
          Avatar PNG
          <input
            type="file"
            accept="image/png"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={pending || !file}>
          Upload avatar
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
