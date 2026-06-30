import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const Mastodon = require('mastodon-api');
const fs = require('fs');
const https = require('https');

// Configuration
const MASTODON_URL = process.env.MASTODON_URL;
const ACCESS_TOKEN = process.env.MASTODON_ACCESS_TOKEN;
const HASHTAG = process.env.MASTODON_HASHTAG;
const MAX_POSTS = process.env.MAX_POSTS;

const OUTPUT_DIR = path.join(__dirname, '../content/posts');
const MEDIA_DIR = path.join(__dirname, '../images/posts');

const POST_DATE_PATTERN = /\[d a t e:\s*(\d{4}-\d{2}-\d{2})\]/i;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function validateConfiguration() {
  const missingVariables = [];

  if (!MASTODON_URL) {
    missingVariables.push('MASTODON_URL');
  }

  if (!ACCESS_TOKEN) {
    missingVariables.push('MASTODON_ACCESS_TOKEN');
  }

  if (!HASHTAG) {
    missingVariables.push('MASTODON_HASHTAG');
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(', ')}`
    );
  }
}

ensureDir(OUTPUT_DIR);
ensureDir(MEDIA_DIR);

validateConfiguration();

// Initialize Mastodon client
const M = new Mastodon({
  access_token: ACCESS_TOKEN,
  api_url: `${MASTODON_URL.replace(/\/$/, '')}/api/v1/`,
});

async function fetchTaggedPosts() {
  try {
    // Get the authenticated account ID.
    const account = await M.get('accounts/verify_credentials', {});
    const accountId = account.data.id;

    let allTaggedPosts = [];
    let maxId = null;
    let hasMore = true;

    while (hasMore) {
      // Mastodon allows up to 40 statuses per request.
      const params = {
        limit: 40,
      };

      if (maxId) {
        params.max_id = maxId;
      }

      const statuses = await M.get(
        `accounts/${accountId}/statuses`,
        params
      );

      if (!statuses.data || statuses.data.length === 0) {
        break;
      }

      // Import only posts carrying the configured import hashtag.
      const taggedPosts = statuses.data.filter((post) => {
        const tags = getPostTags(post);
        return tags.includes(HASHTAG.toLowerCase());
      });

      allTaggedPosts = allTaggedPosts.concat(taggedPosts);

      // Use the oldest status ID as pagination cursor.
      maxId = statuses.data[statuses.data.length - 1].id;

      if (MAX_POSTS) {
        const maximum = Number.parseInt(MAX_POSTS, 10);

        if (Number.isInteger(maximum) && maximum > 0) {
          if (allTaggedPosts.length >= maximum) {
            allTaggedPosts = allTaggedPosts.slice(0, maximum);
            hasMore = false;
          }
        }
      }

      console.log(
        `Fetched batch, found ${taggedPosts.length} tagged posts ` +
        `(total: ${allTaggedPosts.length})`
      );
    }

    console.log(
      `Found ${allTaggedPosts.length} posts with #${HASHTAG} hashtag`
    );

    for (const post of allTaggedPosts) {
      await convertPostToMarkdown(post);
    }
  } catch (error) {
    console.error('Error fetching posts:', error);
    process.exitCode = 1;
  }
}

function getPostTags(post) {
  if (!Array.isArray(post.tags)) {
    return [];
  }

  return [
    ...new Set(
      post.tags
        .map((tag) => tag?.name?.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];
}

function getMediaDescription(media) {
  if (typeof media?.description !== 'string') {
    return '';
  }

  return media.description.trim();
}

function getTitle(header, postContent, postTags) {
  let title = header;

  // Fall back to the first non-empty line of the post when the first image
  // has no description or the post has no image.
  if (!title) {
    title = postContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? '';
  }

  // Avoid excessively long titles when the post text is used as fallback.
  if (title.length > 160) {
    title = `${title.slice(0, 157).trimEnd()}...`;
  }

  if (!title) {
    title = 'Mastodon post';
  }

  if (postTags.includes('ta')) {
    return `Te Araroa Trail - ${title}`;
  }

  return title;
}

async function convertPostToMarkdown(post) {
  const createdDate = new Date(post.created_at);
  const formattedDate = createdDate.toISOString().split('T')[0];
  const postId = post.id;

  const fileName = `${formattedDate}-${postId}.md`;
  const filePath = path.join(OUTPUT_DIR, fileName);

  // Create a media directory for this post.
  const postMediaDir = path.join(MEDIA_DIR, postId);
  ensureDir(postMediaDir);

  let content = `---\nid: ${JSON.stringify(String(post.id))}\n`;
  let header = '';
  let titlePic = '';

  // Use the first media attachment as banner and title image.
  if (
    Array.isArray(post.media_attachments) &&
    post.media_attachments.length > 0
  ) {
    const media = post.media_attachments[0];
    const mediaUrl = media.url || media.preview_url;

    if (mediaUrl) {
      const mediaFileName = `1-${getFileNameFromUrl(mediaUrl)}`;
      const mediaFilePath = path.join(postMediaDir, mediaFileName);

      await downloadFile(mediaUrl, mediaFilePath);

      const relativeMediaPath = path
        .relative(OUTPUT_DIR, mediaFilePath)
        .replace(/\\/g, '/');

      titlePic = `../${relativeMediaPath}`;
      content += `banner: ${JSON.stringify(titlePic)}\n`;
      header = getMediaDescription(media);
    }
  }

  // Convert the Mastodon HTML content to plain text.
  let postContent = String(post.content ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '');

  // Remove only the configured import hashtag from the displayed content.
  postContent = postContent.replace(
    new RegExp(`#${escapeRegExp(HASHTAG)}\\b`, 'gi'),
    ''
  );

  postContent = postContent.trim();

  if (header) {
    const heading = titlePic
      ? `# [${header}](${titlePic})`
      : `# ${header}`;

    postContent = `${heading}\n\n${postContent}`;
  }

  // Allow an explicitly supplied date in the Mastodon post.
  const dateResult = postContent.match(POST_DATE_PATTERN);
  const extractedDate = dateResult?.[1];

  const postDate = extractedDate
    ? new Date(`${extractedDate}T00:00:00.000Z`)
    : createdDate;

  postContent = postContent.replace(POST_DATE_PATTERN, '').trim();

  // Copy every Mastodon hashtag into Hugo frontmatter.
  const postTags = getPostTags(post);

  // Only #ta posts receive the Te Araroa prefix.
  const title = getTitle(header, postContent, postTags);

  content += `title: ${JSON.stringify(title)}\n`;
  content += `tags: ${JSON.stringify(postTags)}\n`;
  content += `date: ${JSON.stringify(postDate.toISOString())}\n`;
  content += `---\n\n`;
  content += postContent;

  if (titlePic) {
    const imageAlt = header || title;

    content +=
      `\n\n![${escapeMarkdownText(imageAlt)}](${titlePic})` +
      `${header ? ` ${header}` : ''}\n`;
  } else {
    content += '\n';
  }

  // Download and append all remaining media attachments.
  if (
    Array.isArray(post.media_attachments) &&
    post.media_attachments.length > 1
  ) {
    for (let i = 1; i < post.media_attachments.length; i += 1) {
      const media = post.media_attachments[i];
      const mediaUrl = media.url || media.preview_url;

      if (!mediaUrl) {
        continue;
      }

      const mediaFileName =
        `${i + 1}-${getFileNameFromUrl(mediaUrl)}`;

      const mediaFilePath = path.join(
        postMediaDir,
        mediaFileName
      );

      await downloadFile(mediaUrl, mediaFilePath);

      const relativeMediaPath = path
        .relative(OUTPUT_DIR, mediaFilePath)
        .replace(/\\/g, '/');

      const description = getMediaDescription(media);
      const imageAlt = description || 'Image';

      content +=
        `\n![${escapeMarkdownText(imageAlt)}]` +
        `(../${relativeMediaPath})`;

      if (description) {
        content += ` ${description}`;
      }

      content += '\n';
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Created Markdown file: ${fileName}`);
}

function getFileNameFromUrl(url) {
  const parsedUrl = new URL(url);
  const fileName = path.basename(parsedUrl.pathname);

  return fileName || 'media';
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeMarkdownText(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function downloadFile(url, destination, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(destination)) {
      console.log(`File already exists: ${destination}`);
      resolve();
      return;
    }

    if (redirectCount > 5) {
      reject(new Error(`Too many redirects while downloading ${url}`));
      return;
    }

    console.log(`Downloading ${url} to ${destination}`);

    const request = https.get(url, (response) => {
      const statusCode = response.statusCode ?? 0;

      if (
        statusCode >= 300 &&
        statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();

        const redirectUrl = new URL(
          response.headers.location,
          url
        ).toString();

        downloadFile(
          redirectUrl,
          destination,
          redirectCount + 1
        ).then(resolve, reject);

        return;
      }

      if (statusCode !== 200) {
        response.resume();

        reject(
          new Error(
            `Download failed with HTTP ${statusCode}: ${url}`
          )
        );

        return;
      }

      const file = fs.createWriteStream(destination);

      response.pipe(file);

      file.on('finish', () => {
        file.close(resolve);
      });

      file.on('error', (error) => {
        file.close();

        fs.unlink(destination, () => {
          reject(error);
        });
      });
    });

    request.on('error', (error) => {
      fs.unlink(destination, () => {
        reject(error);
      });
    });
  });
}

// Run the script.
fetchTaggedPosts();
