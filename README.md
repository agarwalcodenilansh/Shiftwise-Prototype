# Shiftwell — Swap Rules Layer Prototype

A lightweight, zero-dependency product management prototype demonstrating an automated **"Swap Rules Layer"** for Shiftwell's multi-location workforce scheduling platform.

---

## 1. Product Context & Strategic Problem

Shiftwell sells shift-scheduling software to multi-location Indian enterprises (quick-service restaurants, retail chains, and private hospital networks). 

* **The Problem Today:** Every single shift swap request is routed directly to the Location Store Manager for manual approval. The rules are hardcoded, unstructured, and slow. 
* **The Business Impact:** Median swap turnaround time is ~24 hours. Frustrated frontline staff call out or miss shifts, store managers spend hundreds of hours on administrative triage, and clinical accounts face regulatory audits from expired nurse licenses.
* **The Evidence:** Data across 12 enterprise accounts reveals that **all accounts with a <45% 24-hour swap approval rate are either churning (Lost), At Risk, or on Watch**. Over **₹184 Lakh of Annual Recurring Revenue (ARR)** (45.1% of Shiftwell's ₹408L book) is up for renewal between October 2026 and January 2027.
* **The Solution:** A modular **Swap Rules Engine** that evaluates swap requests instantly against credentialing, role qualification, and overtime policies—auto-approving 65% of swaps in <1 second while escalating genuine risks.

---

## 2. Deliverables & Project Architecture

```
shiftwell-swap-rules/
├── index.html   # Standalone web app (inline CSS/JS, light/dark mode, mobile responsive)
├── rules.js     # Pure functional rules engine (evaluateSwap), single source of truth
├── tests.js     # Pure Node.js test suite with tabular PASS/FAIL output (27 assertions)
└── README.md    # Documentation, architecture, deployment guide, and assumptions
```

### Key Technical Characteristics
1. **Single Source of Truth:** `rules.js` contains the complete pure business evaluation logic (`evaluateSwap(swap, settings)`) and customer presets. Both the test suite (`tests.js`) and the browser application (`index.html`) run the identical engine with zero logic duplication.
2. **Zero Dependencies & Zero Build Step:** Runs on vanilla web standards and plain Node.js. No npm install, no bundlers, no external CDN calls or font requests.
3. **Double-Click Portable:** `index.html` opens directly from the file system (`file://` protocol) in any modern browser on macOS, Windows, Linux, iOS, and Android.
4. **Adaptive Aesthetics:** Full light and dark mode support with automatic system preference detection (`prefers-color-scheme`) and in-memory manual override.

---

## 3. Rules Engine Specification (`rules.js`)

### Function Signature
```javascript
evaluateSwap(swap, settings) -> { outcome, reason, checks, projectedHours, hoursLimit }
```

### Inputs
* **`swap`**:
  ```json
  {
    "customer": "CarePoint",
    "role": "Nurse",
    "trained": true,
    "hoursScheduled": 24,
    "shiftHours": 8,
    "shiftDate": "2026-11-10",
    "certificates": [
      { "name": "BLS", "expiry": "2027-03-31" },
      { "name": "Nursing Council", "expiry": "2027-03-31" }
    ]
  }
  ```
* **`settings`**:
  ```json
  {
    "autoApprove": true,
    "certCheck": true,
    "hoursLimit": 48,
    "overLimitAction": "manager"
  }
  ```

### Evaluation Pipeline & Rules
Every rule is evaluated every time to produce a complete audit checklist:

1. **Certificate Validation (when `certCheck` is true):**
   * Any certificate with `expiry < shiftDate` results in **`BLOCK`** (Reason: `"<name> expired on <date>"`).
   * A certificate expiring **on the shift date** is valid (`pass`).
   * A certificate expiring **within 30 days after the shift date** passes with status `warn` (Reason: `"<name> expires in N days"`).
   * Missing/empty certificate requirements pass cleanly.
2. **Role Training:**
   * `trained === false` results in **`MANAGER_REVIEW`** (Reason: `"Employee is not trained for <role>"`).
3. **Overtime & Weekly Hours:**
   * `projected = hoursScheduled + shiftHours`.
   * Exactly 48.0 hours is permitted.
   * If `projected > hoursLimit`:
     * If `overLimitAction === "escalate"`: results in **`ESCALATE_REGIONAL`**.
     * If `overLimitAction === "manager"`: results in **`MANAGER_REVIEW`**.
4. **Precedence Hierarchy:**
   $$\text{BLOCK} > \text{ESCALATE\_REGIONAL} > \text{MANAGER\_REVIEW} > \text{AUTO\_APPROVE}$$
5. **Auto-Approval Policy Override:**
   * If `settings.autoApprove === false`, any would-be `AUTO_APPROVE` becomes **`MANAGER_REVIEW`** with the reason:
     `"Auto-approval off (today's behaviour)"`.
   * `BLOCK` and `ESCALATE_REGIONAL` outcomes still apply.

### Customer Presets
| Customer Preset | Industry | certCheck | Over-Limit Action | Hours Limit | Default Swaps / Month |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **FreshBowl** | QSR / Food & Beverage | `OFF` | Route to Manager | 48h | 2,900 |
| **CarePoint** | Hospital / Healthcare | `ON` | Route to Manager | 48h | 310 |
| **UrbanMart** | Large-Format Retail | `OFF` | Escalate Regional | 48h | 3,100 |

---

## 4. How to Run

### Run the Automated Test Suite
From the project folder, run:
```bash
node tests.js
```
Expected output: A clean 27-row PASS/FAIL table verifying all 20 customer replay swaps, boundary conditions, precedence rules, and edge cases with exit code 0.

### Open the Prototype UI
* **Method 1 (Direct Double-Click):** Double-click `index.html` in your file explorer.
* **Method 2 (macOS Terminal):**
  ```bash
  open index.html
  ```
* **Method 3 (Local HTTP Server, Optional):**
  ```bash
  python3 -m http.server 8080
  # Open http://localhost:8080 in your browser
  ```

---

## 5. Walkthrough of the Prototype UI

### Tab 1: "Simulate a swap"
* **Interactive Parameters:** Customer preset selector, shift date picker, employee role, training toggle, scheduled weekly hours, shift length, and certification expiration dates.
* **Real-time Live Badges:**
  * 🟢 **Auto-Approve:** Instant turnaround (<1s).
  * 🟡 **Manager Review:** Routed to local store manager.
  * 🔴 **Block:** Hard compliance stop for expired qualifications.
  * 🔵 **Escalate Regional:** Routed to regional ops for overtime policy control.
* **Comparison Strip:** Side-by-side contrast of the manual status quo (~24h wait) vs automated rules layer.
* **Audit Checklist:** Color-coded pass/fail/warn verification across all 4 rule dimensions.

### Tab 2: "Replay 20 swaps"
* **Customer Sample Replay:** Evaluates 20 real-world swaps across FreshBowl (#1–8), CarePoint (#9–14), and UrbanMart (#15–20).
* **Baseline Result:** **13 of 20 swaps (65.0%) auto-approve instantly**, 4 route to store manager, 2 escalate regionally, and 1 clinical violation is hard-blocked.
* **Global Manual Switch:** Toggle the master auto-approval switch to simulate today's manual behavior where all 13 auto-approves revert to manager review.
* **Manager Hours Saved Calculator:**
  $$\text{Hours Saved/Month} = \text{Swaps/Month} \times \text{Auto-Approve Share} \times \frac{\text{Check Minutes}}{60}$$
  * FreshBowl: $2,900 \times 75.0\% \times 5 / 60 = 181.3\text{ hrs}$
  * CarePoint: $310 \times 66.7\% \times 5 / 60 = 17.2\text{ hrs}$
  * UrbanMart: $3,100 \times 50.0\% \times 5 / 60 = 129.2\text{ hrs}$
  * **Total Saved:** **~327.6 hours/month** across these three accounts.

### Tab 3: "Evidence & Roadmap"
* **Inline-SVG Velocity Chart:** Benchmarks 24-hour approval rates across 12 accounts with a 45% danger threshold line.
  * *Signal:* All 7 accounts under 45% are lost, at risk, or on watch.
* **Renewal ARR Pipeline Table:** Visualizes the ₹184 Lakh ARR (45.1% of company total) renewing through January 2027 (FitZone ₹22L, Brew & Co ₹18L, CarePoint ₹60L, FreshBowl ₹84L). Note highlights UrbanMart (₹110L ARR) renewing in August 2027.
* **Engineering Sprint Roadmap:** De-risked 6-sprint rollout plan (Sprint 1: Cert Block; Sprints 2–3: Swap Rules & Auto-Approval; Sprint 4: Overtime as a Rule; Sprints 5–6: Pilot Rollout & Buffer).

---

## 6. Assumptions Made

1. **Date Parsing Standard:** Calendar dates are compared using UTC midnight boundaries (`YYYY-MM-DD`) to avoid local timezone off-by-one shifts.
2. **Certification Expiry on Shift Date:** If a certificate expires on the shift date (`shiftDate === expiry`), it is considered legally valid for that shift.
3. **Overtime Strict Inequality:** Exactly 48.0 projected hours is allowed. Any value strictly greater than 48.0 (e.g., 48.5h) triggers the overtime policy rule.
4. **Auto-Approval Switch Semantics:** Toggling auto-approval off simulates the legacy manual workflow: swaps that would otherwise pass become `MANAGER_REVIEW` with the reason `"Auto-approval off (today's behaviour)"`. Explicit `BLOCK` and `ESCALATE_REGIONAL` decisions remain active.
5. **Business Savings Constants:** Default assumptions use 5 minutes per manual swap check and account-reported monthly volumes. All parameters are fully editable in the prototype UI.

---

## 7. How to Deploy as a Free Static Site

Because this project is built entirely on native HTML/CSS/JavaScript with no build steps or backend servers, it can be deployed to any static host in under 60 seconds:

### Option A: Netlify Drop (Fastest — No Account Required)
1. Navigate to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop the `shiftwell-swap-rules` folder onto the web page.
3. Netlify will instantly generate a live, publicly accessible URL (e.g., `https://shiftwell-swap-rules.netlify.app`).

### Option B: GitHub Pages
1. Initialize a git repository and commit the folder:
   ```bash
   cd shiftwell-swap-rules
   git init
   git add .
   git commit -m "feat: Shiftwell swap rules prototype"
   ```
2. Create a GitHub repository and push:
   ```bash
   git remote add origin https://github.com/<your-username>/shiftwell-swap-rules.git
   git branch -M main
   git push -u origin main
   ```
3. In GitHub, go to **Settings > Pages > Build and deployment > Source**, choose `Deploy from a branch`, select `main` / `root`, and save.
4. Your site will be live at `https://<your-username>.github.io/shiftwell-swap-rules/`.

### Option C: Vercel CLI
```bash
cd shiftwell-swap-rules
npx vercel --yes
```

---

## 8. Footer Notice
*Prototype with illustrative sample data. Not production software.*
