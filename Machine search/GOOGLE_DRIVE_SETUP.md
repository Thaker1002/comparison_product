# Google Drive OAuth Setup Guide

Follow these steps to connect MultiSearch to your Google Drive.

---

## Step 1 — Create a Google Cloud Project

1. Open your browser and go to: https://console.cloud.google.com/
2. Sign in with the Google account whose Drive you want to search.
3. Click the project selector at the top (it may say "Select a project" or show your current project name).
4. Click **New Project**.
5. Give it a name, e.g. `MultiSearch`, then click **Create**.
6. Wait a few seconds for it to be created, then select it from the project dropdown.

---

## Step 2 — Enable the Google Drive API

1. In the left sidebar, go to **APIs & Services → Library**.
2. In the search box, type `Google Drive API`.
3. Click the **Google Drive API** result.
4. Click **Enable**.

---

## Step 3 — Configure the OAuth Consent Screen

1. In the left sidebar, go to **APIs & Services → OAuth consent screen**.
2. Select **External** (so any Google account can authorize), then click **Create**.
3. Fill in the required fields:
   - **App name**: `MultiSearch` (or anything you like)
   - **User support email**: your email address
   - **Developer contact information**: your email address
4. Click **Save and Continue** through the next screens (Scopes, Test users) — you can leave them at defaults for now.
5. On the **Test users** screen, click **+ Add users** and add your own Google email address. This is required while the app is in "testing" mode.
6. Click **Save and Continue**, then **Back to Dashboard**.

---

## Step 4 — Create OAuth 2.0 Credentials

1. In the left sidebar, go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials** at the top.
3. Select **OAuth client ID**.
4. For **Application type**, choose **Desktop app**.
5. Give it a name, e.g. `MultiSearch Desktop`.
6. Click **Create**.
7. A dialog will show your Client ID and Client Secret. Click **Download JSON**.
8. The downloaded file will have a long name like `client_secret_xxxx.json`.

---

## Step 5 — Place credentials.json in the Project Folder

1. Rename the downloaded file to exactly:

   ```
   credentials.json
   ```

2. Move or copy it into the root of the MultiSearch project folder:

   ```
   Machine search\credentials.json
   ```

   It should sit next to `app.py`, `config.py`, etc.

---

## Step 6 — Authenticate via the App UI

1. Start the app (if it is not already running):

   ```
   .venv\Scripts\python app.py
   ```

2. Open your browser to: http://localhost:5000

3. Click **Google Drive** in the top navigation bar.

4. In the modal that appears, click **Authenticate Google Drive**.

5. A browser window will open asking you to sign in with Google and grant read-only Drive access.

6. Sign in with the same Google account you added as a Test User in Step 3.

7. You may see a warning saying **"Google hasn't verified this app"** — click **Advanced → Go to MultiSearch (unsafe)**. This is normal for apps in testing mode.

8. Grant the requested permissions and click **Allow**.

9. The browser tab will close automatically. The app will show a green dot next to Google Drive confirming authentication.

---

## Step 7 — Verify

Back in the app, the Google Drive status dot in the header should turn green.

You can now upload a file or paste text and tick the **Google Drive** source to search your Drive.

---

## Token Caching

After the first successful login, a `token.json` file is created in the project folder. This file stores your access and refresh tokens so you do not need to re-authenticate every time you restart the app. Keep this file private — it gives read-only access to your Drive.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "credentials.json not found" | Make sure the file is named exactly `credentials.json` and is in the project root (next to `app.py`). |
| "Access blocked: MultiSearch has not completed the Google verification process" | Go to the OAuth consent screen → Test users and add your email address. |
| Browser does not open | The OAuth flow opens a local browser window on the same machine running the server. If you are on a remote server, use a different OAuth flow. |
| "Token has been expired or revoked" | Click **Revoke & Disconnect** in the Google Drive modal and re-authenticate. |
| Search returns 0 Drive results | Check that your Drive account has files that match the file type you uploaded. Also confirm authentication is successful (green dot in header). |
| `google-api-python-client` import error | Run: `.venv\Scripts\python -m pip install google-api-python-client google-auth google-auth-oauthlib` |

---

## Security Notes

- The app uses **read-only** scope (`drive.readonly`) — it cannot modify, delete, or upload any files to your Drive.
- `credentials.json` and `token.json` are stored locally on your machine only.
- Nothing is sent to any third-party server. All Drive API calls go directly from your machine to Google's servers.
- Add `credentials.json` and `token.json` to `.gitignore` if you ever push this project to a git repository.