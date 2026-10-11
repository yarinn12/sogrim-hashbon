
@objc(SogrimParityBridgeViewController)
class SogrimParityBridgeViewController: SogrimBridgeViewController, WKScriptMessageHandler {
    private let status = UILabel()
    private var report: [String: Any] = [:]
    private var records: [[String: Any]] = []
    private var timer: Timer?
    private var keyboardShows = 0
    private var keyboardHides = 0
    private var backgrounds = 0
    private var foregrounds = 0
    private let sourceSha = "__APP_SHA__"
    private let sourceTree = "__APP_TREE__"
    private var keyboardFrame = CGRect.zero
    private var lifecycleCaptureRequested = false
    private var lastPointMappings: [String: Any] = [:]
    private let statusSession = UUID().uuidString
    private var appearances = 0
    private var statusRequests = 0
    private var statusCallbacks = 0
    private var statusPublications = 0
    private var statusLog: FileHandle?
    private var output: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }

    // Independent native observations: never used to satisfy a readiness gate.
    // Append small events so a failed JS callback or AX publication is retained
    // even when native-parity.json has not received another capture.
    private func observeStatus(_ event: String, _ fields: [String: Any] = [:]) {
        var row = fields
        row["event"] = event; row["time"] = Date().timeIntervalSince1970
        row["session"] = statusSession; row["sourceSha"] = sourceSha; row["sourceTree"] = sourceTree
        row["requests"] = statusRequests; row["callbacks"] = statusCallbacks; row["publications"] = statusPublications
        guard var data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) else { return }
        data.append(0x0A)
        if statusLog == nil {
            let path = output.appendingPathComponent("native-parity-status-\(statusSession).log")
            FileManager.default.createFile(atPath: path.path, contents: nil)
            statusLog = try? FileHandle(forWritingTo: path)
        }
        do { try statusLog?.write(contentsOf: data) }
        catch { NSLog("NATIVE_PARITY_STATUS_LOG_ERROR: %@", String(describing: error)) }
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let controller = webView!.configuration.userContentController
        controller.add(self, name: "iosParity")
        for name in ["synthetic-service", "journey"] {
            let url = Bundle.main.resourceURL!.appendingPathComponent("public/ios-parity-\(name).js")
            let script = try! String(contentsOf: url, encoding: .utf8)
            controller.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        appearances += 1
        observeStatus("viewDidAppear", ["appearances": appearances, "timerPresent": timer != nil, "webViewPresent": webView != nil])
        if timer != nil { return }
        if let data = try? Data(contentsOf: output.appendingPathComponent("native-parity.json")),
           let previous = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           previous["sourceSha"] as? String == sourceSha {
            records = previous["records"] as? [[String: Any]] ?? []
        }
        // This transparent diagnostic label does not change the WKWebView frame.
        // XCTest reads its value; all tested input taps go to the real web UI.
        status.frame = CGRect(x: 2, y: view.safeAreaInsets.top + 2, width: 1, height: 1)
        status.textColor = .clear
        status.isUserInteractionEnabled = false
        status.isAccessibilityElement = false
        view.addSubview(status)
        let center = NotificationCenter.default
        center.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { [weak self] note in
            self?.keyboardShows += 1
            self?.keyboardFrame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
        }
        center.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { [weak self] _ in
            self?.keyboardHides += 1; self?.keyboardFrame = .zero
        }
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.backgrounds += 1 }
        center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in self?.foregrounds += 1 }
        timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in self?.refreshStatus("timer") }
        observeStatus("timerScheduled")
    }
    private func nativeInfo() -> [String: Any] {
        let safe = view.window?.safeAreaInsets ?? .zero
        func rect(_ frame: CGRect) -> [String: Double] {
            return ["x": Double(frame.minX), "y": Double(frame.minY), "width": Double(frame.width), "height": Double(frame.height)]
        }
        let inset = webView!.scrollView.adjustedContentInset
        return ["sourceSha": sourceSha, "sourceTree": sourceTree, "systemVersion": UIDevice.current.systemVersion,
                "deviceName": UIDevice.current.name, "controller": String(describing: type(of: self)),
                "bridgeAvailable": bridge != nil, "webViewUrl": webView!.url?.absoluteString ?? "",
                "windowBounds": rect(view.window?.bounds ?? .zero),
                "webViewFrame": rect(webView!.convert(webView!.bounds, to: nil)),
                "scrollViewFrame": rect(webView!.scrollView.convert(webView!.scrollView.bounds, to: nil)),
                "nativeZoomScale": webView!.scrollView.zoomScale,
                "statusBarFrame": rect(view.window?.windowScene?.statusBarManager?.statusBarFrame ?? .zero),
                "keyboardFrame": rect(keyboardFrame),
                "webViewInsets": ["top": inset.top, "bottom": inset.bottom, "left": inset.left, "right": inset.right],
                "nativeContentOffset": ["x": webView!.scrollView.contentOffset.x, "y": webView!.scrollView.contentOffset.y],
                "pointMappings": lastPointMappings,
                "statusPoll": ["session": statusSession, "requests": statusRequests, "callbacks": statusCallbacks, "publications": statusPublications],
                "preferredContentSizeCategory": UIApplication.shared.preferredContentSizeCategory.rawValue,
                "webViewContentSizeCategory": webView!.traitCollection.preferredContentSizeCategory.rawValue,
                "nativeBodyPointSize": UIFont.preferredFont(forTextStyle: .body).pointSize,
                "keyboardShows": keyboardShows, "keyboardHides": keyboardHides,
                "backgrounds": backgrounds, "foregrounds": foregrounds,
                "safeArea": ["top": safe.top, "bottom": safe.bottom, "left": safe.left, "right": safe.right]]
    }
    private func refreshStatus(_ origin: String) {
        statusRequests += 1
        observeStatus("requested", ["origin": origin, "webViewPresent": webView != nil, "timerValid": timer?.isValid ?? false])
        webView?.evaluateJavaScript("JSON.stringify(globalThis.__iosParityLive?.() || {})") { [weak self] value, error in
            guard let self = self else { return }
            self.statusCallbacks += 1
            self.observeStatus("callback", ["valueType": value.map { String(describing: type(of: $0)) } ?? "nil",
                                           "textLength": (value as? String)?.utf8.count ?? 0,
                                           "evaluationError": error.map { String(describing: $0) } ?? ""])
            guard let text = value as? String, let data = text.data(using: .utf8),
                  var state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self.observeStatus("decodeRejected"); return
            }
            self.observeStatus("decoded", ["phase": state["phase"] as? String ?? "missing",
                                          "nativeStatusReady": state["nativeStatusReady"] as? Bool ?? false,
                                          "readinessType": state["nativeStatusReady"].map { String(describing: type(of: $0)) } ?? "missing"])
            // UILabel existence is the first XCTest readiness boundary.
            // A bootstrap placeholder must not start the later form deadline.
            // Expose errors immediately so failures remain actionable.
            guard state["nativeStatusReady"] as? Bool == true || state["phase"] as? String == "error" else { return }
            let documentScroll = state["documentScroll"] as? [String: Double] ?? [:]
            var mappings: [String: Any] = [:]
            for key in ["amountPoint", "namePoint", "nextPoint", "savePoint"] {
                if let point = state[key] as? [String: Double], let x = point["x"], let y = point["y"] {
                    // Client rectangles are relative to the document viewport.
                    // Convert its document point through the real scroll view,
                    // including automatic insets and native content offsets.
                    let documentPoint = CGPoint(x: x + (documentScroll["x"] ?? 0), y: y + (documentScroll["y"] ?? 0))
                    let windowPoint = self.webView!.scrollView.convert(documentPoint, to: nil)
                    state[key] = ["x": Double(windowPoint.x), "y": Double(windowPoint.y)]
                    mappings[key] = ["client": point, "documentScroll": documentScroll, "window": state[key]!]
                }
            }
            state["pointMappings"] = mappings
            self.lastPointMappings = mappings
            state["native"] = self.nativeInfo()
            if state["phase"] as? String == "saved", self.backgrounds > 0, self.foregrounds > 0,
               !self.lifecycleCaptureRequested {
                self.lifecycleCaptureRequested = true
                self.webView?.evaluateJavaScript("globalThis.__iosParityCaptureCurrent?.('resumed')", completionHandler: nil)
            }
            if let error = error { state["evaluationError"] = String(describing: error) }
            do {
                let encoded = try JSONSerialization.data(withJSONObject: state, options: [.sortedKeys])
                guard let result = String(data: encoded, encoding: .utf8) else {
                    self.observeStatus("encodingRejected"); return
                }
                self.status.text = result; self.status.accessibilityLabel = result
                self.status.accessibilityIdentifier = "native-parity-state"
                self.status.isAccessibilityElement = true
                self.statusPublications += 1
                let frame = self.status.convert(self.status.bounds, to: nil)
                self.observeStatus("published", ["identifier": self.status.accessibilityIdentifier ?? "",
                                                "isAccessibilityElement": self.status.isAccessibilityElement,
                                                "labelLength": self.status.accessibilityLabel?.utf8.count ?? 0,
                                                "windowPresent": self.status.window != nil,
                                                "superviewPresent": self.status.superview != nil,
                                                "hidden": self.status.isHidden, "alpha": Double(self.status.alpha),
                                                "frame": ["x": Double(frame.minX), "y": Double(frame.minY), "width": Double(frame.width), "height": Double(frame.height)]])
            } catch {
                self.observeStatus("serializationRejected", ["error": String(describing: error)])
            }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard var record = message.body as? [String: Any], let index = record["index"] as? Int else { return }
        if record["kind"] as? String == "keyboard-geometry-diagnostic" {
            guard let phase = record["phase"] as? String,
                  ["keyboard-amount", "keyboard-name"].contains(phase),
                  let original = records.first(where: { $0["index"] as? Int == index && $0["phase"] as? String == phase }) else { return }
            record["kind"] = "Later observations only; original acceptance capture unchanged"
            record["originalCapture"] = original
            record["nativeAfterReadbacks"] = nativeInfo()
            if let data = try? JSONSerialization.data(withJSONObject: record, options: [.sortedKeys, .prettyPrinted]) {
                try? data.write(to: output.appendingPathComponent("native-parity-geometry-\(phase).json"), options: .atomic)
            }
            return
        }
        let scroll = record["documentScroll"] as? [String: Double] ?? [:]
        if var metrics = record["metrics"] as? [String: [String: Any]] {
            for (key, var metric) in metrics {
                if let b = metric["bounds"] as? [String: Double], let left = b["left"], let top = b["top"],
                   let right = b["right"], let bottom = b["bottom"] {
                    let frame = webView!.scrollView.convert(CGRect(x: left + (scroll["x"] ?? 0), y: top + (scroll["y"] ?? 0),
                                                                 width: right - left, height: bottom - top), to: nil)
                    metric["nativeBounds"] = ["left": Double(frame.minX), "right": Double(frame.maxX),
                                              "top": Double(frame.minY), "bottom": Double(frame.maxY)]
                    metrics[key] = metric
                }
            }
            record["metrics"] = metrics
        }
        record["native"] = nativeInfo()
        observeStatus("captureReceived", ["index": index, "phase": record["phase"] as? String ?? "missing"])
        records.append(record)
        report = nativeInfo(); report["records"] = records
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys, .prettyPrinted]) {
            try? data.write(to: output.appendingPathComponent("native-parity.json"), options: .atomic)
        }
        if let window = view.window {
            let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
                window.drawHierarchy(in: window.bounds, afterScreenUpdates: true)
            }
            try? image.pngData()?.write(to: output.appendingPathComponent("native-parity-\(record["phase"] ?? index).png"))
        }
        observeStatus("captureWritten", ["index": index])
        webView?.evaluateJavaScript("globalThis.__iosParityCaptureAck?.(\(index))") { [weak self] _, error in
            self?.observeStatus("captureAckCallback", ["index": index, "error": error.map { String(describing: $0) } ?? ""])
        }
        refreshStatus("capture")
    }
}
