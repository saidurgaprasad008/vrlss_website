# VRLS Solutions Website

Live site: https://vrlss.in

A React website for VRLS Solutions. The repository contains the main studio site, industry-specific website previews, product-style demos, blog and testimonial pages, and a Cloudflare Worker API.

## Screenshot

<!-- Add screenshot here: cinematic homepage -->
<!-- Add screenshot here: work and demo pages -->
<!-- Add screenshot here: mobile view -->

## Tech used

- React 19 and JavaScript
- Vite for development and client builds
- Three.js, React Three Fiber, Drei and postprocessing for 3D scenes
- GSAP and ScrollTrigger for scroll-linked motion
- Lenis for smooth scrolling
- Lucide React for icons
- Cloudflare Workers, Pages assets and D1 database integration
- ESLint

## Main features

- Cinematic homepage with a responsive 3D experience and fallback modes
- Studio pages for websites, digital marketing, pricing, work, about and contact
- Industry website previews and interactive product demos
- Localized demo content and market/location pages
- Blog, testimonials and an admin interface
- Currency display and client enquiry flows
- Worker-backed API routes for blog and testimonial data
- Prerendering script that generates route HTML, sitemap and robots file

## Run locally

Requires Node.js and npm.

1. Clone this repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the Vite development server:

   ```bash
   npm run dev
   ```

4. Open the local URL printed by Vite.

Useful scripts:

- `npm run lint` — run ESLint.
- `npm run build` — build the client, server-rendered entry and prerendered pages.
- `npm run preview` — preview the Vite build.

Cloudflare Worker and D1-backed features may require the corresponding local or deployed Cloudflare bindings to behave as they do in production.

## What I learned

This project gave me practice combining React components, routing, responsive interfaces, 3D rendering, scroll animation, prerendering and a Worker-backed data layer in one website.

I use AI-assisted development to help draft and implement code. I review, test and fix the code myself.
