This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Run with Docker Desktop (development)

Make sure Docker Desktop is running, then open a terminal in this project folder
and run:

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). Changes made to the source
files on your computer are mounted into the container, so the Next.js development
server can reload them without rebuilding the image.

The application reads its existing credentials from `.env.local`. If you change
the environment file or either package lock file, recreate the container:

```bash
docker compose up --build --force-recreate
```

To stop the application, press `Ctrl+C`. To stop it when it was started in the
background, run:

```bash
docker compose down
```

To also reset the container-only dependency and Next.js cache volumes, run:

```bash
docker compose down --volumes
```

## Run without Docker

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Microsoft 365 campaign automation

Campaign automation uses Microsoft Graph to send mail from a Microsoft 365
mailbox. Add these values to `.env.local` before sending test mail:

```env
M365_TENANT_ID=
M365_CLIENT_ID=
M365_CLIENT_SECRET=
M365_SENDER_USER=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The Azure app registration needs Microsoft Graph `Mail.Send` application
permission with admin consent. Open `/automation` in the app to check setup and
send a controlled test email. The Supabase service role key is only used on the
server to write tracking events from email opens and clicks.

## AI social content

The social planner sends its five weekly briefs to the server, which generates
structured post drafts with the Gemini API. Create a free API key in Google AI
Studio, then add these server-only values to `.env.local`:

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
```

Open `/social`, complete the five content notes, and select **Generate with AI**.
The API key is never sent to the browser. Generated copy should be reviewed and
edited before publishing.

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
