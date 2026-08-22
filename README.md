# Lulaweb

Proof of concept for an AI-powered website generator. Enter a business description, and the app uses OpenAI `gpt-5.5` to produce a static HTML, CSS, and JavaScript website. Generated files are saved locally and shown in the UI.

This project does **not** include accounts, billing, databases, preview, editing, or deployment.

## 1. Install dependencies

```bash
npm install
```

## 2. Create an OpenAI API key

1. Sign in to [OpenAI](https://platform.openai.com/).
2. Open [API keys](https://platform.openai.com/api-keys).
3. Create a new secret key.
4. Copy the key. You will not be able to see it again.

## 3. Configure `OPENAI_API_KEY`

Copy the example environment file and add your key:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
OPENAI_API_KEY=sk-your-openai-api-key
```

The key is only used by the Next.js API route. It is never sent to the browser.

## 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 5. Generate a website

1. Describe the website in the textarea. For example:

   > I own a plumbing company in Durban called Thando Plumbing. We provide geyser repairs, blocked drains, leak detection and bathroom renovations. Our phone number is 082 123 4567.

2. Click **Generate Website**.
3. Wait while the app calls `POST /api/generate`, which sends the prompt to OpenAI and writes the returned files to disk.
4. Click a generated file (`index.html`, `styles.css`, `script.js`, or any extra files) to inspect its contents.

## 6. Where generated files are stored

Each successful generation creates a unique directory:

```text
generated-sites/
  <website-id>/
    index.html
    styles.css
    script.js
```

Example:

```text
generated-sites/
  8f4c1e/
    index.html
    styles.css
    script.js
```

The UI also shows the website ID and file count after a successful generation.

## Project structure

```text
app/
  page.tsx
  api/
    generate/
      route.ts
components/
  WebsiteBuilder.tsx
  FileExplorer.tsx
  CodeViewer.tsx
lib/
  types.ts
  openai.ts
  website-generator.ts
  file-manager.ts
  validation.ts
generated-sites/
```

## Notes

- OpenAI is called only from `POST /api/generate`.
- Generated file paths are validated so they cannot write outside `generated-sites/<id>/`.
- Later features such as static preview, editing, regeneration, and deployment can reuse the `websiteId` and files already written to disk.

## WhatsApp Cloud API webhook

The App Router endpoint at `/api/webhooks/whatsapp` supports Meta's GET verification
request and signed POST events. It acknowledges incoming messages, delivery statuses,
and unsupported event types. Message and status processors are intentionally isolated
in `lib/whatsapp-webhook.ts` so durable queue or database writes can be added later.
In development, each accepted webhook writes a structured, redacted payload to the
server console; message contents and complete phone numbers are never included.

Generate the webhook verify token locally with a cryptographically secure generator:

```bash
openssl rand -hex 32
```

Copy `.env.example` to `.env.local` and set `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, and `WHATSAPP_PHONE_NUMBER_ID`.
Use `1314737525052159` for `WHATSAPP_PHONE_NUMBER_ID`. Keep the generated verify token,
Meta app secret, and access token server-side. The value entered in Meta's **Verify
token** field must exactly equal `WHATSAPP_WEBHOOK_VERIFY_TOKEN`; it is a token you
choose, not the WhatsApp access token.

Run checks locally with:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Deploy the application with the five environment variables configured in the production
environment, then configure this public callback URL in Meta:

```text
https://lulaweb.co.za/api/webhooks/whatsapp
```

The production callback must use HTTPS and must remain publicly accessible without
Firebase authentication or any other login middleware. Subscribe the callback to the
WhatsApp `messages` webhook field after Meta successfully verifies it. Do not commit
`.env.local`, app secrets, verify tokens, or permanent access tokens.
