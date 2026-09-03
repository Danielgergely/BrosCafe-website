"""Apple Wallet (.pkpass) generation + signing for Bros Cafe loyalty passes.

Credentials come ONLY from environment/secrets — never hard-coded, never committed.
Supports either PEM strings (APPLE_CERTIFICATE + APPLE_PRIVATE_KEY) or a .p12 file path.
Signing is always server-side. Nothing here runs until credentials are configured.
"""
import io
import logging
import os
import json
import hashlib
import zipfile
import tempfile

from cryptography.hazmat.primitives.serialization import (
    Encoding, NoEncryption, PrivateFormat, load_pem_private_key, pkcs7, pkcs12,
)
from cryptography.hazmat.primitives import hashes
from cryptography import x509

from app.config import ASSETS_DIR

logger = logging.getLogger(__name__)

APNS_HOST = os.environ.get("APNS_HOST", "https://api.push.apple.com")


# ---------------------------------------------------------------- configuration
def _env(k):
    v = os.environ.get(k, "")
    return v.strip() if v else ""


def config_status() -> dict:
    team = _env("APPLE_TEAM_ID")
    pass_type = _env("APPLE_PASS_TYPE_ID")
    wwdr = _env("APPLE_WWDR_CERTIFICATE") or (
        os.path.exists(_env("APPLE_WWDR_CERT_PATH")) if _env("APPLE_WWDR_CERT_PATH") else False)
    p12 = _env("APPLE_PASS_CERT_P12_PATH") and os.path.exists(_env("APPLE_PASS_CERT_P12_PATH"))
    pem = bool(_env("APPLE_CERTIFICATE") and _env("APPLE_PRIVATE_KEY"))
    pem_files = bool(_env("APPLE_CERT_PEM_PATH") and os.path.exists(_env("APPLE_CERT_PEM_PATH"))
                     and _env("APPLE_KEY_PEM_PATH") and os.path.exists(_env("APPLE_KEY_PEM_PATH")))
    enabled = _env("APPLE_PASS_CONFIGURED").lower() == "true"
    missing = []
    if not enabled:
        missing.append('APPLE_PASS_CONFIGURED="true"')
    if not team:
        missing.append("APPLE_TEAM_ID")
    if not pass_type:
        missing.append("APPLE_PASS_TYPE_ID")
    if not (p12 or pem or pem_files):
        missing.append("APPLE_PRIVATE_KEY (or APPLE_KEY_PEM_PATH file, or a .p12)")
    if not wwdr:
        missing.append("APPLE_WWDR_CERTIFICATE (or APPLE_WWDR_CERT_PATH)")
    return {
        "enabled_flag": enabled, "team_id": bool(team), "pass_type_id": bool(pass_type),
        "signing_identity": bool(p12 or pem or pem_files), "wwdr": bool(wwdr),
        "configured": enabled and bool(team) and bool(pass_type) and bool(p12 or pem or pem_files) and bool(wwdr),
        "missing": missing,
    }


def is_configured() -> bool:
    return config_status()["configured"]


# ---------------------------------------------------------------- signing identity
def _load_identity():
    pem_cert, pem_key = _env("APPLE_CERTIFICATE"), _env("APPLE_PRIVATE_KEY")
    password = _env("APPLE_CERTIFICATE_PASSWORD") or _env("APPLE_PASS_CERT_PASSWORD")
    if pem_cert and pem_key:
        cert = x509.load_pem_x509_certificate(pem_cert.encode())
        key = load_pem_private_key(pem_key.encode(), password.encode() if password else None)
        return key, cert
    cert_path, key_path = _env("APPLE_CERT_PEM_PATH"), _env("APPLE_KEY_PEM_PATH")
    if cert_path and key_path:
        cert = x509.load_pem_x509_certificate(open(cert_path, "rb").read())
        key = load_pem_private_key(open(key_path, "rb").read(),
                                   password.encode() if password else None)
        return key, cert
    p12_path = _env("APPLE_PASS_CERT_P12_PATH")
    with open(p12_path, "rb") as f:
        key, cert, _ = pkcs12.load_key_and_certificates(
            f.read(), password.encode() if password else None)
    return key, cert


def _load_wwdr():
    pem = _env("APPLE_WWDR_CERTIFICATE")
    data = pem.encode() if pem else open(_env("APPLE_WWDR_CERT_PATH"), "rb").read()
    try:
        return x509.load_pem_x509_certificate(data)
    except ValueError:
        return x509.load_der_x509_certificate(data)


def _sign_manifest(manifest_bytes: bytes) -> bytes:
    key, cert = _load_identity()
    wwdr = _load_wwdr()
    builder = (pkcs7.PKCS7SignatureBuilder()
               .set_data(manifest_bytes)
               .add_signer(cert, key, hashes.SHA256())
               .add_certificate(wwdr))
    return builder.sign(Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature,
                                       pkcs7.PKCS7Options.Binary])


# ---------------------------------------------------------------- pass.json
PASS_STRINGS = {
    "en": {
        "desc": "Bros Cafe Loyalty Card", "club": "Loyalty Club", "member": "Member",
        "reward_label": "Reward", "reward_value": "\U0001F389 FREE COFFEE AVAILABLE",
        "reward_relevant": "Your free coffee is ready at Bros Cafe!",
        "coffees": "Coffees", "free_coffees": "Free coffees",
        "how_label": "How it works", "how_value": "Collect 10 stamps and your next coffee is free.",
        "status_label": "Status", "cafe_label": "Bros Cafe",
        "one_more": "One more coffee \u2192 FREE COFFEE",
        "many": "{n} coffees until your free coffee",
        "welcome": "Welcome to Bros Cafe \u2615",
    },
    "hu": {
        "desc": "Bros Cafe Hűségkártya", "club": "Hűségklub", "member": "Tag",
        "reward_label": "Jutalom", "reward_value": "\U0001F389 INGYEN KÁVÉ ELÉRHETŐ",
        "reward_relevant": "Az ingyen kávéd készen áll a Bros Cafenál!",
        "coffees": "Kávék", "free_coffees": "Ingyen kávék",
        "how_label": "Hogyan működik", "how_value": "Tíz pecsét, és a következő kávé a miénk.",
        "status_label": "Állapot", "cafe_label": "Bros Cafe",
        "one_more": "Még egy kávé \u2192 INGYEN KÁVÉ",
        "many": "Még {n} kávé az ingyen kávéig",
        "welcome": "Üdv a Bros Cafenál \u2615",
    },
}


def build_pass_dict(member, cafe, settings, serial, auth_token, barcode_msg, web_service_url, lang="en"):
    L = PASS_STRINGS.get(lang, PASS_STRINGS["en"])
    required = member.get("stamps_required", 10)
    stamps = member.get("stamps", 0)
    reward = member.get("reward_ready", False)
    dots = " ".join("\u2615" if i < stamps else "\u25CB" for i in range(required))

    if reward:
        secondary = [{"key": "progress", "label": L["reward_label"], "value": L["reward_value"]}]
        relevant = L["reward_relevant"]
    else:
        remaining = required - stamps
        relevant = L["one_more"] if remaining == 1 else L["many"].format(n=remaining)
        secondary = [{"key": "progress", "label": f"{stamps} / {required}", "value": dots}]

    pass_json = {
        "formatVersion": 1,
        "passTypeIdentifier": os.environ["APPLE_PASS_TYPE_ID"],
        "teamIdentifier": os.environ["APPLE_TEAM_ID"],
        "serialNumber": serial,
        "authenticationToken": auth_token,
        "webServiceURL": web_service_url,
        "organizationName": cafe.get("name", "Bros Cafe"),
        "description": L["desc"],
        "logoText": "Bros Cafe",
        "foregroundColor": "rgb(245, 240, 230)",
        "backgroundColor": "rgb(102, 115, 74)",
        "labelColor": "rgb(245, 240, 230)",
        "barcodes": [{
            "format": "PKBarcodeFormatQR",
            "message": barcode_msg,
            "messageEncoding": "iso-8859-1",
        }],
        "storeCard": {
            "headerFields": [{"key": "club", "label": "Bros Cafe", "value": L["club"]}],
            "primaryFields": [{"key": "member", "label": L["member"], "value": member.get("name", "")}],
            "secondaryFields": secondary,
            "auxiliaryFields": [
                {"key": "coffees", "label": L["coffees"], "value": str(member.get("total_coffees", 0))},
                {"key": "rewards", "label": L["free_coffees"], "value": str(member.get("rewards_redeemed", 0))},
            ],
            "backFields": [
                {"key": "how", "label": L["how_label"], "value": L["how_value"]},
                {"key": "status", "label": L["status_label"], "value": relevant},
                {"key": "cafe", "label": L["cafe_label"], "value": cafe.get("address", "")},
            ],
        },
    }

    lat, lng = settings.get("cafe_lat"), settings.get("cafe_lng")
    if lat is not None and lng is not None:
        pass_json["locations"] = [{
            "latitude": float(lat), "longitude": float(lng),
            "relevantText": L["welcome"],
        }]
    return pass_json


def _collect_assets():
    files = {}
    for name in ("icon.png", "icon@2x.png", "logo.png", "logo@2x.png"):
        p = ASSETS_DIR / name
        if p.exists():
            files[name] = p.read_bytes()
    return files


def build_pkpass(member, cafe, settings, serial, auth_token, barcode_msg, web_service_url, lang="en") -> bytes:
    pass_json = json.dumps(build_pass_dict(member, cafe, settings, serial, auth_token,
                                           barcode_msg, web_service_url, lang)).encode("utf-8")
    files = {"pass.json": pass_json}
    files.update(_collect_assets())
    manifest = {name: hashlib.sha1(data).hexdigest() for name, data in files.items()}
    manifest_bytes = json.dumps(manifest).encode("utf-8")
    signature = _sign_manifest(manifest_bytes)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files.items():
            z.writestr(name, data)
        z.writestr("manifest.json", manifest_bytes)
        z.writestr("signature", signature)
    buf.seek(0)
    return buf.getvalue()


# ---------------------------------------------------------------- APNs push (best-effort)
def _apns_identity():
    """Return (cert_path, key_path, temporary) for APNs mutual TLS, or (None, None, False).

    Handles all three credential shapes config_status() accepts — inline PEM strings,
    on-disk PEM files and a .p12 bundle — because the deployed setup uses files, not
    env strings, and the inline-only version silently sent zero pushes.
    """
    pem_cert, pem_key = _env("APPLE_CERTIFICATE"), _env("APPLE_PRIVATE_KEY")
    if pem_cert and pem_key:
        return _temp_pem(pem_cert.encode()), _temp_pem(pem_key.encode()), True

    cert_path, key_path = _env("APPLE_CERT_PEM_PATH"), _env("APPLE_KEY_PEM_PATH")
    if cert_path and key_path and os.path.exists(cert_path) and os.path.exists(key_path):
        return cert_path, key_path, False

    if _env("APPLE_PASS_CERT_P12_PATH"):
        key, cert = _load_identity()
        password = _env("APPLE_CERTIFICATE_PASSWORD") or _env("APPLE_PASS_CERT_PASSWORD")
        del password  # the extracted key is written unencrypted to a short-lived temp file
        return (
            _temp_pem(cert.public_bytes(Encoding.PEM)),
            _temp_pem(key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())),
            True,
        )
    return None, None, False


def _temp_pem(data: bytes) -> str:
    handle = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
    handle.write(data)
    handle.close()
    return handle.name


async def push_to_devices(push_tokens):
    """Send empty Wallet update pushes via APNs. No-op if unconfigured. Returns count sent."""
    if not is_configured() or not push_tokens:
        return 0

    import httpx

    cert_path, key_path, temporary = _apns_identity()
    if not cert_path:
        logger.warning("APNs push skipped: no usable signing identity")
        return 0

    topic = os.environ["APPLE_PASS_TYPE_ID"]
    sent = 0
    try:
        async with httpx.AsyncClient(http2=True, cert=(cert_path, key_path), timeout=15) as client:
            for token in push_tokens:
                try:
                    response = await client.post(
                        f"{APNS_HOST}/3/device/{token}",
                        headers={"apns-topic": topic}, json={})
                    if response.status_code == 200:
                        sent += 1
                    else:
                        logger.warning("APNs rejected %s: %s %s",
                                       token[:8], response.status_code, response.text[:200])
                except Exception as exc:
                    logger.warning("APNs push to %s failed: %s", token[:8], exc)
    except ImportError as exc:
        # httpx raises this when http2=True but the h2 package is absent.
        raise RuntimeError(
            "Apple Wallet push needs HTTP/2 support — install the 'h2' package"
        ) from exc
    finally:
        if temporary:
            for path in (cert_path, key_path):
                try:
                    os.unlink(path)
                except OSError:
                    pass
    return sent
