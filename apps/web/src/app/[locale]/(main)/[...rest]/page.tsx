import { notFound } from "next/navigation";

/** Any unknown path under /bg or /en renders the branded 404 inside the normal layout. */
export default function CatchAll() {
  notFound();
}
