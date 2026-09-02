# VPS árajánlat-kérés / VPS quote request

Send the Hungarian version to Hungarian providers (RackForest, Tárhely.Eu,
DotRoll). The English version is there in case you also want to compare a
non-Hungarian host.

Replace `[NÉV]` / `[NAME]` before sending.

---

## Magyar (elsődleges)

**Tárgy:** Árajánlat-kérés — VPS szerver (2 vCPU / 4 GB RAM), Bros Cafe

Kedves Kollégák!

A Bros Cafe nevében keresem Önöket. Egy budapesti kávézót indítunk, és a
weboldalunkat, valamint a hozzá tartozó hűségprogramot szeretnénk saját VPS-en
üzemeltetni. Ehhez kérnék árajánlatot.

**Amire szükségünk van:**

| | |
|---|---|
| CPU | 2 vCPU |
| Memória | 4 GB RAM |
| Tárhely | 40 GB SSD vagy NVMe |
| Operációs rendszer | Ubuntu 24.04 LTS, tiszta telepítés (vezérlőpanel nélkül) |
| Hozzáférés | root SSH |
| IP | 1 db fix IPv4 |
| Adatközpont | Magyarország |

Az alkalmazást Dockerben futtatjuk, ezért a root hozzáférés és a tiszta
Ubuntu telepítés fontos — cPanel vagy más vezérlőpanel nem szükséges.

**Néhány kérdés az ajánlathoz:**

1. Mennyi a havi díj **bruttó** (ÁFA-val együtt), és van-e éves előrefizetési
   kedvezmény?
2. Tartalmaz-e az ár **automatikus mentést vagy snapshotot**? Ha igen, milyen
   gyakorisággal és mennyi ideig tartja meg? Ha nem, mennyibe kerül külön?
3. Mennyi a **kiépítés ideje** a megrendelés után?
4. Van-e **korlátozás a hálózati forgalomra**, és mekkora a kimenő sávszélesség?
5. Későbbi **bővítés** (több RAM vagy CPU) leállás nélkül megoldható?
6. Milyen **támogatási elérhetőséget** biztosítanak (nyitvatartás,
   válaszidő)?
7. Van-e **próbaidőszak vagy pénzvisszafizetési garancia**?

Előre is köszönöm a segítséget, és várom az ajánlatukat.

Üdvözlettel,
[NÉV]
Bros Cafe
[TELEFONSZÁM]
hello@broscafe.hu

---

## English (backup)

**Subject:** Quote request — VPS (2 vCPU / 4 GB RAM), Bros Cafe

Hello,

I'm getting in touch on behalf of Bros Cafe. We're opening a café in Budapest
and want to host our website and loyalty programme on our own VPS. I'd like a
quote.

**What we need:**

| | |
|---|---|
| CPU | 2 vCPU |
| Memory | 4 GB RAM |
| Storage | 40 GB SSD or NVMe |
| OS | Ubuntu 24.04 LTS, clean install (no control panel) |
| Access | root SSH |
| IP | 1 × static IPv4 |
| Location | Hungary |

We run the application in Docker, so root access and a clean Ubuntu install
matter — we don't need cPanel or any other control panel.

**A few questions:**

1. What's the monthly price **including VAT**, and is there a discount for
   paying annually?
2. Does the price include **automated backups or snapshots**? If so, how often
   and how long are they retained? If not, what do they cost separately?
3. How long does **provisioning** take after ordering?
4. Is there a **traffic cap**, and what's the outbound bandwidth?
5. Can the plan be **scaled up** later (more RAM or CPU) without downtime?
6. What **support hours and response times** do you offer?
7. Is there a **trial period or money-back guarantee**?

Thanks in advance — I look forward to your quote.

Best regards,
[NAME]
Bros Cafe
[PHONE]
hello@broscafe.hu

---

## Comparing the replies

Watch for these when the quotes come back:

- **Gross vs net.** Hungarian providers usually quote *+ ÁFA*. 27 % on top —
  compare gross to gross or the cheapest-looking quote may not be.
- **Backups.** If they're not included, add the cost. The loyalty database is
  the programme; losing it loses every member's stamps.
- **"Managed" VPS.** Cheaper-sounding managed plans sometimes mean no root, or
  a mandatory control panel. Both are unusable here — ask explicitly.
- **Traffic caps.** Unlikely to bite a café website, but a hard cap with
  overage billing is worth knowing about.
