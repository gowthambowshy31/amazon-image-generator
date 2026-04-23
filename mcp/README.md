# @bowshai/imagegen-mcp

MCP server that lets Claude Desktop / Claude Code / any MCP client drive bulk
image & video generation on your ImageGen account.

## Install

```bash
npm i -g @bowshai/imagegen-mcp
```

## Configure in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "imagegen": {
      "command": "npx",
      "args": ["-y", "@bowshai/imagegen-mcp"],
      "env": {
        "IMAGEGEN_API_KEY": "igp_your_key_here",
        "IMAGEGEN_API_URL": "https://imagegen.bowshai.com"
      }
    }
  }
}
```

Get a key at `https://imagegen.bowshai.com/settings/api-keys`. Restart Claude
Desktop after editing.

## Configure in Claude Code

```bash
claude mcp add imagegen --scope user -- npx -y @bowshai/imagegen-mcp
# then set env vars in the MCP config or wrap in a shell script
```

## Tools exposed

| Tool | What it does |
| --- | --- |
| `generate_variations` | Take a local folder of images, generate N AI variations of each, save to an output folder. |
| `generate_video` | Text-to-video via Veo 3.1, returns URL and optionally saves locally. |
| `list_templates` | List prompt templates available on the account. |
| `whoami` | Verify the API key and show the connected account. |

## Example prompt to Claude

> I have a folder `/Users/me/products/jewelry` with 50 product photos.
> Generate 3 studio-lit variations of each image and save them to
> `/Users/me/products/jewelry/variations`.

Claude will call `generate_variations` with those paths.
