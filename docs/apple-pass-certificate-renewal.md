# Renewing the Apple Wallet certificate

**Do this before 3 October 2027.**

When the certificate expires, every loyalty card already on a customer's phone
stops receiving stamp updates, and no new cards can be issued. Apple sends no
warning. Nothing else about the site is affected.

Renewing does **not** invalidate existing passes — you keep the same Pass Type
ID, so the cards people already have carry on working once the new certificate
is deployed.

## What you need

- The Apple Developer account (paid membership must be current — renew it first
  if it has lapsed)
- SSH access to the server, `root@92.119.123.141`
- Roughly 30 minutes

## Reference

| | |
|---|---|
| Pass Type ID | `pass.hu.broscafe.loyalty` |
| Team ID | `S6BT656CHX` |
| Apple Developer portal | https://developer.apple.com/account/resources/identifiers/list/passTypeId |
| Certificates list | https://developer.apple.com/account/resources/certificates/list |
| Apple WWDR intermediate | https://www.apple.com/certificateauthority/ |
| Certificates live on the server in | `/srv/broscafe/certs/` |
| Local working copies | `~/Documents/HungBros/website/wallet/apple/` |

## Steps

**1. Make a fresh signing request.** On the Mac, in the wallet folder:

```bash
cd ~/Documents/HungBros/website/wallet/apple
openssl genrsa -out ios-private-key-2027.pem 2048
chmod 600 ios-private-key-2027.pem
openssl req -new -key ios-private-key-2027.pem -out broscafe-pass-2027.csr \
  -subj "/emailAddress=admin@broscafe.hu/CN=Bros Cafe Pass Type ID/O=Bros Cafe/C=HU"
```

Keep the old key until the new certificate is live, in case you need to roll back.

**2. Get the new certificate.** In the Apple Developer portal, open
*Certificates, Identifiers & Profiles → Identifiers → Pass Type IDs →
`pass.hu.broscafe.loyalty`*, choose **Create Certificate**, upload
`broscafe-pass-2027.csr`, and download the resulting `pass.cer`.

**3. Convert it, and refresh Apple's intermediate.**

```bash
openssl x509 -inform DER -in pass.cer -out pass-2027.pem
curl -o AppleWWDRCAG4.cer https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr-2027.pem
```

The WWDR intermediate in use expires December 2030, so it probably does not need
replacing — but check, and if Apple has moved to a newer generation than G4, take
that one instead.

**4. Check the certificate and key actually match** before touching the server.
These two must print the same hash:

```bash
openssl x509 -in pass-2027.pem -noout -modulus | openssl md5
openssl rsa -in ios-private-key-2027.pem -noout -modulus | openssl md5
```

**5. Install them.**

```bash
scp pass-2027.pem root@92.119.123.141:/srv/broscafe/certs/pass.pem
scp ios-private-key-2027.pem root@92.119.123.141:/srv/broscafe/certs/ios-private-key.pem
scp wwdr-2027.pem root@92.119.123.141:/srv/broscafe/certs/wwdr.pem

ssh root@92.119.123.141 '
  cd /srv/broscafe/certs
  chown 10001:10001 pass.pem ios-private-key.pem wwdr.pem
  chmod 400 ios-private-key.pem
  chmod 444 pass.pem wwdr.pem
'
```

The ownership matters: the application runs as uid 10001 and cannot read files
owned by root.

**6. Redeploy** in Coolify (https://coolify.broscafe.hu) — a **Deploy**, not a
restart. The certificates are read at start-up.

**7. Confirm it worked.** Sign in at https://broscafe.hu/admin, open the Wallet
tab, and check that Apple still reports as configured. Then add a card to a real
iPhone and have someone scan it at `/staff` — if the stamp count changes on the
phone, both signing and push are working.

## If something goes wrong

The old files are still on your Mac. Copy the previous `pass.pem`,
`ios-private-key.pem` and `wwdr.pem` back to `/srv/broscafe/certs/`, fix the
ownership as above, and redeploy. Anything issued under the old certificate keeps
working until it actually expires.
