"""Probe checks for keys_store. Run from backend/: venv/Scripts/python.exe ../scratch/test_keys_probe.py"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../backend")
os.environ["PAPERROSE_KEYS_PATH"] = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_keys.json")
)

import keys_store as ks  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", ".env"))

print("A. real OpenAI, bogus key   :", ks.probe("openai", "sk-proj-bogus-key-000000000000"))

env_key = os.environ.get("OPENAI_API_KEY")
print("B. real OpenAI, expired .env:", ks.probe("openai", env_key) if env_key else "(no key in .env)")

gem = os.environ.get("GEMINI_API_KEY")
print("C. real Gemini, expired .env:", ks.probe("gemini", gem) if gem else "(no key in .env)")

os.environ["OPENAI_BASE_URL"] = "http://127.0.0.1:8766/v1"
os.environ["GEMINI_BASE_URL"] = "http://127.0.0.1:8766/v1beta"
print("D. mock, good key           :", ks.probe("openai", "sk-test-good-key-123456"))
print("E. mock, bad key            :", ks.probe("openai", "sk-test-bad-key-0000000"))
print("F. mock gemini, good key    :", ks.probe("gemini", "sk-test-good-key-123456"))
print("G. mask()                   :", ks.mask("sk-proj-abcdefghijklmnopqrstuvwxyz123456"))
