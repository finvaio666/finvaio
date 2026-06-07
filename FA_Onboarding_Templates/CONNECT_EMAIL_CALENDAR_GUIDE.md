# Connecting Your Email & Calendar to ARIA

This lets ARIA monitor your institution emails (insurers/fund houses) and show
your appointments. You connect your **own** account — it stays private to you.

---

## PART A — Admin (nothing to do!)

Our Google app is already set to **"In production"**, so:
- ✅ **No need to add test users** — FAs can connect directly.
- ✅ **No 7-day reconnect** — connecting once lasts long-term.
- The only limit is an OAuth user cap (~100 users lifetime) — plenty for Beta.

⚠️ Admin: do NOT click "Back to testing" in Google Auth Platform → Audience.
Staying "In production" is what keeps connections persistent.

(Up to ~100 users, FAs will still see a one-time "unverified app" warning when
connecting — see Part B. Full verification only removes that warning / lifts the
cap, and isn't needed for the Beta.)

---

## PART B — Each FA does this in ARIA

### Connect your email (Gmail or Outlook)
1. Log in to ARIA → **Settings** (gear icon) → **Email Hub** tab.
2. Click **Connect Gmail** (or **Connect Outlook**).
3. A Google/Microsoft login opens → **choose your work email** → continue.

### ⚠️ If you see "Google hasn't verified this app"
This is normal during our Beta. To continue:
1. Click **Advanced** (bottom-left of the warning).
2. Click **Go to ARIA (unsafe)**.
3. Review the permissions → click **Allow / Continue**.

(It says "unsafe" only because the app isn't publicly verified yet — your data
stays within your own ARIA workspace.)

### Connect your calendar
1. Settings → **Calendar** tab.
2. Click **Connect Google Calendar** (or **Outlook Calendar**).
3. Same login + allow steps as above.

✅ Done — your Email Hub and dashboard appointments will start populating.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Google hasn't verified this app" warning | Normal — click **Advanced → Go to ARIA → Allow**. |
| "Access blocked" / can't proceed at all | We may have hit the ~100-user cap, or sign-in was cancelled. Tell your admin. |
| No emails showing after connecting | Make sure your admin has added the relevant insurer/fund-house domains to the Institution Directory (Settings → Email Hub). |
| Wrong account connected | Settings → Email Hub → disconnect, then reconnect with the correct account. |

Questions? Ask your admin.
