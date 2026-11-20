import { useState } from "react";
import { API_BASE_URL } from "../api/config";
import { YarnIcon } from "./Icons";

// A product photo. Until real photos are uploaded (or if one fails to load),
// it shows a soft tile with a yarn ball instead of a broken image.
// Photos uploaded in the back office are kept by the backend ("/uploads/..."),
// so those addresses get the backend's address in front.
export const photoUrl = (src) => (src?.startsWith("/uploads/") ? `${API_BASE_URL}${src}` : src);

export default function ProductImage({ src, alt, className = "", dimmed = false, iconClassName = "h-10 w-10" }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-blush/60 text-terracotta ${
          dimmed ? "opacity-60" : ""
        } ${className}`}
      >
        <YarnIcon className={iconClassName} />
      </div>
    );
  }

  return (
    <img
      src={photoUrl(src)}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover ${dimmed ? "opacity-50 grayscale" : ""} ${className}`}
    />
  );
}
