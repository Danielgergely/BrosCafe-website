"""Read-only client for the Fruitsys back office (cloud.fruitsys.hu).

Fruitsys has no API, so this does what its own report pages do: log in with
the form, then call the two JSON endpoints those pages call. Nothing here ever
posts to a page that changes data — the only POSTs are the login form and the
workday list query, which is itself a read.

Use the read-only user (broscafe.readonly), not the main back-office login:
the password lives on the server.

Figures are gross (VAT included), which is what the till shows. What Fruitsys
returns is data from outside, so every number is parsed defensively.
"""
import json
import re

import httpx

BASE = "https://cloud.fruitsys.hu/raktar/"
RESTAURANT_ID = 1


class FruitsysError(RuntimeError):
    pass


def _number(value) -> int:
    try:
        return round(float(value or 0))
    except (TypeError, ValueError):
        return 0


class Fruitsys:
    def __init__(self, user: str, password: str):
        self.user, self.password = user, password
        self.http = httpx.AsyncClient(base_url=BASE, timeout=20, follow_redirects=True)

    async def __aenter__(self):
        await self.login()
        return self

    async def __aexit__(self, *exc):
        await self.http.aclose()

    async def login(self) -> None:
        await self.http.get("index.php")  # session cookie
        response = await self.http.post("index.php", data={
            "user_name": self.user, "user_password": self.password, "login": "Bejelentkezés"})
        # A failed login answers 200 with the login form again.
        if 'name="user_password"' in response.text:
            raise FruitsysError("Fruitsys login failed — check FRUITSYS_USER / FRUITSYS_PASSWORD")

    async def workdays(self, year: int, month: int) -> list[dict]:
        """The workdays opened in a month: [{"id", "opened_at"}], newest first."""
        response = await self.http.post("munkanapvalasztas_munkanapfeltolt.php", data={
            "etteid": RESTAURANT_ID, "irany": 0, "ev": year, "honap": month})
        response.raise_for_status()
        days = response.json().get("munkanapok") or []
        return [{"id": str(d["munkanapid"]), "opened_at": str(d["nyitas_ido"])}
                for d in days if d.get("munkanapid") and d.get("nyitas_ido")]

    async def hourly(self, workday_id: str) -> dict[int, int]:
        """Takings per clock hour for one workday, open or closed: {7: 4850, …}."""
        response = await self.http.get("forgalom_ido_master.php", params={
            "idoszak": f"-1,{workday_id}", "munka_kezd": "", "munka_veg": "",
            "gepszuro": -1, "pincerszuro": -1, "pultszuro": -1,
            "etteremid": RESTAURANT_ID, "tipus": 1, "pageIndex": 1, "size": 50,
            "order": "[]", "filter": "{}"})
        response.raise_for_status()
        hours = {}
        for row in response.json().get("data") or []:
            hour, amount = _number(row.get("ora")), _number(row.get("ar"))
            if 0 <= hour <= 23 and amount:
                hours[hour] = amount
        return hours

    async def receipts(self, workday_id: str) -> dict:
        """Receipts for one workday: {"count", "gross", "net"}.

        The daily turnover report writes its summary straight into the page
        rather than loading it, so this posts the report's own query form —
        a read, like the page's Lekérdezés button — and reads the embedded
        table.
        """
        response = await self.http.post("stat_forgalom.php", data={
            "workday1": workday_id, "workday2": workday_id, "idoszakkuld": "-1",
            "mnvalasztegyeb": "", "tipus": "", "asztal": "", "munkanaponk": ""})
        response.raise_for_status()
        match = re.search(r"var griddata = (\[.*?\]);", response.text)
        rows = json.loads(match.group(1)) if match else []
        return {
            "count": sum(_number(r.get("nysz")) for r in rows if isinstance(r, dict)),
            "gross": sum(_number(r.get("szamla_vegosszeg")) for r in rows if isinstance(r, dict)),
            "net": sum(_number(r.get("netto")) for r in rows if isinstance(r, dict)),
        }

    async def products(self, workday_id: str) -> list[dict]:
        """What sold on one workday: [{"name", "count", "gross"}]."""
        response = await self.http.post("stat_termek_master.php", data={
            "etteremid": RESTAURANT_ID, "etteremvalaszttipus": 0, "valasztottettermek": "[]",
            "idoszak": f"-1,{workday_id}", "time1": "", "time2": "", "munkakezd": "", "munkaveg": "",
            "counter": 0, "waiter": 0, "gep": 0, "aktarak": 0, "aktusertipus": 2, "szemelyzet": 0})
        response.raise_for_status()
        rows = (response.json().get("data") or {}).get("data") or []
        return [{"name": str(row.get("nev") or "").strip(), "count": _number(row.get("darab")),
                 "gross": _number(row.get("teljesar"))}
                for row in rows if isinstance(row, dict) and row.get("nev")]
