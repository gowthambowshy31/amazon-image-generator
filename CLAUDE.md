# Git Workflow

- Work directly on `main` — no feature branches for routine work.
- After each change, **commit and push immediately** without asking.
- Use short, descriptive commit messages (what was done, not how).

# EC2 Deployment

- **IP:** 56.228.4.202
- **User:** ubuntu
- **SSH Key:** `./image-gen-key.pem`
- **Project path:** `/home/ubuntu/image-gen-platform`
- **Process manager:** PM2 (app name: `image-gen`)

## Deploy steps

1. Commit and push to `origin/main`
2. SSH in and run: `git pull origin main && npm install && npm run build && pm2 restart all`

## Update .env on EC2

```
ssh -i image-gen-key.pem ubuntu@56.228.4.202
nano /home/ubuntu/image-gen-platform/.env
pm2 restart all
```
