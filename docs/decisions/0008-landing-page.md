# 0008 — Landing page (איקומרס.ישראל)

Status: accepted

- Lives at the platform root (`app/(marketing)/page.tsx`), statically prerendered; CTAs point to the dashboard host (`APP_URL` origin → `/sign-up`, `/sign-in`).
- Direction approved by the founder from a generated reference image: dark, glowing, calm. Message: "the store you manage by conversation" (easy, cheaper than an agency, saves time on products/stock).
- Signature element: two parallel store sliders rotated exactly 35° (one band), scrolling in opposite directions. Pure CSS (transform animation, no libraries, no images; cards are CSS + icons). Because the page is RTL, the band is forced `direction: ltr`, otherwise rows overflow to the left and the loop runs out of cards. Decorative (`aria-hidden`), with a visible pause button (WCAG 2.2.2) and no motion for `prefers-reduced-motion`. A text fade (overlay, not a mask: masks clip at the element box) keeps the copy readable.
- Honesty rules for copy: no invented savings percentages; the cost calculator only sums the visitor's own numbers and states that a Claude subscription is separate and platform pricing is not yet published; WhatsApp ordering is marked "in development"; trust claims are limited to what exists (secure hosted payment page, approval before changes, accessible Hebrew RTL).
- Not on the page on purpose: pricing, testimonials, invented store screenshots as "customers" (cards are illustrative; replace with consenting beta merchants later).
- Tests: content/CTAs/anchors, exact 35° tilt + opposite directions + pause + reduced motion, calculator, FAQ, mobile overflow, axe (critical/serious) on desktop and mobile.
