# Serving the console over HTTPS

The console listens on plain HTTP. Sign-in passwords, session cookies and API tokens cross the network in clear text unless a reverse proxy in front terminates TLS. Put one in front before anyone reaches the console over a network you do not fully trust. This page uses [Caddy](https://caddyserver.com/); an nginx equivalent follows.

The compose file starts no proxy: it needs your domain and certificate. The database port is not published, and the app port is yours to restrict, as below.

## 1. Publish the app to the proxy only

By default the app port answers on every interface. Bind it to the loopback address, so only the proxy on the same host reaches it. In `.env`:

```bash
BIND_ADDRESS=127.0.0.1
```

A proxy in another container joins the Compose network instead and reaches `app:3000`; then drop the `ports:` entry from `docker-compose.yml`.

## 2. Point `AUTH_URL` at the HTTPS address

```bash
AUTH_URL=https://heretix.example.com
```

With an `https://` address the session cookie is marked `Secure`, so a browser never sends it over HTTP. Restart after changing it (`docker compose up -d`).

## 3. Caddy

```caddyfile
heretix.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

Caddy gets and renews the certificate by itself (the name must resolve to the host and ports 80 and 443 must be open). It sets `X-Forwarded-For`, `X-Forwarded-Proto` and `Host`, and discards any `X-Forwarded-*` a client sent.

Without a public name, `tls internal` makes Caddy sign with its own CA; install that CA's root certificate in the browsers that use the console.

### HSTS

Once the certificate is trusted by the browsers, tell them to use HTTPS only:

```caddyfile
	header Strict-Transport-Security "max-age=31536000"
```

The console does not send this header itself. A browser that has seen it refuses the "continue anyway" click-through on a certificate warning, so do not add it while the certificate is self-signed or untrusted. Start with a short `max-age` (`300`) to check, then raise it.

## nginx

```nginx
server {
    listen 443 ssl;
    server_name heretix.example.com;
    ssl_certificate     /etc/ssl/heretix.example.com.crt;
    ssl_certificate_key /etc/ssl/heretix.example.com.key;

    # SBOM, CSV and VEX uploads: keep this at or above MAX_IMPORT_BODY_MB
    # (50 by default). nginx refuses anything over 1 MB otherwise.
    client_max_body_size 64m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        # add_header Strict-Transport-Security "max-age=31536000" always;
    }
}

server {
    listen 80;
    server_name heretix.example.com;
    return 301 https://$host$request_uri;
}
```

`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` appends the client's address, which is the entry the console uses (see below). Do not replace it with a value the client controls.

## How the console reads the client address

The sign-in limit (per address and per email) and the audit log take the address from the **last** entry of `X-Forwarded-For`, the one the proxy appended. Earlier entries are whatever the client sent. Without a proxy the client can send the header itself and pick its own address, so the limit only holds behind one.

## Other things to set

- `POSTGRES_PASSWORD`: the compose file falls back to `changeme` when it is unset. Set a long random value in `.env` before the first start. It is applied only when the database volume is created: to change it later, `ALTER USER postgres PASSWORD '...'` in the database as well as in `.env`.
- Keep port 5432 closed: the compose file does not publish it, so leave it that way.
- The first admin: leave `SEED_PASSWORD` unset to have one generated and printed once, and change `SEED_EMAIL` from `admin@example.com`.
