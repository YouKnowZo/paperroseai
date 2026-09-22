"""Regression test for the key-store race that ate a saved key.

The original bug: Flask threads ran overlapping read-modify-write cycles on
keys.json, a reader caught a half-written file, _read() swallowed the JSON
error and returned {}, and the next write clobbered real data. The settings
modal triggered it in practice by auto-checking keys while the user was saving
one.

Run from backend/: venv/Scripts/python.exe -X utf8 ../scratch/test_keys_concurrency.py
"""

import glob
import json
import os
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "backend"))
KEYS = os.path.join(HERE, "concurrency_keys.json")
os.environ["PAPERROSE_KEYS_PATH"] = KEYS

import keys_store as ks  # noqa: E402

GOOD = "sk-test-good-key-123456"
GEM = "sk-test-gemini-key-123456"

for stale in glob.glob(KEYS + "*"):
    os.remove(stale)

passes, failures = [], []


def check(label, ok, detail=""):
    (passes if ok else failures).append(label)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  — ' + detail if detail else ''}")


print("\n1. hammer the store from many threads at once (the old failure mode)")
errors = []
stop = threading.Event()


def reader():
    while not stop.is_set():
        try:
            ks.saved_keys()
            ks.all_status()
        except Exception as e:  # a reader must never explode on a partial file
            errors.append(f"reader raised: {e!r}")
        time.sleep(0.0005)


def writer():
    for _ in range(30):
        ks.save_key("openai", GOOD)
        ks._set_status("openai", True, "ok", "Key accepted.", GOOD)
        ks.save_key("gemini", GEM)
        ks._mutate(lambda d: d.setdefault("keys", {}).setdefault("openai", GOOD))


threads = [threading.Thread(target=reader) for _ in range(3)]
threads += [threading.Thread(target=writer) for _ in range(6)]
for t in threads:
    t.start()
time.sleep(0.35)
stop.set()
for t in threads:
    t.join()

check("no reader crashed during concurrent writes", not errors, "; ".join(errors[:2]))

saved = ks.saved_keys()
check("both keys survived the parallel writes", saved.get("openai") == GOOD and saved.get("gemini") == GEM, str({k: ks.mask(v) for k, v in saved.items()}))

with open(KEYS, "r", encoding="utf-8") as fh:
    on_disk = json.load(fh)
check("file on disk is complete, not a partial write", on_disk.get("keys", {}).get("openai") == GOOD)
check("status entry kept alongside the keys", "openai" in on_disk.get("status", {}))
check("no temp files left behind", not glob.glob(KEYS + ".tmp"))
check("no quarantine triggered", not glob.glob(KEYS + ".corrupt-*"))

print("\n2. a corrupt store is quarantined instead of silently wiping data")
with open(KEYS, "w", encoding="utf-8") as fh:
    fh.write('{"keys": {"openai": "sk-real-user-key-here"')  # truncated JSON
recovered = ks.saved_keys()
check("corrupt file yields no keys (no crash)", recovered == {})
quarantined = glob.glob(KEYS + ".corrupt-*")
check("corrupt copy kept for inspection", len(quarantined) == 1, quarantined[0] if quarantined else "")
ks.save_key("openai", GOOD)
check("store usable again after quarantine", ks.saved_keys().get("openai") == GOOD)

print("\n3. fingerprint guard — a stale verdict must not follow a new key")
ks._set_status("openai", True, "ok", "Key accepted.", GOOD)
st_good = ks.provider_status("openai")
ks.save_key("openai", "sk-test-a-different-key-999999")
st_new = ks.provider_status("openai")
check("verified key reports valid", st_good["valid"] is True)
check("verdict cleared for the replaced key", st_new["valid"] is None, f"valid={st_new['valid']}")

for f in glob.glob(KEYS + "*"):
    os.remove(f)

print(f"\n{len(passes)}/{len(passes) + len(failures)} checks passed")
raise SystemExit(1 if failures else 0)
