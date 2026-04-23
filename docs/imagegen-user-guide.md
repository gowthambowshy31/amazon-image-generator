# ImageGen — Quick Start for Raj

Hey Raj — this is a short guide to two tools we built so you can generate AI product image variations in bulk without opening a browser. You have **two ways** to use it. Pick whichever fits how you work.

---

## What is this?

You already know our web app at **imagegen.bowshai.com**. You log in, upload a product photo, and get AI-generated variations back.

We've now built two new doors into the same app:

1. **CLI** — a command you type in your terminal. Best for: "I have 100 images in a folder, give me 3 variations each."
2. **MCP (for Claude)** — lets you *talk* to Claude and ask it to generate images for you. Best for: "Hey Claude, generate 3 studio-lit versions of every photo in this folder."

Both do exactly the same work in the end. Just pick the one that feels more natural.

---

## Step 1 — Get your API key (do this once)

1. Go to **https://imagegen.bowshai.com/settings/api-keys**
2. Log in with your usual account
3. Click **Create** (give it a name like "My laptop")
4. Copy the key (it looks like `igp_AbCd1234...`). **You'll only see it once**, so paste it somewhere safe.

That's your key. Keep it secret — it's like a password. If it leaks, go back to the page and click **Revoke**.

---

## Option A — The CLI (terminal)

### Install

Open a terminal and run:

```
npm install -g @bowshai/imagegen
```

(This needs Node.js 18 or newer installed. Ask Gowtham if you don't have it.)

### Log in

```
imagegen login igp_AbCd1234...yourkey...
```

You'll see:
```
✓ Logged in as raj@privosa.com
```

Done. You won't need to log in again on this machine.

### Generate images

Say you have a folder of product photos at `C:\Users\Raj\Desktop\jewelry-photos`. You want 3 studio-lit variations of each one.

```
imagegen generate "C:\Users\Raj\Desktop\jewelry-photos" --prompt "Professional studio product photography, soft even lighting, clean white background, Amazon listing style" --variants 3
```

That's it. The CLI will:
- Look at your folder
- Send each image to the server with your prompt
- Download 3 variations of each one
- Save them to `./imagegen-output/` in your current folder

Each image is named like `IMG_3863_v1.jpg`, `IMG_3863_v2.jpg`, `IMG_3863_v3.jpg` — so you can match them back to the original.

### Other useful commands

```
imagegen whoami           → shows which account you're logged in as
imagegen templates        → lists saved prompt templates you can use
imagegen logout           → remove your key from this machine
imagegen --help           → see all commands
```

### Using a saved template instead of writing a prompt

Your account has 24 pre-built prompt templates (jewelry-specific stuff like "360° rotation", "model wearing", "size reference"). To see them:

```
imagegen templates
```

Pick one, grab its ID, and use it:

```
imagegen generate "C:\path\to\folder" --template cmn35l68a001ishpe0qrc8bva --var product_name="Gold Ring" --var metal_type="gold" --variants 2
```

The `--var key=value` bits fill in the blanks in the template.

---

## Option B — MCP (talking to Claude)

This one is cooler. Instead of typing commands, you just *tell Claude* what you want.

### Set it up (once)

1. Install Claude Desktop if you don't have it: **https://claude.ai/download**
2. Find the config file:
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
3. Open it in a text editor and add this section (if the file is empty, paste the whole thing):

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "npx",
      "args": ["-y", "@bowshai/imagegen-mcp"],
      "env": {
        "IMAGEGEN_API_KEY": "igp_AbCd1234...yourkey..."
      }
    }
  }
}
```

4. Replace the `igp_...` part with your actual key from Step 1.
5. Save the file.
6. Quit Claude Desktop completely and reopen it.

### Use it

Just chat with Claude normally. When you mention image generation, Claude will automatically use our tool.

**Example prompts that will work:**

> Hey Claude, I have 20 product photos in `C:\Users\Raj\Desktop\new-rings`. Generate 3 variations of each with a clean white background and studio lighting. Save them to `C:\Users\Raj\Desktop\new-rings-variants`.

> Generate a video for me: a gold necklace slowly rotating 360 degrees on black velvet. Save it to my Downloads folder.

> List all the jewelry templates available in ImageGen.

Claude picks up on your intent, calls the right tool, runs the generation, and reports back when it's done. You don't have to know command syntax — just describe what you want.

---

## Which one should I use?

| Situation | Use |
|---|---|
| You prefer typing structured commands | **CLI** |
| You want to describe things in plain English | **MCP** |
| You're running a very large batch overnight | **CLI** (easier to script and watch) |
| You want Claude to help you pick the right prompt too | **MCP** |
| You want both | Install both — they share the same API key |

---

## Common questions

**Q: Does this count against our paid Gemini usage?**
Yes — every variant is one Gemini API call, just like the web app. Cost is the same.

**Q: Where do my generated images live?**
- CLI: downloaded to the `--out` folder (default `./imagegen-output`) on your machine
- MCP: Claude will save to whatever folder you told it (e.g. "save to my Downloads")
- Also on our S3 bucket permanently — the URLs are included in the output so you can link them directly.

**Q: How long does a big batch take?**
About 10 seconds per variant. So 100 photos × 3 variants with default settings ≈ 25 minutes. You can increase parallelism with `--concurrency 4` or `--concurrency 8` for the CLI.

**Q: What if something fails halfway?**
Each image is independent. The CLI prints which ones failed. Just re-run the same command for the failed ones — previous successes stay on disk.

**Q: Can I use this for non-jewelry products?**
Yes. The templates are jewelry-tuned right now, but free-form `--prompt` works for anything.

**Q: My key stopped working.**
It was probably revoked. Go to `https://imagegen.bowshai.com/settings/api-keys`, create a new one, and run `imagegen login <new-key>` (or update your Claude Desktop config).

---

## Need help?

Ping Gowtham. Happy generating.
