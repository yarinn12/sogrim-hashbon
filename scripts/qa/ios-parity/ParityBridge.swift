
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
    private var output: URL { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0] }

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
        status.accessibilityIdentifier = "native-parity-state"
        status.isAccessibilityElement = true
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
        timer = Timer.scheduledTimer(withTimeInterval: 0.4, repeats: true) { [weak self] _ in self?.refreshStatus() }
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
                "preferredContentSizeCategory": UIApplication.shared.preferredContentSizeCategory.rawValue,
                "webViewContentSizeCategory": webView!.traitCollection.preferredContentSizeCategory.rawValue,
                "nativeBodyPointSize": UIFont.preferredFont(forTextStyle: .body).pointSize,
                "keyboardShows": keyboardShows, "keyboardHides": keyboardHides,
                "backgrounds": backgrounds, "foregrounds": foregrounds,
                "safeArea": ["top": safe.top, "bottom": safe.bottom, "left": safe.left, "right": safe.right]]
    }
    private func refreshStatus() {
        webView?.evaluateJavaScript("JSON.stringify(globalThis.__iosParityLive?.() || {})") { [weak self] value, error in
            guard let self = self, let text = value as? String, let data = text.data(using: .utf8),
                  var state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
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
            if let encoded = try? JSONSerialization.data(withJSONObject: state, options: [.sortedKeys]),
               let result = String(data: encoded, encoding: .utf8) {
                self.status.text = result; self.status.accessibilityLabel = result
            }
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard var record = message.body as? [String: Any], let index = record["index"] as? Int else { return }
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
        webView?.evaluateJavaScript("globalThis.__iosParityCaptureAck?.(\(index))", completionHandler: nil)
        refreshStatus()
    }
}
