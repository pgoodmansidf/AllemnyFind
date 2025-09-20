## Environment Management

### Reset Local to Match GitHub (Production)

When asked to "reset to GitHub" or "restore from GitHub":

1. Check for uncommitted changes: `git status`
2. If changes exist, warn user and ask for confirmation
3. Fetch latest: `git fetch origin`
4. Hard reset: `git reset --hard origin/$(git branch --show-current)`
5. Clean untracked files: `git clean -fd`
6. Show current commit: `git log -1 --oneline`

### Setup Local Development Environment

When asked to "setup local environment" or "configure for local development":

1. **Preserve production configs** by creating copies:
```bash
   # If config files exist, back them up
   cp .env .env.production 2>/dev/null || true
   cp config/database.yml config/database.yml.production 2>/dev/null || true
   cp config/settings.json config/settings.json.production 2>/dev/null || true

Apply local configurations:

bash   # Copy local versions if they exist, otherwise create from templates
   cp .env.local .env 2>/dev/null || cp .env.example .env 2>/dev/null || true
   cp config/database.yml.local config/database.yml 2>/dev/null || true
   cp config/settings.json.local config/settings.json 2>/dev/null || true

Mark local config files to ignore changes (prevents accidental commits):

bash   git update-index --skip-worktree .env
   git update-index --skip-worktree config/database.yml
   git update-index --skip-worktree config/settings.json
   # Add any other config files that should remain local

Update local-specific settings:

Set DATABASE_URL to local database
Set API endpoints to localhost
Disable production security features (HTTPS, etc.)
Enable debug mode
Set local file paths


Install dependencies:

bash   npm install  # or yarn install, pip install -r requirements.txt, etc.
Prepare for Production Push
When asked to "prepare for push" or "restore production settings":

Show protected files:

bash   git ls-files -v | grep '^S'

Temporarily unprotect config files:

bash   git update-index --no-skip-worktree .env
   git update-index --no-skip-worktree config/database.yml
   git update-index --no-skip-worktree config/settings.json

Restore production configs:

bash   cp .env.production .env 2>/dev/null || true
   cp config/database.yml.production config/database.yml 2>/dev/null || true
   cp config/settings.json.production config/settings.json 2>/dev/null || true

Check what will be committed:

bash   git status
   git diff --staged

Re-protect files after commit (if not pushing configs):

bash   git update-index --skip-worktree .env
   git update-index --skip-worktree config/database.yml
   git update-index --skip-worktree config/settings.json
Quick Commands

"switch to local": Apply local configurations without resetting from GitHub
"switch to production": Apply production configurations without committing
"show config status": Display which configuration is currently active
"list protected files": Show files marked with skip-worktree

Configuration Files to Manage
Identify and manage these common config files based on the project type:

.env, .env.local, .env.production
config/database.yml, config/database.json
config/settings.json, config/config.json
src/config.js, src/config.ts
appsettings.json, appsettings.Development.json
application.properties, application-local.properties
wp-config.php (WordPress)
settings.py, settings_local.py (Django)

Important Notes

Never commit .env.local or *.local files
Production configs should remain in the repo but not contain secrets
Use environment variables for sensitive data
The skip-worktree flag prevents accidental commits of local changes
Always verify configs before pushing to production