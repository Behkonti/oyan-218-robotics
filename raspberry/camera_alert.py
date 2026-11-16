#!/usr/bin/env python3
# OYAN — Сақшы камерасы: газ, жоғары температура немесе өрт белгісі болғанда суретке түсіреді,
# Supabase-ке жібереді және AI талдауын сұрайды. main.py-ге тимейді: деректерді Supabase-тен оқиды.
#
# Іске қосу:   python3 camera_alert.py          (тұрақты жұмыс)
# Сынақ:       python3 camera_alert.py --test   (бірден 1 сурет түсіріп, жібереді)
import os, re, sys, time, shutil, subprocess, threading, collections, datetime, requests

HERE = os.path.dirname(os.path.abspath(__file__))
MAIN = open(os.path.join(HERE, "main.py"), encoding="utf-8").read()
URL = re.search(r'SUPABASE_URL\s*=\s*["\']([^"\']+)', MAIN).group(1).rstrip("/")
KEY = re.search(r'PUBLISHABLE_KEY\s*=\s*["\']([^"\']+)', MAIN).group(1)
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}

POLL = 2            # секунд сайын тексеру
COOLDOWN = 60       # екі сурет арасы кемінде 60 с
HIGH_TEMP = 35.0    # °C — сайттағы шекпен бірдей
FIRE_TEMP = 50.0    # °C — өрт белгісі
FIRE_RISE = 3.0     # °C / 60 с — температура тез көтерілсе, өрт белгісі

def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)

def camera_cmd():
    for c in ("rpicam-still", "libcamera-still"):
        if shutil.which(c):
            return c
    return None

def capture(path):
    cmd = camera_cmd()
    if not cmd:
        raise RuntimeError("rpicam-still / libcamera-still tabylmady")
    subprocess.run([cmd, "-n", "-t", "800", "--width", "1280", "--height", "960", "-q", "85", "-o", path],
                   check=True, capture_output=True, timeout=30)

def latest_row():
    r = requests.get(URL + "/rest/v1/sensor_data?select=created_at,temperature,humidity,gas_detected,ccs811_available,eco2"
                     "&order=created_at.desc&limit=1", headers=H, timeout=10)
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None

def latest_location():
    try:
        r = requests.get(URL + "/rest/v1/device_locations?select=latitude,longitude&order=created_at.desc&limit=1", headers=H, timeout=10)
        rows = r.json()
        return rows[0] if rows else {}
    except Exception:
        return {}

def send_alert(reasons, row):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = f"/tmp/alert-{stamp}.jpg"
    capture(path)
    remote = f"{stamp}-{'-'.join(reasons)}.jpg"
    with open(path, "rb") as f:
        r = requests.post(f"{URL}/storage/v1/object/alert-photos/{remote}", data=f,
                          headers={**H, "Content-Type": "image/jpeg"}, timeout=30)
    if not r.ok:
        raise RuntimeError(f"suret jiberilmedi {r.status_code}: {r.text[:200]}")
    loc = latest_location()
    body = {"reasons": reasons, "photo_path": remote,
            "temperature": row.get("temperature") if row else None,
            "humidity": row.get("humidity") if row else None,
            "eco2": row.get("eco2") if row and row.get("ccs811_available") else None,
            "gas_detected": row.get("gas_detected") if row else None,
            "latitude": loc.get("latitude"), "longitude": loc.get("longitude")}
    r = requests.post(URL + "/rest/v1/alerts", json=body,
                      headers={**H, "Content-Type": "application/json", "Prefer": "return=representation"}, timeout=15)
    if not r.ok:
        raise RuntimeError(f"eskertu jazylmady {r.status_code}: {r.text[:200]}")
    alert_id = r.json()[0]["id"]
    log("ESKERTU", alert_id, reasons, "suret:", remote)
    try: os.remove(path)
    except OSError: pass
    # AI талдауы фонда (негізгі цикл тоқтамасын)
    def analyze():
        try:
            a = requests.post(URL + "/functions/v1/analyze-alert", json={"id": alert_id}, headers=H, timeout=90)
            log("AI taldauy:", a.status_code, a.text[:160])
        except Exception as e:
            log("AI taldauy qatesi:", e)
    threading.Thread(target=analyze, daemon=True).start()
    return alert_id

def main():
    if "--test" in sys.argv:
        row = latest_row()
        aid = send_alert(["test"], row)
        time.sleep(25)   # AI талдауын күтеміз
        print("Dain. Alert id:", aid)
        return
    log("Bastadyq. Kamera:", camera_cmd() or "TABYLMADY")
    history = collections.deque(maxlen=120)   # (time, temperature)
    last_seen, last_alert = None, 0.0
    while True:
        try:
            row = latest_row()
            fresh = False
            if row:
                ts = datetime.datetime.fromisoformat(row["created_at"].replace("Z", "+00:00"))
                fresh = (datetime.datetime.now(datetime.timezone.utc) - ts).total_seconds() < 120  # ескі деректі елемейміз
            if row and fresh and row["created_at"] != last_seen:
                last_seen = row["created_at"]
                now = time.time()
                t = row.get("temperature")
                if t is not None:
                    history.append((now, float(t)))
                reasons = []
                if row.get("gas_detected") is True:
                    reasons.append("gas")
                if t is not None and float(t) > HIGH_TEMP:
                    reasons.append("high_temp")
                old = [v for (ts, v) in history if now - ts >= 50 and now - ts <= 90]
                if t is not None and (float(t) >= FIRE_TEMP or (old and float(t) - old[0] >= FIRE_RISE)):
                    reasons.append("fire_suspected")
                if reasons and now - last_alert >= COOLDOWN:
                    last_alert = now
                    send_alert(reasons, row)
        except Exception as e:
            log("QATE:", e)
        time.sleep(POLL)

if __name__ == "__main__":
    main()
