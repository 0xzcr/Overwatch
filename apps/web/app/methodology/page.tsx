import { permanentRedirect } from "next/navigation";

// The methodology now lives in the documentation; old links and bookmarks land on its scoring section.
export default function Methodology() {
  permanentRedirect("/docs#scoring");
}
