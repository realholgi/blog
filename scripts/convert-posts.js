import {createRequire} from 'module';
import {fileURLToPath} from 'url';
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
const POST_DATE_PATTERN = /\[date:\s*(\d{4}-\d{2}-\d{2})\]/i;

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {recursive: true});
    }
}

ensureDir(OUTPUT_DIR);
ensureDir(MEDIA_DIR);

// Initialize Mastodon client
const M = new Mastodon({
    access_token: ACCESS_TOKEN,
    api_url: `${MASTODON_URL}/api/v1/`,
});

function formatGermanDate(date) {
    return new Intl.DateTimeFormat('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

async function fetchTaggedPosts() {
    try {
        // Get user ID first
        const account = await M.get('accounts/verify_credentials', {});
        const accountId = account.data.id;

        let allTaggedPosts = [];
        let maxId = null;
        let hasMore = true;

        while (hasMore) {
            // Fetch statuses with pagination
            const params = {limit: 40}; // Max limit per request
            if (maxId) {
                params.max_id = maxId;
            }

            const statuses = await M.get(`accounts/${accountId}/statuses`, params);

            if (statuses.data.length === 0) {
                hasMore = false;
                break;
            }

            // Filter for posts with the hashtag
            const taggedPosts = statuses.data.filter(post => {
                const tags = post.tags.map(tag => tag.name.toLowerCase());
                return tags.includes(HASHTAG.toLowerCase());
            });

            allTaggedPosts = allTaggedPosts.concat(taggedPosts);

            // Set up for next iteration
            maxId = statuses.data[statuses.data.length - 1].id;

            // Optional: Stop if we've reached MAX_POSTS tagged posts
            if (MAX_POSTS && allTaggedPosts.length >= parseInt(MAX_POSTS)) {
                allTaggedPosts = allTaggedPosts.slice(0, parseInt(MAX_POSTS));
                hasMore = false;
            }

            console.log(`Fetched batch, found ${taggedPosts.length} tagged posts (total: ${allTaggedPosts.length})`);
        }

        console.log(`Found ${allTaggedPosts.length} posts with #${HASHTAG} hashtag`);

        // Convert each post to Markdown
        for (const post of allTaggedPosts) {
            await convertPostToMarkdown(post);
        }
    } catch (error) {
        console.error('Error fetching posts:', error);
    }
}

async function convertPostToMarkdown(post) {
    const date = new Date(post.created_at);
    const formattedDate = date.toISOString().split('T')[0];
    const postId = post.id;
    const fileName = `${formattedDate}-${postId}.md`;
    const filePath = path.join(OUTPUT_DIR, fileName);

    // Create post-specific media directory
    const postMediaDir = path.join(MEDIA_DIR, postId);
    if (!fs.existsSync(postMediaDir)) {
        fs.mkdirSync(postMediaDir, {recursive: true});
    }

    // Create frontmatter
    let content = `---\nid: "${post.id}"\n`;

    let header = ``;
    let title_pic = ``;

    // Handle first media attachments
    if (post.media_attachments && post.media_attachments.length > 0) {

        // Download each media attachment
        const media = post.media_attachments[0];
        const mediaUrl = media.url || media.preview_url; // Use preview if full URL not available

        if (mediaUrl) {
            const mediaFileName = `${1}-${path.basename(mediaUrl)}`;
            const mediaFilePath = path.join(postMediaDir, mediaFileName);

            // Download the media file
            await downloadFile(mediaUrl, mediaFilePath);

            // Add relative path to the Markdown
            const relativeMediaPath = path.relative(OUTPUT_DIR, mediaFilePath).replace(/\\/g, '/');
            title_pic = `../${relativeMediaPath}`
            content += `banner: ${title_pic}`
            header = `${media.description.trim()}`;
        }
    }

    // Add content (remove HTML tags and the #ta hashtag)
    let postContent = post.content.replace(/<[^>]*>/g, '');

    // Remove the #ta hashtag (case-insensitive)
    postContent = postContent.replace(new RegExp(`#${HASHTAG}\\b`, 'gi'), '');

    // Trim extra whitespace that might be left after removing the tag
    postContent = postContent.trim();

    if (header) {
        const heading = title_pic
            ? `# [${header}](${title_pic})`
            : `# ${header}`;

        postContent = `${heading}\n\n${postContent}`;
    }

    // Extract date from postContent if present
    const dateResult = postContent.match(POST_DATE_PATTERN);
    const extractedDate = dateResult?.[1];
    const postDate = extractedDate
        ? new Date(`${extractedDate}T00:00:00.000Z`)
        : new Date(post.created_at);

    postContent = postContent.replace(POST_DATE_PATTERN, '').trim();

    content += `\ntitle: "Te Araroa Trail - ${formatGermanDate(postDate)} - ${header}"\ntags: ["ta"]\n`;
    content += `date: "${postDate.toISOString()}"\n---\n\n`
    content += postContent;

    // Handle other media attachments
    if (post.media_attachments && post.media_attachments.length > 1) {

        // Download each media attachment
        for (let i = 1; i < post.media_attachments.length; i++) {
            const media = post.media_attachments[i];
            const mediaUrl = media.url || media.preview_url; // Use preview if full URL not available

            if (mediaUrl) {
                const mediaFileName = `${i + 1}-${path.basename(mediaUrl)}`;
                const mediaFilePath = path.join(postMediaDir, mediaFileName);

                // Download the media file
                await downloadFile(mediaUrl, mediaFilePath);

                // Add relative path to the Markdown
                const relativeMediaPath = path.relative(OUTPUT_DIR, mediaFilePath).replace(/\\/g, '/');
                content += `![${media.description.trim() || 'Image'}](../${relativeMediaPath}) ${media.description.trim()}\n`;
            }
        }
    }


    // Write to file
    fs.writeFileSync(filePath, content);

    console.log(`Created Markdown file: ${fileName}`);
}

function downloadFile(url, destination) {
    return new Promise((resolve, reject) => {
        // Skip if file already exists
        if (fs.existsSync(destination)) {
            console.log(`File already exists: ${destination}`);
            return resolve();
        }

        console.log(`Downloading ${url} to ${destination}`);

        const file = fs.createWriteStream(destination);
        https.get(url, (response) => {
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destination, () => {
            }); // Delete the file if there was an error
            reject(err);
        });
    });
}

// Run the script
fetchTaggedPosts();
