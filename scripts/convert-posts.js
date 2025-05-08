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
const OUTPUT_DIR = path.join(__dirname, '../content/posts');
const MEDIA_DIR = path.join(__dirname, '../images/posts');

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Initialize Mastodon client
const M = new Mastodon({
  access_token: ACCESS_TOKEN,
  api_url: `${MASTODON_URL}/api/v1/`,
});

async function fetchTaggedPosts() {
  try {
    // Get user ID first
    const account = await M.get('accounts/verify_credentials', {});
    const accountId = account.data.id;
    
    // Fetch statuses
    const statuses = await M.get(`accounts/${accountId}/statuses`, { limit: 500 });
    
    // Filter for posts with the #ta hashtag
    const taggedPosts = statuses.data.filter(post => {
      const tags = post.tags.map(tag => tag.name.toLowerCase());
      return tags.includes(HASHTAG.toLowerCase());
    });
    
    console.log(`Found ${taggedPosts.length} posts with #${HASHTAG} hashtag`);
    
    // Convert each post to markdown
    for (const post of taggedPosts) {
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
  const germanDate = new Intl.DateTimeFormat('de-DE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
}).format(date);

  // Create post-specific media directory
  const postMediaDir = path.join(MEDIA_DIR, postId);
  if (!fs.existsSync(postMediaDir)) {
    fs.mkdirSync(postMediaDir, { recursive: true });
  }
  
  // Create frontmatter
  let content = `---
id: "${post.id}"
title: "Te Araroa Trail - ${germanDate}"
tags: ["ta"]
date: "${post.created_at}"
`;
  
  let header = ``;
  
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
        
      // Add relative path to the markdown
      const relativeMediaPath = path.relative(OUTPUT_DIR, mediaFilePath).replace(/\\/g, '/');
      content += `banner: ../${relativeMediaPath}`
      header = `${media.description}`;
    }
  }

  content += `\n---`;


  // Add content (remove HTML tags and the #ta hashtag)
  let postContent = post.content.replace(/<[^>]*>/g, '');
  
  // Remove the #ta hashtag (case insensitive)
  postContent = postContent.replace(new RegExp(`#${HASHTAG}\\b`, 'gi'), '');
  
  // Trim extra whitespace that might be left after removing the tag
  postContent = postContent.trim();
  
  if (header) {
  		postContent = `# ${header}\n\n` + postContent;
  }
  content += '\n\n' + postContent;

  // Handle other  media attachments
  if (post.media_attachments && post.media_attachments.length > 1) {
    
    // Download each media attachment
    for (let i = 1; i < post.media_attachments.length; i++) {
      const media = post.media_attachments[i];
      const mediaUrl = media.url || media.preview_url; // Use preview if full URL not available
      
      if (mediaUrl) {
        const mediaFileName = `${i+1}-${path.basename(mediaUrl)}`;
        const mediaFilePath = path.join(postMediaDir, mediaFileName);
        
        // Download the media file
        await downloadFile(mediaUrl, mediaFilePath);
        
        // Add relative path to the markdown
        const relativeMediaPath = path.relative(OUTPUT_DIR, mediaFilePath).replace(/\\/g, '/');
        content += `![${media.description || 'Image'}](../${relativeMediaPath})\n`;
      }
    }
  }
  
  
  // Write to file
  fs.writeFileSync(filePath, content);
  
  console.log(`Created markdown file: ${fileName}`);
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
      fs.unlink(destination, () => {}); // Delete the file if there was an error
      reject(err);
    });
  });
}

// Run the script
fetchTaggedPosts();
