#!/bin/sh

npm init -y
npm pkg set type=module
npm install mastodon-api fs path glob gray-matter
