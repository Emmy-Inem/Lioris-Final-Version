# Custom SMTP & Email Deliverability Guide: Preventing Spam Flagging

## Why Recovery Emails Land in Spam

When using Supabase Auth's default email service:
1. **Shared Sender Domain**: Emails originate from `noreply@mail.app.supabase.io`, a shared domain used by thousands of free and test projects.
2. **Missing SPF & DKIM Alignment**: Because the email is not sent from your own domain, receiving mail servers (Google Workspace / Gmail, Microsoft 365 / Outlook, Yahoo Mail, and university campus mail systems) cannot verify domain ownership.
3. **Aggressive Anti-Phishing Filters**: "Password Reset" and "Recovery Code" emails containing authentication tokens or links triggered from unverified or shared senders are automatically routed to **Spam** or **Junk** folders.

---

## Solutions

### 1. In-App User Guidance (Already Implemented)
- The login "Forgot Password" modal and the `reset-password` screen now feature prominent notices advising users to check their **Spam / Junk** folder if an email does not appear in their inbox within 1–2 minutes, and to search for **Lioris** or **recovery code**.

---

### 2. Setting Up Custom SMTP in Supabase (Production Fix)

Configuring a dedicated Custom SMTP provider with proper DNS authentication ensures that 100% of password resets, sign-up confirmations, and magic links land directly in users' **Primary Inboxes**.

#### Recommended SMTP Providers
- **Resend** (Recommended: easy setup, generous free tier, stellar deliverability)
- **Brevo** (Formerly Sendinblue: 300 free emails/day, strong delivery in Nigeria & Africa)
- **Postmark** (Industry-leading transactional deliverability)
- **Amazon SES** (Lowest cost at high volume)

---

### Step-by-Step Setup (e.g. Using Resend or Brevo)

#### Step 1: Add & Verify Your Domain
1. Log in to your provider (e.g., [Resend](https://resend.com) or [Brevo](https://www.brevo.com)).
2. Go to **Domains** > **Add Domain** (e.g., `lioris.app` or `mail.lioris.app`).
3. Add the provided DNS records to your DNS host (Cloudflare, Namecheap, Route 53, etc.):
   - **SPF Record**:
     - Type: `TXT`
     - Name: `@` (or subdomain)
     - Value: `v=spf1 include:amazonses.com ~all` (or provider's SPF)
   - **DKIM Record**:
     - Type: `CNAME` or `TXT` (as provided by your SMTP service)
     - Value: Key provided by provider
   - **DMARC Record**:
     - Type: `TXT`
     - Name: `_dmarc`
     - Value: `v=DMARC1; p=none; rua=mailto:dmarc-reports@yourdomain.com`
4. Wait for DNS verification to turn green (usually 5–15 minutes).

#### Step 2: Configure Supabase Dashboard
1. Open your **Supabase Project Dashboard**.
2. Navigate to **Project Settings** (gear icon) > **Authentication** > **SMTP Settings** (or **Authentication** > **Emails**).
3. Toggle **Enable Custom SMTP** to **ON**.
4. Fill in your provider's credentials:
   - **Sender Email**: `noreply@yourdomain.com` (must match your verified domain)
   - **Sender Name**: `Lioris Campus`
   - **SMTP Host**: e.g., `smtp.resend.com` or `smtp-relay.brevo.com`
   - **SMTP Port**: `465` (SSL) or `587` (TLS)
   - **SMTP User**: e.g., `resend` or your account identifier
   - **SMTP Password**: Your generated API Key or SMTP password
5. Click **Save Changes**.

#### Step 3: Verify Deliverability
1. Under **Authentication** > **Email Templates** > **Reset Password**, confirm the template includes:
   ```html
   <h2>Reset Password</h2>
   <p>Follow this link to reset your password for Lioris:</p>
   <p><a href="{{ .ConfirmationURL }}">Reset Password</a></p>
   <p>Or enter this 6-digit recovery code in the app: <strong>{{ .Token }}</strong></p>
   ```
2. Trigger a test password reset from the Lioris login screen.
3. Check delivery in Gmail, Outlook, and a student university address.
4. Verify that the email arrives in the **Inbox** with a valid DKIM/SPF pass header (`Authentication-Results: spf=pass, dkim=pass`).
