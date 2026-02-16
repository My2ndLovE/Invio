<p align="center">
  <img src="https://raw.githubusercontent.com/kittendevv/Invio/refs/heads/main/assets/banner-default.png" alt="Invio" width="100%" />
</p>
<p align="center"><b>Self-hosted invoicing without the bloat. Fast, transparent, and fully yours.</b></p>
<p align="center">
  <a href="https://demo.invio.dev">Live Demo</a> •
  <a href="https://github.com/kittendevv/Invio/wiki">Documentation</a> •
  <a href="https://ko-fi.com/codingkitten">Support</a>
</p>
<p align="center">
  <a href="https://www.producthunt.com/products/invio-2?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-invio&#0045;2" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1025437&theme=dark&t=1760267997318" alt="Invio - Self&#0045;Hosted&#0032;invoicing&#0032;without&#0032;the&#0032;bloat | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
  <a href="https://ko-fi.com/codingkitten" target="_blank"><img src="https://storage.ko-fi.com/cdn/brandasset/v2/support_me_on_kofi_dark.png" alt="Support Me" style="width: 250px; height: 54px;" width="250" height="54" /></a>
</p>
<p align="center">
  <img src="https://hackatime-badge.hackclub.com/U080TNHKK32/Invio" alt="Hacktime Badge" style="height: 30px;" height="30">
</p>

## 🌟 Why Invio?

- Built for doing, not configuring — create an invoice, send a link, get paid. No CRMs, projects, or bloat getting in your way.
- You really own it — self‑hosted by default. Your data lives where you put it, and exporting is always an option.
- Fast & dependable — Deno + Fresh on the frontend and Hono + SQLite on the backend keep things simple and quick.
- Client‑friendly — share a secure public link—no accounts or passwords required to view invoices.
- Secure by default — built-in security headers, JWT authentication, and rate limiting to protect your instance.

## 🔐 Security Features

Invio includes several security features out of the box:

- **Rate Limiting** — Protects the login endpoint against brute-force attacks (by IP, username, and combination)
- **Security Headers** — X-Content-Type-Options, X-Frame-Options, CSP, and more
- **JWT Authentication** — Secure session management with configurable TTL
- **HSTS Support** — Optional Strict-Transport-Security headers for HTTPS deployments

### Rate Limiting Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `RATE_LIMIT_MAX_ATTEMPTS` | `5` | Max failed attempts before blocking |
| `RATE_LIMIT_WINDOW_SECONDS` | `900` | Time window (15 minutes) |
| `RATE_LIMIT_TRUST_PROXY` | `false` | Trust X-Forwarded-For header |

Rate limiting tracks failed attempts by:
- **IP address** — Blocks an IP after too many failed attempts on any account
- **Username** — Blocks a username after too many failed attempts from any IP (distributed attack protection)
- **IP + Username** — Blocks specific combinations

### Reverse Proxy Configuration

When running Invio behind a reverse proxy, set `RATE_LIMIT_TRUST_PROXY=true` and configure your proxy to forward the client IP:

<details>
<summary><b>nginx</b></summary>

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```
</details>

<details>
<summary><b>Apache</b></summary>

```apache
<VirtualHost *:443>
    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
    RequestHeader set X-Forwarded-For "%{REMOTE_ADDR}s"
    RequestHeader set X-Forwarded-Proto "https"
</VirtualHost>
```

Requires: `mod_proxy`, `mod_proxy_http`, `mod_headers`
</details>

<details>
<summary><b>Caddy</b></summary>

```caddyfile
invio.example.com {
    reverse_proxy localhost:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

Note: Caddy automatically sets `X-Forwarded-For` by default.
</details>

See [`.env.example`](.env.example) for all configuration options.

## 🖼️ Screenshots
<details>
<summary>Dashboard</summary>
  
<img src="https://cdn.hackclub.com/019c2a41-c03a-7dc0-be72-df477fdb13e1/screenshot_2026-02-04_210324.png" alt="Invio Dashboard" width="100%" />
  
</details>

<details>
<summary>Invoice Creation</summary>
  
<img src="https://cdn.hackclub.com/019c2a43-426b-7edd-943b-f0f807897527/screenshot_2026-02-04_210545.png" alt="Invio Dashboard" width="100%" />
  
</details>

<details>
<summary>Settings</summary>
  
<img src="https://cdn.hackclub.com/019c2a49-aed5-7242-994e-900eebc628ed/Screenshot%202026-02-04%20211257.png" alt="Invio Dashboard" width="100%" />
  
</details>

<details>
<summary>Invoices</summary>
  
<img src="https://cdn.hackclub.com/019c2573-a8ee-7fe4-bba1-2824ed37430d/5ac9f89da2a86332583027f70630bb772f652836_invoices.png" alt="Invio Dashboard" width="100%" />
  
</details>

## 💖 Contributors

Invio is made possible by your contributions!

<a href="https://github.com/kittendevv/Invio/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=kittendevv/Invio" />
</a>

## 🤝 Contributing

- Found a bug or have an idea? Open an issue.
- Want to add a feature or fix something? Fork and submit a PR.
- All experience levels welcome — we’re excited to build with you.

## ☕ Support me

If you like Invio and want to support development:
- Buy me a coffee: https://ko-fi.com/codingkitten


---
Made with 💖 by <a href="https://github.com/kittendevv">kittendevv</a> and contributors — if you find this useful, please ⭐️ the repo!
