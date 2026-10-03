import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class BrowserExtensionTests(unittest.TestCase):
    def setUp(self):
        self.chromium = ROOT / "browser-extension" / "chromium"
        self.firefox = ROOT / "browser-extension" / "firefox"
        self.public_chromium = ROOT / "frontend" / "public" / "browser-extension" / "chromium"
        self.public_firefox = ROOT / "frontend" / "public" / "browser-extension" / "firefox"

    def test_chromium_manifest_uses_minimal_mv3_permissions(self):
        manifest = json.loads((self.chromium / "manifest.json").read_text())
        self.assertEqual(manifest["manifest_version"], 3)
        self.assertEqual(set(manifest["permissions"]), {"activeTab", "scripting", "clipboardWrite"})
        self.assertNotIn("host_permissions", manifest)
        self.assertNotIn("background", manifest)

    def test_firefox_manifest_is_installable_webextension(self):
        manifest = json.loads((self.firefox / "manifest.json").read_text())
        self.assertEqual(manifest["manifest_version"], 2)
        self.assertIn("browser_action", manifest)
        self.assertIn("gecko", manifest["browser_specific_settings"])
        self.assertEqual(set(manifest["permissions"]), {"activeTab", "clipboardWrite"})

    def test_both_popups_only_read_on_explicit_button_click(self):
        for folder in (self.chromium, self.firefox):
            with self.subTest(folder=folder.name):
                manifest = json.loads((folder / "manifest.json").read_text())
                source = (folder / "popup.js").read_text()
                self.assertIn("activeTab", manifest["permissions"])
                self.assertIn('button.addEventListener("click"', source)
                self.assertNotIn('addEventListener("load"', source)
                self.assertIn("navigator.clipboard.writeText(text)", source)
                self.assertIn("https://frontend-five-amber-34.vercel.app/", source)
                self.assertIn("60000", source)
                self.assertIn("document.body.innerText", source)
                self.assertNotIn("fetch(", source)
                self.assertNotIn("cookies", source)

    def test_extension_handoff_waits_for_user_to_paste_and_submit(self):
        source = (ROOT / "frontend" / "src" / "components" / "InputCard.jsx").read_text()
        self.assertIn('get("extension")', source)
        self.assertIn("nothing is submitted until you press Analyze", source)
        self.assertIn("Paste copied page", source)

    def test_download_source_packages_are_identical_and_complete(self):
        for source, published in ((self.chromium, self.public_chromium), (self.firefox, self.public_firefox)):
            with self.subTest(browser=source.name):
                for filename in ("manifest.json", "popup.html", "popup.css", "popup.js", "README.md"):
                    self.assertEqual((source / filename).read_bytes(), (published / filename).read_bytes(), filename)
        chromium = json.loads((self.public_chromium / "manifest.json").read_text())
        firefox = json.loads((self.public_firefox / "manifest.json").read_text())
        self.assertEqual(chromium["manifest_version"], 3)
        self.assertEqual(firefox["manifest_version"], 2)

if __name__ == "__main__":
    unittest.main(verbosity=2)
