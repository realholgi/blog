# blog.eiboeck.de

Hugo static site blog by Holger Eiboeck. Published at https://blog.eiboeck.de/

## Project Structure

- `hugo.toml` — Hugo configuration (theme: m10c, language: de-DE)
- `content/posts/` — Blog posts as markdown files
- `images/posts/<postId>/` — Media attachments for posts
- `themes/m10c/` — Hugo theme (git submodule)
- `scripts/` — Tooling scripts

## Content Workflow

Posts are imported from Mastodon via `scripts/convert-posts.js`. The script:
- Fetches posts tagged with `#ta` from `https://23.social/@realholgi`
- Downloads media attachments to `images/posts/<mastodon_id>/`
- Creates Hugo markdown files in `content/posts/` with naming pattern `YYYY-MM-DD-<mastodon_id>.md`

### Post Frontmatter Format

```yaml
---
id: "<mastodon_id>"
banner: ../../../images/posts/<id>/1-<filename>
title: "Te Araroa Trail - <image description>"
tags: ["ta"]
date: "<ISO8601 datetime>"
---
```

### Running the Import Script

```sh
# Install dependencies (first time only)
sh scripts/setup-local.sh

# Set environment variables (contains secrets — never commit this file)
source scripts/set-local-env.sh

# Run import
node scripts/convert-posts.js
```

**Important:** `scripts/set-local-env.sh` contains a Mastodon access token. Never commit this file.

## Hugo Commands

```sh
hugo server      # Local dev server
hugo             # Build site to public/
```

## Deployment

The site is hosted on **GitHub Pages**. Deployment is fully automated via GitHub Actions (`.github/workflows/hugo.yaml`):

- Pushing to `main` (with changes under `content/` or `static/`) triggers a build and deploy automatically.
- The workflow runs `hugo --gc --minify`, uploads `public/` as a Pages artifact, and deploys it.
- No manual deploy command is needed locally — just commit and push.
