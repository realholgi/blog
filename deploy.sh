#!/bin/sh

USER=root
HOST=h2991682.stratoserver.net
DIR=/www/eiboeck.de/blog.eiboeck.de/

hugo && rsync -avz --delete public/ ${USER}@${HOST}:/${DIR}

