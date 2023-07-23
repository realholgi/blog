---
title: "git problem error: unable to create temporary sha1 filename"
tags: ["git", "tip"]
date: 2012-10-24T21:40:34+01:00
draft: false
---

I got the git problem "error: unable to create temporary sha1 filename" when pushing to a remote repository.

To fix this, perform the following on both your local and remote repositories:

```bash
git fsck  
git prune  
git repack  
git fsck
```

The last fsck should not report any problems.
