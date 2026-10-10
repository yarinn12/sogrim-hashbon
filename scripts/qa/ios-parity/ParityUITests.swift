import XCTest

final class ParityProbeUITests: XCTestCase {
    func testNativeTypographyKeyboardSaveRotationAndRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.sogrimhashbon.app")
        app.launch()
        let status = app.staticTexts["native-parity-state"]
        XCTAssertTrue(status.waitForExistence(timeout: 35))
        func state() -> [String: Any] {
            guard let data = status.label.data(using: .utf8),
                  let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
            return value
        }
        func wait(_ name: String, timeout: TimeInterval = 35, predicate: () -> Bool) {
            let end = Date().addingTimeInterval(timeout)
            while Date() < end {
                if predicate() { return }
                if state()["phase"] as? String == "error" { break }
                Thread.sleep(forTimeInterval: 0.3)
            }
            XCTFail("Timed out: \(name). State: \(status.label)")
        }
        func tap(_ key: String) {
            // Large accessibility text may need ordinary user scrolling before
            // a field's center is hit-testable. Never use a DOM click for input.
            for _ in 0..<4 {
                if state()[key] is [String: Double] { break }
                let viewport = state()["viewport"] as? [String: Double] ?? [:]
                let height = viewport["visualHeight"] ?? viewport["height"] ?? 852
                let geometryKey = key == "amountPoint" ? "amountGeometry" : "nameGeometry"
                let geometry = state()[geometryKey] as? [String: Any] ?? [:]
                let top = geometry["top"] as? Double ?? height
                let upward = top >= height * 0.35
                let origin = app.coordinate(withNormalizedOffset: .zero)
                let a = origin.withOffset(CGVector(dx: 40, dy: height * (upward ? 0.72 : 0.35)))
                let b = origin.withOffset(CGVector(dx: 40, dy: height * (upward ? 0.35 : 0.72)))
                a.press(forDuration: 0.1, thenDragTo: b)
                Thread.sleep(forTimeInterval: 0.5)
            }
            wait("hittable \(key)") { state()[key] is [String: Double] }
            guard let point = state()[key] as? [String: Double], let x = point["x"], let y = point["y"] else { return }
            app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: y)).tap()
        }
        wait("native form") { state()["phase"] as? String == "keyboard-ready" }
        XCUIDevice.shared.orientation = .landscapeLeft
        Thread.sleep(forTimeInterval: 1)
        // The production iPhone policy remains portrait, including on rotation.
        let viewport = state()["viewport"] as? [String: Double] ?? [:]
        XCTAssertGreaterThan(viewport["height"] ?? 0, viewport["width"] ?? 0)
        XCUIDevice.shared.orientation = .portrait
        tap("amountPoint")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10), "A real UIKit keyboard must appear")
        app.typeText("120")
        wait("real amount input") { state()["amount"] as? String == "120" }
        let keyboardState = state()["native"] as? [String: Any] ?? [:]
        XCTAssertGreaterThan(keyboardState["keyboardShows"] as? Int ?? 0, 0)
        tap("nextPoint")
        tap("namePoint")
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 10))
        app.typeText("QA iOS")
        wait("real name input") { state()["name"] as? String == "QA iOS" }
        // Navigate the real wizard with hit-tested native-coordinate taps.
        for _ in 0..<4 {
            if state()["savePoint"] is [String: Double] { break }
            tap("nextPoint")
            Thread.sleep(forTimeInterval: 0.5)
        }
        tap("savePoint")
        wait("acknowledged save", timeout: 45) { state()["phase"] as? String == "saved" }
        XCUIDevice.shared.press(.home)
        app.activate()
        wait("native background and foreground") {
            let native = state()["native"] as? [String: Any] ?? [:]
            return (native["backgrounds"] as? Int ?? 0) > 0 && (native["foregrounds"] as? Int ?? 0) > 0
        }
        app.terminate(); app.launch()
        wait("persisted expense after real relaunch", timeout: 45) { state()["phase"] as? String == "restored" }
        XCTAssertEqual(state()["restored"] as? Bool, true)
        print("NATIVE_PARITY_XCTEST_SUCCESS: keyboard, native taps, acknowledged save, portrait policy, lifecycle, relaunch")
    }
}
