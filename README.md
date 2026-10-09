# Gridiron GM
Zero-dependency Node server: proxies ESPN's fantasy API (free, includes ESPN's own league-scored projections) and serves the web app from the same origin.

## Deploy on Coolify
1. Push this folder to a Git repo. In Coolify: New Resource -> Public/Private Repository -> Build Pack: **Dockerfile**, port **3000**.
2. Set environment variables (below), attach your domain, deploy.

| Variable | Required | Notes |
|---|---|---|
| `LEAGUE_ID` | no | defaults to 1211488374 |
| `ESPN_S2`, `SWID` | if league is private | espn.com (logged in) -> DevTools -> Application -> Cookies. Keep the braces in SWID. |
| `APP_PASSWORD` | recommended | enables HTTP Basic auth (any username) so your league data isn't public |
| `MY_TEAM_ID` | no | otherwise detected from SWID, or pick your team in the Data tab |
| `ANTHROPIC_API_KEY` | for AI Coach | console.anthropic.com; optional `ANTHROPIC_MODEL` (default claude-sonnet-5-5) |
| `SEASON`, `CACHE_SEC` | no | default current season, 300s cache |

Endpoints: `/api/health`, `/api/league` (add `?refresh=1` to bypass cache).
