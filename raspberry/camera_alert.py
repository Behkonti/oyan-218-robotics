#!/usr/bin/env python3
# OYAN — Сақшы камерасы.
#  • Газ, жоғары температура немесе өрт белгісі болғанда: фото + 8 секундтық видео, AI талдауы.
#  • Админ-панельден (немесе админ Сақшыға айтқанда) «фото түсір» / «видео түсір» сұраныстары.
#  • Админ-панельдегі тікелей эфир: эфир қосулы тұрғанда секунд сайын бір кадр жібереді.
# main.py-ге тимейді: датчик деректерін Supabase-тен оқиды.
#
# Іске қосу:   python3 camera_alert.py          (тұрақты жұмыс)
# Сынақ:       python3 camera_alert.py --test   (бірден 1 сурет түсіріп, жібереді)
import os, re, io, sys, time, shutil, subprocess, threading, collections, datetime, requests

HERE = os.path.dirname(os.path.abspath(__file__))
MAIN = open(os.path.join(HERE, "main.py"), encoding="utf-8").read()
URL = re.search(r'SUPABASE_URL\s*=\s*["\']([^"\']+)', MAIN).group(1).rstrip("/")
KEY = re.search(r'PUBLISHABLE_KEY\s*=\s*["\']([^"\']+)', MAIN).group(1)
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}

POLL = 2            # секунд сайын тексеру
COOLDOWN = 60       # екі ескерту арасы кемінде 60 с
HIGH_TEMP = 35.0    # °C — сайттағы шекпен бірдей
FIRE_TEMP = 50.0    # °C — өрт белгісі
FIRE_RISE = 3.0     # °C / 60 с — температура тез көтерілсе, өрт белгісі
VIDEO_SEC = 8       # ескерту видеосының ұзақтығы
LIVE_FPS = 1.0      # тікелей эфир: секундына кадр

cam_lock = threading.Lock()   # камераны бір уақытта бір ғана нәрсе қолданады
live = {"on": False, "cam": None}

def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)

def now_utc():
    return datetime.datetime.now(datetime.timezone.utc)

def parse_ts(s):
    return datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))

def camera_cmd(kind="still"):
    for c in (f"rpicam-{kind}", f"libcamera-{kind}"):
        if shutil.which(c):
            return c
    return None

# ---------- Камера ----------
def stop_live_cam():
    cam = live["cam"]
    live["cam"] = None
    if cam:
        try:
            cam.stop(); cam.close()
        except Exception as e:
            log("Picamera2 жабу қатесі:", e)

def capture(path):
    with cam_lock:
        if live["cam"]:   # эфир жүріп жатса, сол камерадан кадр аламыз
            live["cam"].capture_file(path)
            return
        cmd = camera_cmd("still")
        if not cmd:
            raise RuntimeError("rpicam-still tabylmady")
        subprocess.run([cmd, "-n", "-t", "800", "--width", "1280", "--height", "960", "-q", "85", "-o", path],
                       check=True, capture_output=True, timeout=30)

def record_video(path, seconds=VIDEO_SEC):
    with cam_lock:
        stop_live_cam()   # видео кезінде эфир кідіреді, сосын өзі қайта қосылады
        cmd = camera_cmd("vid")
        if not cmd:
            raise RuntimeError("rpicam-vid tabylmady")
        subprocess.run([cmd, "-n", "-t", str(seconds * 1000), "--width", "1280", "--height", "720", "--framerate", "25",
                        "-b", "2500000", "--codec", "libav", "--libav-format", "mp4", "-o", path],
                       check=True, capture_output=True, timeout=seconds + 30)

# ---------- Supabase ----------
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

def pending_request():
    r = requests.get(URL + "/rest/v1/camera_requests?select=id,created_at,kind&done_at=is.null&order=created_at.asc&limit=1",
                     headers=H, timeout=10)
    if not r.ok:
        return None
    rows = r.json()
    return rows[0] if rows else None

def finish_request(rid, alert_id=None, error=None):
    requests.patch(URL + f"/rest/v1/camera_requests?id=eq.{rid}",
                   json={"done_at": now_utc().isoformat(), "alert_id": alert_id, "error": error},
                   headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"}, timeout=10)

def upload(bucket, name, data, ctype):
    r = requests.post(f"{URL}/storage/v1/object/{bucket}/{name}", data=data,
                      headers={**H, "Content-Type": ctype}, timeout=60)
    if not r.ok:
        raise RuntimeError(f"{name} jiberilmedi {r.status_code}: {r.text[:200]}")

def send_alert(reasons, row, video=False):
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    path = f"/tmp/alert-{stamp}.jpg"
    capture(path)
    remote = f"{stamp}-{'-'.join(reasons)}.jpg"
    with open(path, "rb") as f:
        upload("alert-photos", remote, f, "image/jpeg")
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

    def analyze():   # AI талдауы фонда, видео түсіріліп жатқанда да жүре береді
        try:
            a = requests.post(URL + "/functions/v1/analyze-alert", json={"id": alert_id}, headers=H, timeout=90)
            log("AI taldauy:", a.status_code, a.text[:160])
        except Exception as e:
            log("AI taldauy qatesi:", e)
    threading.Thread(target=analyze, daemon=True).start()

    if video:
        vpath = f"/tmp/alert-{stamp}.mp4"
        try:
            record_video(vpath)
            vremote = f"video/{stamp}-{'-'.join(reasons)}.mp4"
            with open(vpath, "rb") as f:
                upload("alert-public", vremote, f, "video/mp4")
            r = requests.patch(URL + f"/rest/v1/alerts?id=eq.{alert_id}", json={"video_path": vremote},
                               headers={**H, "Content-Type": "application/json", "Prefer": "return=minimal"}, timeout=15)
            log("VIDEO", alert_id, vremote, r.status_code)
        except Exception as e:
            log("Video qatesi:", e)
        finally:
            try: os.remove(vpath)
            except OSError: pass
    return alert_id

# ---------- Тікелей эфир ----------
def live_loop():
    last_check, active = 0.0, False
    while True:
        try:
            if time.time() - last_check >= 2:
                last_check = time.time()
                r = requests.get(URL + "/rest/v1/camera_live?select=until&id=eq.1", headers=H, timeout=10)
                rows = r.json() if r.ok else []
                until = rows[0]["until"] if rows and rows[0].get("until") else None
                active = bool(until) and parse_ts(until) > now_utc()
            if active:
                with cam_lock:
                    if not live["cam"]:
                        from picamera2 import Picamera2
                        cam = Picamera2()
                        cam.configure(cam.create_still_configuration(main={"size": (640, 480)}, buffer_count=2))
                        cam.start()
                        time.sleep(1)
                        live["cam"] = cam
                        log("EFIR qosyldy")
                    buf = io.BytesIO()
                    live["cam"].capture_file(buf, format="jpeg")
                upload("alert-photos", f"live/{int(time.time() * 1000)}.jpg", buf.getvalue(), "image/jpeg")
                time.sleep(max(0.1, 1.0 / LIVE_FPS - 0.3))
            else:
                if live["cam"]:
                    with cam_lock:
                        stop_live_cam()
                    log("EFIR toqtady")
                time.sleep(1)
        except Exception as e:
            log("EFIR qatesi:", e)
            with cam_lock:
                stop_live_cam()
            time.sleep(3)

# ---------- Негізгі цикл ----------
def main():
    if "--test" in sys.argv:
        row = latest_row()
        aid = send_alert(["test"], row)
        time.sleep(25)   # AI талдауын күтеміз
        print("Dain. Alert id:", aid)
        return
    log("Bastadyq. Kamera:", camera_cmd("still") or "TABYLMADY", "| video:", camera_cmd("vid") or "TABYLMADY")
    threading.Thread(target=live_loop, daemon=True).start()
    history = collections.deque(maxlen=120)   # (time, temperature)
    last_seen, last_alert = None, 0.0
    while True:
        try:
            row = latest_row()
            req = pending_request()
            if req:
                if (now_utc() - parse_ts(req["created_at"])).total_seconds() > 120:
                    finish_request(req["id"], error="expired")
                else:
                    kind = req.get("kind") or "photo"
                    log("Suranys", req["id"], kind)
                    try:
                        finish_request(req["id"], alert_id=send_alert(["manual"], row, video=(kind == "video")))
                    except Exception as e:
                        finish_request(req["id"], error=str(e)[:200])
            fresh = False
            if row:
                fresh = (now_utc() - parse_ts(row["created_at"])).total_seconds() < 120  # ескі деректі елемейміз
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
                    send_alert(reasons, row, video=True)
        except Exception as e:
            log("QATE:", e)
        time.sleep(POLL)

if __name__ == "__main__":
    main()
