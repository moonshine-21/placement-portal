# Self-hosted TURN server — OPTIONAL, advanced path only

> **Not needed by default.** The app's default TURN setup (see
> `api/turn-credentials.js`) uses Metered's free hosted TURN service — no
> card, no home network exposure, just a 20GB/month cap. Only come to this
> folder if you specifically want to remove that cap and are okay with the
> tradeoff described below. Most people should stop here and use Metered.

## Why this exists, and its real tradeoff

Every hosted TURN provider (Cloudflare, Twilio, Metered, etc.) meters usage,
because relaying video/audio costs them real bandwidth money. The only way
to remove that cap for free is to run the relay yourself — but that means
*your* machine becomes a fixed, public, always-on internet endpoint that
every call touches. If it's your home computer, that means your home IP and
network become discoverable to anyone who resolves the hostname — a real
privacy/security exposure, not a hypothetical one. If it's a cloud VPS, you
avoid exposing your home network specifically, but cloud providers require a
card for identity verification.

There is no option that is simultaneously unlimited, free, no-card, and
zero-exposure — pick which two or three matter most to you. This folder is
only useful if "unlimited" outweighs the exposure/card cost for your case.


This doc has two options:
- **Option A: your own computer at home** — genuinely zero cost, zero
  sign-up, zero card, anywhere, ever. Bounded only by your home internet's
  upload speed. Recommended if you don't want to hand any card to anyone.
- **Option B: a cloud VPS** (e.g. Oracle Cloud) — more reliable (stays on
  even when your PC is off, doesn't depend on your home internet), but every
  cloud provider, including free tiers, asks for a card for fraud
  verification. Included for reference in case that's ever acceptable to you.

---

## Option A: Host it on your own computer (no card, no sign-up)

You need: a computer that can stay switched on and connected to the internet
while calls happen (an old laptop or desktop works fine — it barely uses any
resources), and access to your home router's settings.

### 1. Install Docker on that computer
- Windows/Mac: install Docker Desktop (free): https://www.docker.com/products/docker-desktop/
- Linux: `sudo apt install docker.io docker-compose-plugin` (or your distro's equivalent)

### 2. Get a free dynamic DNS hostname
Most home internet connections don't have a fixed IP address, so you need a
hostname that automatically updates when your IP changes. This is free, no
card, no sign-up beyond an email:
1. Go to https://www.duckdns.org and sign in (GitHub/Google/etc — free).
2. Create a subdomain, e.g. `myportalcalls.duckdns.org`.
3. Install their tiny background updater (they give you a one-line script)
   so it keeps pointing at your current home IP automatically.

### 3. Forward ports on your router
Log into your router's admin page (usually `192.168.1.1` or `192.168.0.1`)
and forward these to the computer running Docker:
- UDP 3478 (TURN)
- TCP 3478 (TURN over TCP)
- TCP 5349 (TURN over TLS, optional)
- UDP 49152–65535 (the relay port range — this is where actual call media flows)

> ⚠️ Some ISPs (especially some mobile/rural broadband) use "CGNAT," which
> makes port forwarding impossible from your side. If forwarding doesn't
> seem to work no matter what you configure, that's likely why — in that
> case Option B (or a cheap $2–3/mo VPS, which is not free but is
> inexpensive and doesn't have this problem) becomes the practical fallback.

### 4. Run coturn
```bash
cd infra/coturn
```
Edit `turnserver.conf`:
- `static-auth-secret` → generate one: `openssl rand -hex 32`
- `realm` → your DuckDNS hostname, e.g. `myportalcalls.duckdns.org`
- `external-ip` → your home's current public IP (check at https://whatismyip.com).
  If it's wrong after your ISP rotates your IP, update this and restart —
  DuckDNS's hostname stays the same, but coturn's own `external-ip` line
  needs to match your actual current IP.

Then:
```bash
docker compose up -d
```
Leave that computer on and connected whenever people might make calls.

### 5. Point your app at it
In Vercel: **Project → Settings → Environment Variables**:
- `TURN_SERVER_HOST` = `myportalcalls.duckdns.org`
- `TURN_SHARED_SECRET` = the same secret from `turnserver.conf`

Redeploy. Done — zero cost, zero card, anywhere.

---

## Option B: Cloud VPS (Oracle Cloud Always Free)

More reliable than Option A (doesn't depend on your home PC/internet staying
up), but every cloud provider — Oracle included — asks for a card for
one-time identity/fraud verification, even on free tiers. Not charged as
long as you stay on free-tier resources, but a card is required to sign up.
Skip this section entirely if that's not acceptable — Option A above needs
no card at all.

1. Sign up at https://signup.oraclecloud.com.
2. Create an instance: **Compute → Instances → Create Instance**.
   - Shape: pick one of the "Always Free eligible" shapes (e.g. `VM.Standard.E2.1.Micro`).
   - Image: Ubuntu (22.04 or later).
   - Add your SSH key so you can log in.
3. Note the instance's **public IP address**.
4. Open these ports in Oracle's firewall (**Networking → Virtual Cloud
   Networks → your VCN → Security Lists → Default Security List → Add
   Ingress Rules**), and also in the OS firewall over SSH (`sudo ufw allow ...`):
   - UDP 3478 (TURN)
   - TCP 3478 (TURN over TCP)
   - TCP 5349 (TURN over TLS, optional)
   - UDP 49152–65535 (the relay port range)
5. SSH in and deploy:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin
   git clone <your repo> app && cd app/infra/coturn
   ```
   Edit `turnserver.conf` the same way as Option A step 4 (secret, realm,
   external-ip = the VPS's IP), then:
   ```bash
   docker compose up -d
   ```
6. Point your app at it — same two env vars as Option A step 5, just with
   the VPS's IP/domain instead of your DuckDNS hostname.

### Optional: add TLS
Some networks block plain TURN over UDP/TCP but allow TLS. If you have a
domain pointed at the VPS:
```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d turn.yourdomain.com
```
Copy the cert/key next to `docker-compose.yml`, uncomment the `cert`/`pkey`
lines in `turnserver.conf` and the matching volume mounts in
`docker-compose.yml`, then `docker compose restart`.

---

## Reality check

"Unlimited" here means "bounded only by your own hardware's bandwidth," not
literally infinite. A home internet connection's upload speed (Option A) or
a small free VM (Option B) both have real limits — just limits generous
enough that a college portal's actual call volume won't come close to them.
