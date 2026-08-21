This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

The live speak-to-match loop (`/live`) also needs a small standalone relay server (in [relay/](relay/)) that bridges browser mic audio to Deepgram — it runs as a separate process on port 3001.

## Getting Started

1. Install dependencies for both the app and the relay server:

```bash
npm install
cd relay && npm install && cd ..
```

2. Set up environment variables:
   - Copy `.env.local.example` to `.env.local` in the project root (Supabase keys) — ask a team member for the values.
   - Copy `relay/.env.example` to `relay/.env` and add your `DEEPGRAM_API_KEY`.

3. Start the relay server (in its own terminal, leave it running):

```bash
cd relay && npm start
```

4. In a second terminal, start the Next.js dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The live detection loop is at [http://localhost:3000/live](http://localhost:3000/live) and requires the relay server from step 3 to be running.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
