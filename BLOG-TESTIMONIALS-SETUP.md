# Blog + Testimonials setup (one time)

The blog editor and testimonials use a small free Cloudflare database (D1) and the
existing `vrlss-website` Worker. Run these in the project folder (`~/vrlss/...`).

1. Log in to Cloudflare (opens the browser once):
   npx wrangler login

2. Create the database and copy the `database_id` it prints:
   npx wrangler d1 create vrlss
   Paste that id into wrangler.jsonc in place of PASTE_DATABASE_ID_HERE.

3. Create the tables:
   npx wrangler d1 execute vrlss --remote --file=worker/schema.sql

4. Set the two secrets (each one asks you to type the value; nothing is saved in the code):
   npx wrangler secret put ADMIN_PASSWORD     # your admin password, 12+ characters
   npx wrangler secret put SESSION_SECRET     # paste the output of: openssl rand -hex 32

5. Build and push (Cloudflare deploys from GitHub as before):
   npm run build
   git add -A && git commit -m "Blog editor, testimonials, normal hero, Inviname case study" && git push

## Using it
- vrlss.in/admin       log in, write blog posts (Write/Preview), hide or delete testimonials
- vrlss.in/testimonials  anyone can post; it appears straight away
  (limits: 3 per person per day, no links, bot trap field)
- vrlss.in/?cinema=full  still shows the old full 3D scroll scene, if you ever want it back

## Scheduled posts (100 daily articles)
Posts have a "Publish on" time. They stay hidden until then and appear automatically.

One time, after pulling this update:
   npx wrangler d1 execute vrlss --remote --file=worker/migrate-001-schedule.sql
   npx wrangler d1 execute vrlss --remote --file=worker/seed-100-posts.sql

The first post appears at 8:00 AM IST the day after you run the seed, then one every morning for 100 days.
Edit, reschedule or unpublish any of them at vrlss.in/admin. Live posts are listed at vrlss.in/blog-sitemap.xml.
