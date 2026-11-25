import { ApiRequestError, type AdminImage } from "@kummie/contracts";
import { useEffect, useRef, useState } from "react";
import { api, useAdmin } from "./context";

const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
const MAX_MB = 20;
const KNOWN_ERRORS = ["image_too_small", "image_unsupported", "image_too_large", "too_many_images"] as const;
const isKnownError = (code: string | undefined): code is (typeof KNOWN_ERRORS)[number] =>
  (KNOWN_ERRORS as readonly (string | undefined)[]).includes(code);

/**
 * Product photos (D-061): upload (several at once), alt text in both languages, order and delete.
 * The first photo is the one on the product card. The server makes the sizes and removes EXIF data.
 */
export function ProductImages({ productId }: { productId: string }) {
  const { t } = useAdmin();
  const [items, setItems] = useState<AdminImage[]>([]);
  const [alts, setAlts] = useState<Record<string, { bg: string; en: string }>>({});
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const show = (list: AdminImage[]) => {
    setItems(list);
    setAlts(Object.fromEntries(list.map((i) => [i.id, i.alt])));
  };

  useEffect(() => {
    api.listImages(productId).then((r) => {
      setItems(r.items);
      setAlts(Object.fromEntries(r.items.map((i) => [i.id, i.alt])));
    });
  }, [productId]);

  function explain(e: unknown, name?: string): string {
    const code = e instanceof ApiRequestError ? e.body?.error : undefined;
    const reason = isKnownError(code)
      ? t(`admin.photos.err.${code}`)
      : e instanceof Error
        ? e.message
        : String(e);
    return name ? `${name}: ${reason}` : reason;
  }

  async function run(work: () => Promise<{ items: AdminImage[] }>) {
    setBusy(true);
    setMessage(null);
    try {
      show((await work()).items);
      setMessage({ kind: "ok", text: t("admin.saved") });
    } catch (e) {
      setMessage({ kind: "error", text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    const problems: string[] = [];
    const list = [...files];
    for (const [i, file] of list.entries()) {
      setProgress(t("admin.photos.uploading", { n: i + 1, total: list.length }));
      if (file.size > MAX_MB * 1024 * 1024) {
        problems.push(`${file.name}: ${t("admin.photos.err.image_too_large")}`);
        continue;
      }
      try {
        show((await api.uploadImage(productId, file)).items);
      } catch (e) {
        problems.push(explain(e, file.name));
      }
    }
    setProgress(null);
    setBusy(false);
    if (input.current) input.current.value = "";
    setMessage(
      problems.length > 0
        ? { kind: "error", text: problems.join(" · ") }
        : { kind: "ok", text: t("admin.photos.uploaded", { count: list.length }) },
    );
  }

  function move(index: number, by: -1 | 1) {
    const ids = items.map((i) => i.id);
    const [moved] = ids.splice(index, 1);
    if (!moved) return;
    ids.splice(index + by, 0, moved);
    void run(() => api.orderImages(productId, ids));
  }

  return (
    <section className="panel stack">
      <h2>{t("admin.photos")}</h2>
      <p className="note">{t("admin.photos.lead")}</p>
      {items.length === 0 ? <p>{t("admin.photos.none")}</p> : null}
      <ul className="photos">
        {items.map((image, index) => {
          const alt = alts[image.id] ?? image.alt;
          const changed = alt.bg !== image.alt.bg || alt.en !== image.alt.en;
          return (
            <li key={image.id} className="photos__item">
              <a href={image.url} target="_blank" rel="noreferrer">
                <img
                  src={image.thumbUrl}
                  alt={alt.bg}
                  width={120}
                  height={Math.round((120 * image.height) / image.width)}
                />
              </a>
              <div className="stack">
                <span className="label">
                  {index === 0 ? t("admin.photos.main") : `${index + 1}.`} · {image.width}×{image.height}
                </span>
                <div className="grid-2">
                  <div className="field">
                    <label htmlFor={`alt-bg-${image.id}`}>{t("admin.photos.altBg")}</label>
                    <input
                      id={`alt-bg-${image.id}`}
                      maxLength={200}
                      value={alt.bg}
                      onChange={(e) => setAlts({ ...alts, [image.id]: { ...alt, bg: e.target.value } })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`alt-en-${image.id}`}>{t("admin.photos.altEn")}</label>
                    <input
                      id={`alt-en-${image.id}`}
                      maxLength={200}
                      value={alt.en}
                      onChange={(e) => setAlts({ ...alts, [image.id]: { ...alt, en: e.target.value } })}
                    />
                  </div>
                </div>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={busy || !changed}
                    onClick={() => run(() => api.saveImageAlt(productId, image.id, alt))}
                  >
                    {t("admin.photos.saveAlt")}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑ {t("admin.photos.up")}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy || index === items.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓ {t("admin.photos.down")}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t("admin.photos.confirmDelete")))
                        void run(() => api.deleteImage(productId, image.id));
                    }}
                  >
                    {t("admin.photos.delete")}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="field">
        <label htmlFor="photo-upload">{t("admin.photos.add")}</label>
        <input
          id="photo-upload"
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={busy}
          onChange={(e) => void upload(e.target.files)}
        />
        <small>{t("admin.photos.rules")}</small>
      </div>
      {progress ? <p role="status">{progress}</p> : null}
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
