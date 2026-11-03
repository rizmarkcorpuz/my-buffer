# My Buffer

A private iPhone money tracker built in React: bills, extra spending, work hours, cash runway. It replaces the Google Sheets budget. It installs to the iPhone Home Screen from Safari as a web app, with no App Store or Xcode needed. All data stays on the phone.

## 1. Put it on GitHub
1. Go to https://github.com/new and sign in as **rizmarkcorpuz**.
2. Name the repository `my-buffer`, set it to **Private**, and leave "Add README" unchecked. Click **Create repository**.
3. On the new repo page, click **uploading an existing file**. Drag in **everything inside this folder**, including `src`, `public`, `tests`, `package.json`, `vercel.json` and the rest. Don't drag in the outer folder itself. Click **Commit changes**.

   Alternatively, with git on a computer:
   ```bash
   cd my-buffer
   git remote add origin https://github.com/rizmarkcorpuz/my-buffer.git
   git push -u origin main
   ```

## 2. Deploy on Vercel
1. Go to https://vercel.com, choose **Continue with GitHub**, and sign in as rizmarkcorpuz.
2. Click **Add New → Project**, then **Import** `my-buffer`. If it isn't listed, click "Adjust GitHub App Permissions" and allow the repo.
3. Vercel detects **Vite**. Leave the defaults (build `npm run build`, output `dist`) and click **Deploy**.
4. You get a URL like `https://my-buffer-xxxx.vercel.app`. Every future push to `main` redeploys it automatically.

> Keep using the **same URL**. Data is stored per website address, so a different address starts empty.

## 3. Install on iPhone (17 Pro Max or any iPhone running iOS 16+)
1. Open the Vercel URL in **Safari**.
2. Tap **Share → Add to Home Screen → Add**.
3. Open **My Buffer** from the Home Screen. It runs full-screen, works offline, and supports light and dark mode.
4. Tap **Restore my backup** and choose `my-buffer-starter.json` (built from your spreadsheet) or a backup exported from the earlier My Buffer app.

## Backups
- **Settings (gear on Home) → Back up now** opens the share sheet. Choose **Save to Files → iCloud Drive**. Do this weekly. The Home screen reminds you after 7 days.
- **Restore from backup file** accepts backups from this app and from the earlier web and Xcode versions (v2).
- The app also mirrors data to the browser database and keeps 12 rolling automatic snapshots.
- Deleting the Home Screen app deletes its data, so export first.

## How the cash balance works
- **Update savings** sets the real amount in your accounts right now.
- After that, the balance updates automatically: bills marked **Paid**, obligations marked **Paid**, extra expenses and income received are subtracted or added.
- Anything recorded *before* your last savings update counts as history only, so nothing is counted twice. An entry can also be flagged "Already in my savings balance".
- Expected severance is never added to cash. It can only be included in the forecast, using the toggle.

## Develop
```bash
npm install
npm run dev     # http://localhost:5173, use --host to open from your phone on the same Wi-Fi
npm test        # calculation tests
npm run build
```

Privacy: the repository and deployed site contain **no personal financial data**. Your numbers live only in the starter file and on your phone. Keep `my-buffer-starter.json` and your backups out of the repo; `.gitignore` already excludes them.
