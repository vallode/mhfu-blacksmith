// Code next-pwa bundles into the service worker (its customWorkerSrc,
// "worker/" by default), next to the generated public/sw.js.

// The runtime page caches in next.config.mjs. A cached page names its build's
// hashed JS and CSS chunks, which a new build's precache drops and the server
// no longer has. So a new service worker (a new build) clears these on
// activation, rather than serving an old page that can't load its scripts
// when the network is slow (networkTimeoutSeconds) or down. Offline, pages
// not yet visited again fall back to /offline/.
const PAGE_CACHES = ["pages", "pages-rsc", "pages-rsc-prefetch"];

// The DOM lib types `self` as a Window; this is the part of a service
// worker's scope used here.
const sw = self as unknown as {
  addEventListener(
    type: "activate",
    listener: (event: { waitUntil(promise: Promise<unknown>): void }) => void,
  ): void;
};

sw.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all(PAGE_CACHES.map((name) => caches.delete(name))));
});
