"""Behavioral negative controls for the simulator artifact acceptance boundary."""
from copy import deepcopy
from contextlib import redirect_stdout
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from tempfile import TemporaryDirectory
import io
import json
import os
import unittest

path = Path(os.environ.get("IOS_PARITY_VALIDATOR", Path(__file__).with_name("prepare.py")))
spec = spec_from_file_location("ios_validator", path)
validator = module_from_spec(spec)
spec.loader.exec_module(validator)
SHA, TREE = "a" * 40, "b" * 40
PHASES = ["home", "expenses", "summary", "transfers", "notes", "note-opened", "profile", "keyboard-amount", "keyboard-name", "saved", "resumed", "restored"]


def report(enlarged=False):
    factor = 40 / 17 if enlarged else 1
    native = {"sourceSha": SHA, "sourceTree": TREE, "controller": "SogrimParityBridgeViewController",
              "preferredContentSizeCategory": "UICTContentSizeCategoryAccessibilityXL" if enlarged else "UICTContentSizeCategoryL",
              "webViewContentSizeCategory": "UICTContentSizeCategoryAccessibilityXL" if enlarged else "UICTContentSizeCategoryL",
              "nativeBodyPointSize": 40 if enlarged else 17, "systemVersion": "26.5",
              "bridgeAvailable": True, "webViewUrl": "capacitor://localhost/", "safeArea": {"top": 59, "bottom": 34},
              "windowBounds": {"x": 0, "y": 0, "width": 393, "height": 852},
              "webViewFrame": {"x": 0, "y": 0, "width": 393, "height": 852},
              "scrollViewFrame": {"x": 0, "y": 0, "width": 393, "height": 852},
              "nativeContentOffset": {"x": 0, "y": 0}, "nativeZoomScale": 1,
              "statusBarFrame": {"x": 0, "y": 0, "width": 393, "height": 59},
              "keyboardFrame": {"x": 0, "y": 476, "width": 393, "height": 376},
              "keyboardShows": 2, "backgrounds": 1, "foregrounds": 2}
    metric = {"text": "טקסט תקין", "width": 100, "height": 25, "fontSize": 14 * factor,
              "clientWidth": 100, "scrollWidth": 100, "horizontalGlyphOverflow": False, "clippedByAncestor": False,
              "bounds": {"top": 150, "bottom": 200, "left": 30, "right": 130},
              "nativeBounds": {"top": 150, "bottom": 200, "left": 30, "right": 130},
              "words": [{"text": "טקסט", "rows": 1, "outsideTab": False}]}
    result = deepcopy(native)
    result["records"] = []
    for phase in PHASES:
        metrics = {"heading": deepcopy(metric)}
        if phase == "expenses": metrics = {key: deepcopy(metric) for key in ["tab", "tab2", "tab3"]}
        if phase == "notes": metrics = {key: deepcopy(metric) for key in ["title", "preview"]}
        if phase == "transfers":
            metrics = {"longName": deepcopy(metric)}
            metrics["longName"]["text"] = "אורח בדיקה עם שם ארוך מאוד לצורך תצוגה"
        if phase.startswith("keyboard-"):
            field = "amount" if phase == "keyboard-amount" else "name"
            metrics = {field: deepcopy(metric), "next": deepcopy(metric)}
            for key in ["bounds", "nativeBounds"]:
                metrics["next"][key].update({"top": 270, "bottom": 322})
        if phase == "restored":
            metrics["expense"] = deepcopy(metric)
            metrics["expense"]["text"] = "QA iOS"
        result["records"].append({"phase": phase, "native": deepcopy(native), "nativeShell": True, "platform": "ios",
                                  "appUrl": "capacitor://localhost/", "nativeAppInfo": {"id": "com.sogrimhashbon.app"},
                                  "errors": [], "documentWidth": 393, "rootFontSize": 16 * factor,
                                  "viewport": {"width": 393, "height": 852, "visualHeight": 476 if phase.startswith("keyboard-") else 852, "visualTop": 0},
                                  "metrics": metrics, "writes": [{"ok": True}], "pendingOutbox": [],
                                  "keyboardLayout": {"header": {"top": 0, "bottom": 120},
                                                     "footer": {"top": 250, "bottom": 476},
                                                     "fieldHittable": True, "nextHittable": True},
                                  "openedNote": {"title": "טקסט תקין", "body": "טקסט תקין"},
                                  "documentScroll": {"x": 0, "y": 0},
                                  "trustedInputs": [{"action": "expense-total", "value": "120"}, {"action": "expense-name", "value": "QA iOS"}],
                                  "trustedClicks": [{"action": "expense-step-next"}, {"action": "save-expense"}],
                                  "saved": {"state": {"events": [{"expenses": [{"name": "QA iOS", "total": 12000}]}]}}})
    return result


class AcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.reports = {"default": report(), "accessibility-extra-large": report(True)}

    def record(self, phase):
        return next(r for r in self.reports["accessibility-extra-large"]["records"] if r["phase"] == phase)

    def accept(self):
        with TemporaryDirectory() as temporary:
            out = Path(temporary)
            (out / "package-manifest.json").write_text(json.dumps({"sourceSha": SHA, "sourceTree": TREE}))
            for mode, data in self.reports.items():
                directory = out / mode
                directory.mkdir()
                (directory / "native-parity.json").write_text(json.dumps(data))
                for phase in PHASES:
                    (directory / f"native-parity-{phase}.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 1100)
            with redirect_stdout(io.StringIO()): validator.validate(out, SHA)

    def rejects(self):
        with self.assertRaises((AssertionError, KeyError)): self.accept()

    def test_complete_artifacts_pass(self): self.accept()
    def test_profile_content_clipping_fails(self):
        self.record("profile")["metrics"]["heading"]["scrollWidth"] = 1800
        self.rejects()
    def test_glyph_overflow_fails(self):
        self.record("notes")["metrics"]["title"]["horizontalGlyphOverflow"] = True
        self.rejects()
    def test_explicit_preview_ellipsis_with_full_opened_content_passes(self):
        metric = self.record("notes")["metrics"]["title"]
        metric.update({"scrollWidth": 1800, "horizontalGlyphOverflow": True, "textOverflow": "ellipsis", "overflowX": "hidden"})
        metric["words"].append({"text": "קוצר", "rows": 0, "outsideTab": False})
        self.accept()
    def test_preview_ellipsis_with_no_visible_glyphs_fails(self):
        metric = self.record("notes")["metrics"]["title"]
        metric.update({"textOverflow": "ellipsis", "overflowX": "hidden"})
        metric["words"][0]["rows"] = 0
        self.rejects()
    def test_preview_ellipsis_cannot_hide_missing_full_title(self):
        metric = self.record("notes")["metrics"]["title"]
        metric.update({"scrollWidth": 1800, "horizontalGlyphOverflow": True, "textOverflow": "ellipsis", "overflowX": "hidden"})
        self.record("note-opened")["openedNote"]["title"] = "טקסט"
        self.rejects()
    def test_double_font_scaling_fails(self):
        self.record("home")["metrics"]["heading"]["fontSize"] *= 2
        self.rejects()
    def test_zero_safe_area_fails(self):
        self.record("home")["native"]["safeArea"] = {"top": 0, "bottom": 0}
        self.rejects()
    def test_faked_bridge_fails(self):
        self.record("home")["native"]["bridgeAvailable"] = False
        self.rejects()
    def test_external_page_fails(self):
        self.record("home")["appUrl"] = "https://example.test/"
        self.rejects()
    def test_similar_but_wrong_native_host_fails(self):
        self.record("home")["appUrl"] = "capacitor://localhost.evil.invalid/"
        self.rejects()
    def test_parent_clipping_fails(self):
        self.record("summary")["metrics"]["heading"]["clippedByAncestor"] = True
        self.rejects()
    def test_missing_glyphs_fails(self):
        self.record("summary")["metrics"]["heading"]["words"][0]["rows"] = 0
        self.rejects()
    def test_heading_beneath_status_bar_fails(self):
        m = self.record("home")["metrics"]["heading"]
        m["bounds"].update({"top": 0, "bottom": 30})
        m["nativeBounds"].update({"top": 0, "bottom": 30})
        self.rejects()
    def test_inset_mapping_mismatch_fails(self):
        self.record("keyboard-name")["native"]["scrollViewFrame"]["y"] = 59
        self.rejects()
    def test_inconsistent_keyboard_and_visual_viewport_fails(self):
        self.record("keyboard-name")["native"]["keyboardFrame"]["y"] = 650
        self.rejects()
    def test_untrusted_amount_input_fails(self):
        self.record("keyboard-amount")["trustedInputs"] = []
        self.rejects()
    def test_untrusted_save_click_fails(self):
        self.record("saved")["trustedClicks"] = [{"action": "expense-step-next"}]
        self.rejects()
    def test_wrong_source_tree_fails(self):
        self.record("home")["native"]["sourceTree"] = "c" * 40
        self.rejects()
    def test_long_name_not_measured_fails(self):
        self.record("transfers")["metrics"]["longName"]["text"] = "אורח"
        self.rejects()
    def test_field_under_keyboard_fails(self):
        self.record("keyboard-name")["metrics"]["name"]["bounds"]["bottom"] = 600
        self.rejects()
    def test_footer_covers_field_edge_despite_hittable_center_fails(self):
        # Field center remains at 175, but its bottom 20px are under the footer.
        self.record("keyboard-name")["keyboardLayout"]["footer"]["top"] = 180
        self.rejects()
    def test_header_covers_field_edge_despite_hittable_center_fails(self):
        self.record("keyboard-name")["keyboardLayout"]["header"]["bottom"] = 160
        self.rejects()
    def test_keyboard_field_center_covered_fails(self):
        self.record("keyboard-name")["keyboardLayout"]["fieldHittable"] = False
        self.rejects()
    def test_keyboard_next_center_covered_fails(self):
        self.record("keyboard-amount")["keyboardLayout"]["nextHittable"] = False
        self.rejects()
    def test_native_name_scroll_above_viewport_fails(self):
        # The real AX run accepted typing with a DOM-hit-tested center while
        # UIKit's additional scroll left the top of the name field at -19px.
        metric = self.record("keyboard-name")["metrics"]["name"]
        for key in ["bounds", "nativeBounds"]:
            metric[key].update({"top": -19.375, "bottom": 89.890625})
        self.rejects()
    def test_name_center_visible_but_field_under_status_bar_fails(self):
        # Being inside visualViewport is insufficient: the complete native
        # field must also clear the OS bar, even if its center is below it.
        metric = self.record("keyboard-name")["metrics"]["name"]
        for key in ["bounds", "nativeBounds"]:
            metric[key].update({"top": 10, "bottom": 119.265625})
        self.rejects()
    def test_keyboard_without_native_frame_fails(self):
        self.record("keyboard-amount")["native"]["keyboardFrame"]["height"] = 0
        self.rejects()
    def test_missing_resume_evidence_fails(self):
        self.record("resumed")["native"]["backgrounds"] = 0
        self.rejects()
    def test_missing_rendered_restore_fails(self):
        del self.record("restored")["metrics"]["expense"]
        self.rejects()


if __name__ == "__main__": unittest.main()
