# Google Calendar availability sync

TeamUP checks free/busy information from the signed-in user's **primary Google Calendar**. It does not read event titles, descriptions, guests, or locations. Sync covers future hourly blocks from 7 AM through 10 PM for the seven dates shown in the Availability calendar.

Google busy times are treated as a **constraint**, not as automatic availability. An empty calendar means “unknown,” not “free for the team.”

## Configure Google OAuth

1. In Google Cloud Console, enable the Google Calendar API and configure the Google Auth consent screen. While the OAuth app is in testing, add the Google accounts that will test it as test users.
2. Create an OAuth client with application type **Web application**.
3. Add each TeamUP site origin to **Authorized JavaScript origins**. For local development, add `http://localhost:5173`. Add the deployed site's origin too, without a path.
4. Set the resulting OAuth client ID as `GOOGLE_CALENDAR_CLIENT_ID`:
   - Local development: add `GOOGLE_CALENDAR_CLIENT_ID="your-client-id.apps.googleusercontent.com"` to the ignored `.dev.vars` file at the repository root.
   - Cloudflare: add `GOOGLE_CALENDAR_CLIENT_ID` as a Worker variable, then deploy the Worker.

This flow uses Google Identity Services in the browser, so it does not need a client secret. The requested `calendar.freebusy` scope only provides calendar availability. Google may require OAuth app verification before unrestricted public use of calendar data.

## Sync behavior

When the user clicks **Sync Google Calendar**, Google asks them to sign in and grant access if needed. TeamUP requests free/busy data for the primary calendar, then opens a confirmation step. Nothing is written until the user chooses:

- **Block busy hours** (default) — clears any of the user’s selected slots that overlap busy times for the displayed week. Open hours are **not** auto-selected. Those hours stay visible as a striped **Busy** overlay on My calendar for the rest of the session (never shown on Team overlap, which only displays shared free times).
- **Suggest open hours** — previews free hours on the grid so the user can edit, then **Apply** or **Discard**. Busy hours still appear as an overlay.
- **Cancel** — leaves the schedule unchanged.

Team overlap continues to use only hours each teammate has explicitly marked available.

The temporary Google access token is kept in memory for the request and is not stored by TeamUP.

Google references: [Calendar API free/busy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth), and [OAuth for web applications](https://developers.google.com/identity/protocols/oauth2/web-server).
