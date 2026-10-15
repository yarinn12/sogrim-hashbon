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
FIXTURE_SHA, FIXTURE_TREE = "c" * 40, "d" * 40
COLD, RELAUNCH = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
PHASES = ["home", "expenses", "summary", "transfers", "notes", "note-opened", "profile", "keyboard-ready", "keyboard-amount", "keyboard-name", "saved", "resumed", "restored"]
VISUAL_SCREENS = {"home": "home", "summary": "settlement", "transfers": "settlement", "profile": "profile"}


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
        if phase == "home":
            metrics["heading"].update({"text": "מה סוגרים היום?", "fontSize": 24 * factor,
                                       "textRows": 1 if not enlarged else 2})
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
            metrics["groupTotal"] = deepcopy(metric)
            metrics["groupTotal"]["text"] = "₪120.00"
            metrics["groupTotal"]["textRows"] = 1
            metrics["groupTotal"]["words"] = [{"text": "₪120.00", "rows": 1, "outsideTab": False}]
        home_reference = ({"title": "מה סוגרים היום?", "fontSize": 24 * factor,
                           "lineCount": 1 if not enlarged else 2, "eyebrowVisible": False,
                           "viewport": {"width": 393, "height": 852},
                           "pointer": {"coarse": False, "fine": False},
                           "rootFontSize": 16 * factor,
                           "textPreference": "normal" if not enlarged else "extra-large",
                           "dynamicTypeActive": enlarged,
                           "titleBounds": {"left": 40, "right": 353, "top": 150, "bottom": 178},
                           "hero": {"left": 16, "right": 377, "top": 120, "bottom": 300,
                                    "width": 361, "height": 180},
                           "action": {"left": 100, "right": 293, "top": 272, "bottom": 330,
                                      "width": 193, "height": 58},
                           "actionFits": True}) if phase == "home" else None
        session = RELAUNCH if phase == "restored" else COLD
        result["records"].append({"phase": phase, "index": 1 if phase == "restored" else len(result["records"]) + 1,
                                  "captureSession": session,
                                  "visualCapture": {"phase": phase, "screen": VISUAL_SCREENS.get(phase, "event"),
                                                    "splashAbsent": True, "splashMarkMs": 100,
                                                    "capturedAtMs": 1000 + len(result["records"])},
                                  "native": deepcopy(native), "nativeShell": True, "platform": "ios",
                                  "appUrl": "capacitor://localhost/", "nativeAppInfo": {"id": "com.sogrimhashbon.app"},
                                  "errors": [], "documentWidth": 393, "rootFontSize": 16 * factor,
                                  "viewport": {"width": 393, "height": 852, "visualHeight": 476 if phase.startswith("keyboard-") else 852, "visualTop": 0},
                                  "metrics": metrics, "homeReference": home_reference,
                                  "writes": [{"ok": True}], "pendingOutbox": [],
                                  "keyboardLayout": {"header": {"top": 0, "bottom": 120},
                                                     "headerControls": {"back": {"top": 64, "bottom": 112, "left": 280, "right": 328},
                                                                        "accessibility": {"top": 64, "bottom": 112, "left": 224, "right": 272},
                                                                        "backHittable": True, "accessibilityHittable": True},
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
        self.omit_screenshot = None
        self.evidence = {}
        for mode in self.reports:
            startup = {}
            status = {}
            for session, phases, origin in [(COLD, PHASES[:-1], 1000), (RELAUNCH, ["restored"], 2000)]:
                identity = {"session": session, "sourceSha": SHA, "sourceTree": TREE,
                            "fixtureSha": FIXTURE_SHA, "fixtureTree": FIXTURE_TREE}
                startup[session] = [{**identity, "event": "capacitorDidLoad-enter", "time": 1},
                                    {**identity, "event": "web-stage", "stage": "script-injected",
                                     "time": 1.5, "timeOriginMs": origin},
                                    {**identity, "event": "web-stage", "stage": "startup-milestone",
                                     "milestone": "splash-dismissed", "time": 2, "timeOriginMs": origin,
                                     "startMs": 100}]
                status[session] = []
                for index, phase in enumerate(phases, 1):
                    for event, offset in [("captureReceived", 0), ("captureWritten", 0.1), ("captureAckCallback", 0.2)]:
                        status[session].append({**identity, "event": event, "index": index,
                                                "phase": phase if event == "captureReceived" else None,
                                                "error": "" if event == "captureAckCallback" else None,
                                                "time": 3 + index + offset})
            self.evidence[mode] = {"startup": startup, "status": status}

    def record(self, phase):
        return next(r for r in self.reports["accessibility-extra-large"]["records"] if r["phase"] == phase)

    def scrolled_name(self):
        # The captured default iOS keyboard-name state scrolls both the web
        # document and WKWebView's native scroll view by the same 196 points.
        record = next(r for r in self.reports["default"]["records"] if r["phase"] == "keyboard-name")
        record["documentScroll"]["y"] = 196
        record["native"]["nativeContentOffset"]["y"] = 196
        record["viewport"].update({"visualTop": 196, "visualHeight": 449})
        record["native"]["keyboardFrame"].update({"y": 449, "height": 403})
        record["keyboardLayout"]["footer"].update({"top": 350, "bottom": 449})
        for key, top, bottom in [("name", 283.625, 341.625), ("next", 363, 415)]:
            for axis in ["bounds", "nativeBounds"]:
                record["metrics"][key][axis].update({"top": top, "bottom": bottom})
        return record

    def accept(self):
        with TemporaryDirectory() as temporary:
            out = Path(temporary)
            (out / "package-manifest.json").write_text(json.dumps({"sourceSha": SHA, "sourceTree": TREE,
                                                                    "fixtureSha": FIXTURE_SHA, "fixtureTree": FIXTURE_TREE}))
            for mode, data in self.reports.items():
                directory = out / mode
                directory.mkdir()
                (directory / "native-parity.json").write_text(json.dumps(data))
                for phase in PHASES:
                    if self.omit_screenshot != (mode, phase):
                        (directory / f"native-parity-{phase}.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"0" * 1100)
                for kind in ["startup", "status"]:
                    for session, rows in self.evidence[mode][kind].items():
                        (directory / f"native-parity-{kind}-{session}.log").write_text(
                            "".join(json.dumps(row) + "\n" for row in rows))
            with redirect_stdout(io.StringIO()): validator.validate(out, SHA)

    def rejects(self):
        with self.assertRaises((AssertionError, KeyError)): self.accept()

    def rejects_keyboard_boundary(self):
        with self.assertRaisesRegex(AssertionError, "visual viewport/native keyboard mismatch"):
            self.accept()

    def test_complete_artifacts_pass(self): self.accept()
    def test_home_capture_before_splash_dismissal_fails(self):
        self.evidence["accessibility-extra-large"]["startup"][COLD][-1]["startMs"] = 1200
        self.record("home")["visualCapture"]["splashMarkMs"] = 1200
        with self.assertRaisesRegex(AssertionError, "capture predates original splash mark"): self.accept()
    def test_delayed_milestone_delivery_after_native_capture_passes(self):
        # The original JS mark predates capture; its bridge log may arrive later.
        self.evidence["accessibility-extra-large"]["startup"][COLD][-1]["time"] = 5
        self.accept()
    def test_visible_phase_mismatch_fails(self):
        self.record("summary")["visualCapture"]["screen"] = "home"
        with self.assertRaisesRegex(AssertionError, "wrong visible screen"): self.accept()
    def test_splash_overlay_still_visible_fails(self):
        self.record("home")["visualCapture"]["splashAbsent"] = False
        with self.assertRaisesRegex(AssertionError, "splash covers measured screen"): self.accept()
    def test_missing_native_capture_ack_fails(self):
        self.evidence["default"]["status"][COLD] = [row for row in self.evidence["default"]["status"][COLD]
                                                     if not (row["event"] == "captureAckCallback" and row["index"] == 1)]
        with self.assertRaisesRegex(AssertionError, "capture/ACK count mismatch"): self.accept()
    def test_relaunch_must_use_a_separate_session(self):
        self.record("restored")["captureSession"] = COLD
        with self.assertRaisesRegex(AssertionError, "cold/relaunch session overlap"): self.accept()
    def test_keyboard_ready_screenshot_is_required(self):
        self.omit_screenshot = ("default", "keyboard-ready")
        with self.assertRaisesRegex(AssertionError, "missing visual capture"): self.accept()
    def test_home_reference_rejects_29px_title(self):
        for mode, factor in [("default", 1), ("accessibility-extra-large", 40 / 17)]:
            home = self.reports[mode]["records"][0]
            home["homeReference"]["fontSize"] = 29 * factor
            home["metrics"]["heading"]["fontSize"] = 29 * factor
        self.rejects()
    def test_home_reference_rejects_two_title_lines(self):
        home = self.reports["default"]["records"][0]
        home["homeReference"]["lineCount"] = 2
        home["metrics"]["heading"]["textRows"] = 2
        self.rejects()
    def test_home_reference_rejects_extra_eyebrow(self):
        self.reports["default"]["records"][0]["homeReference"]["eyebrowVisible"] = True
        self.rejects()
    def test_home_reference_requires_actual_pointer_readback(self):
        del self.reports["default"]["records"][0]["homeReference"]["pointer"]
        self.rejects()
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
    def test_scrolled_name_matches_native_keyboard(self):
        self.scrolled_name()
        self.accept()
    def test_scrolled_name_with_recorded_page_top_matches_native_keyboard(self):
        self.scrolled_name()["viewport"]["visualPageTop"] = 196
        self.accept()
    def test_scrolled_name_keyboard_mismatch_still_fails(self):
        self.scrolled_name()["native"]["keyboardFrame"]["y"] = 470
        self.rejects_keyboard_boundary()
    def test_scrolled_name_visual_height_mismatch_still_fails(self):
        self.scrolled_name()["viewport"]["visualHeight"] = 419
        self.rejects_keyboard_boundary()
    def test_scrolled_name_without_page_top_rejects_independent_pan(self):
        self.scrolled_name()["viewport"]["visualTop"] = 216
        with self.assertRaisesRegex(AssertionError, "visual viewport origin requires pageTop"):
            self.accept()
    def test_scrolled_name_with_independent_pan_and_page_top_passes(self):
        record = self.scrolled_name()
        record["viewport"].update({"visualTop": 20, "visualPageTop": 216})
        record["native"]["keyboardFrame"]["y"] = 469
        self.accept()
    def test_scrolled_name_wrong_recorded_page_top_fails(self):
        self.scrolled_name()["viewport"]["visualPageTop"] = 216
        with self.assertRaisesRegex(AssertionError, "inconsistent visual viewport origin"):
            self.accept()
    def test_scrolled_name_wrong_page_top_cannot_hide_wrong_keyboard_frame(self):
        record = self.scrolled_name()
        record["viewport"]["visualPageTop"] = 216
        record["native"]["keyboardFrame"]["y"] = 469
        with self.assertRaisesRegex(AssertionError, "inconsistent visual viewport origin"):
            self.accept()
    def test_scrolled_name_boolean_page_top_fails(self):
        self.scrolled_name()["viewport"]["visualPageTop"] = True
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
    def test_keyboard_back_inaccessible_fails(self):
        self.record("keyboard-name")["keyboardLayout"]["headerControls"]["backHittable"] = False
        self.rejects()
    def test_keyboard_accessibility_control_inaccessible_fails(self):
        self.record("keyboard-name")["keyboardLayout"]["headerControls"]["accessibilityHittable"] = False
        self.rejects()
    def test_keyboard_back_under_native_status_bar_fails(self):
        self.record("keyboard-name")["keyboardLayout"]["headerControls"]["back"].update({"top": 10, "bottom": 58})
        self.rejects()
    def test_keyboard_back_under_native_keyboard_fails(self):
        self.record("keyboard-name")["keyboardLayout"]["headerControls"]["back"].update({"top": 480, "bottom": 528})
        self.rejects()
    def test_missing_keyboard_header_controls_fails(self):
        del self.record("keyboard-name")["keyboardLayout"]["headerControls"]
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
    def test_wrapped_group_currency_fails(self):
        # UIKit AX screenshot showed the final digit on its own second row.
        self.record("restored")["metrics"]["groupTotal"]["words"][0]["rows"] = 2
        self.rejects()
    def test_missing_group_currency_fails(self):
        del self.record("restored")["metrics"]["groupTotal"]
        self.rejects()
    def test_currency_symbol_on_separate_row_fails(self):
        metric = self.record("restored")["metrics"]["groupTotal"]
        metric["textRows"] = 2
        metric["words"] = [{"text": "₪", "rows": 1, "outsideTab": False},
                           {"text": "120.00", "rows": 1, "outsideTab": False}]
        self.rejects()


class StatusPublicationWiringTests(unittest.TestCase):
    def test_generated_app_and_test_target_use_identical_swift_policy(self):
        policy = (validator.FIXTURES / "StatusPublicationPolicy.swift").read_text(encoding="utf8")
        driver = (validator.FIXTURES / "ParityUITests.swift").read_text(encoding="utf8")
        delegate = validator.inject_status_policy("import WebKit\nclass App {}", "import WebKit")
        target = validator.test_target_source()
        self.assertEqual(delegate.count(policy), 1)
        self.assertEqual(target.count(policy), 1)
        self.assertTrue(target.startswith("import XCTest\n" + policy))
        self.assertIn(driver.removeprefix("import XCTest"), target)
        self.assertIn("final class StatusPublicationPolicyTests", target)
        prepare = (validator.FIXTURES / "prepare.py").read_text(encoding="utf8")
        self.assertIn('source = inject_status_policy(source, "import WebKit")', prepare)
        self.assertIn('write_text(test_target_source(), encoding="utf8")', prepare)

    def test_capture_and_resumed_trigger_precede_label_deduplication(self):
        bridge = (validator.FIXTURES / "ParityBridge.swift").read_text(encoding="utf8")
        self.assertLess(bridge.index("__iosParityCaptureCurrent?.('resumed')"),
                        bridge.index("statusPublicationPolicy.candidate(for: state)"))
        self.assertLess(bridge.index("statusPublicationPolicy.candidate(for: state)"),
                        bridge.index("self.status.text = result"))
        self.assertLess(bridge.index("self.status.text = result"),
                        bridge.index("statusPublicationPolicy.didPublish(encoded)"))
        self.assertIn('record["native"] = nativeInfo()', bridge)
        self.assertIn('report = nativeInfo(); report["records"] = records', bridge)


if __name__ == "__main__": unittest.main()
