<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deployment rule — no automatic pushes

`git push` to this repo triggers Vercel auto-deploy. NEVER run `git push` (or any
`vercel` deploy/redeploy/promote/alias command) on your own — only when the user
explicitly asks in that conversation. Committing locally is fine and encouraged
(commit after each tested change); pushing is a deploy decision that belongs to
the user.
