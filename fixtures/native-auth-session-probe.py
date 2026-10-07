from pathlib import Path
import json, os, plistlib, subprocess

root=Path.cwd()
fixtures=Path(os.environ['PROBE_FIXTURES'])
mode=os.environ['PROBE_MODE']
p=root/'ios/App/App/AppDelegate.swift'
source=p.read_text().replace('import GoogleSignIn','import GoogleSignIn\nimport WebKit')
base='CAPBridgeViewController' if mode=='before' else 'SogrimBridgeViewController'
if mode=='legacy':
    source=source.replace('if #available(iOS 17.4, *) { usesHTTPSCallback = true } else { usesHTTPSCallback = false }','usesHTTPSCallback = false')
    source=source.replace('if #available(iOS 17.4, *) {\n                session = ASWebAuthenticationSession','if #available(iOS 17.4, *), usesHTTPSCallback {\n                session = ASWebAuthenticationSession')
if mode!='before':
    needle='guard let authorizationURL = authorization.url else'
    assert source.count(needle)==1
    source=source.replace(needle,'guard let originalAuthorizationURL = authorization.url else')
    marker='            let attempt = UUID()'
    proxy='''            var probeURL = URLComponents(string: "http://127.0.0.1:8765/start")!
            probeURL.queryItems = [URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString)]
            let authorizationURL = probeURL.url!
            _ = originalAuthorizationURL
'''
    source=source.replace(marker,proxy+marker)
else:
    browser=root/'node_modules/@capacitor/browser/ios/Sources/BrowserPlugin/BrowserPlugin.swift'
    code=browser.read_text()
    marker='        // extract the optional parameters'
    replacement='''        var probeURL = URLComponents(string: "http://127.0.0.1:8765/start")!
        let original = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        let redirect = original.queryItems!.first { $0.name == "redirect_to" }!.value!
        probeURL.queryItems = [URLQueryItem(name: "redirect_to", value: redirect)]
        let url = probeURL.url!
'''
    assert marker in code
    browser.write_text(code.replace(marker,replacement+marker))
probe=r'''
@objc(SogrimProbeBridgeViewController)
class SogrimProbeBridgeViewController: BASE_CLASS {
    var probeTimer: Timer?
    var probeTicks = 0
    var probeEvaluating = false
    var probeSawSafari = false
    var probeCompleted = false
    let probeLabel = UILabel()
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        let path = Bundle.main.resourceURL!.appendingPathComponent("public/native-auth-session-fixture.js")
        let script = try! String(contentsOf: path, encoding: .utf8)
        webView!.configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if probeTimer != nil { return }
        probeLabel.accessibilityIdentifier = "native-auth-probe-result"
        probeLabel.isAccessibilityElement = true
        probeLabel.frame = CGRect(x: 12, y: 30, width: 340, height: 28)
        probeLabel.font = .systemFont(ofSize: 9)
        probeLabel.backgroundColor = .white
        view.addSubview(probeLabel)
        probeTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            self.probeTicks += 1
            if self.probeTicks > 150 { timer.invalidate(); return }
            if self.presentedViewController.map({String(describing: type(of: $0))}) == "SFSafariViewController" { self.probeSawSafari = true }
            if self.probeEvaluating || self.probeCompleted { return }
            self.probeEvaluating = true
            let script = #"""
            (() => {
              const button = document.querySelector('[data-account-action="apple"]');
              if(button && !button.disabled && !localStorage.getItem('probe-started')) {
                localStorage.setItem('probe-started','1');button.click();
              }
              return JSON.stringify(globalThis.__nativeAuthProbeState?.() || {});
            })()
            """#
            self.webView?.evaluateJavaScript(script) { value, error in
                self.probeEvaluating = false
                guard let text = value as? String, let data = text.data(using: .utf8),
                      var state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
                state["safari"] = self.probeSawSafari
                let signedIn = state["signedIn"] as? Bool == true
                if signedIn || (self.probeTicks >= 45 && self.probeSawSafari) {
                    let result = try! JSONSerialization.data(withJSONObject: state, options: [.sortedKeys])
                    let report = String(data: result, encoding: .utf8)!
                    self.probeLabel.text = report
                    self.probeLabel.accessibilityLabel = report
                    self.probeCompleted = true
                    print("PROBE_SYSTEM_FINAL:" + report);fflush(stdout)
                    timer.invalidate()
                }
            }
        }
    }
}
'''.replace('BASE_CLASS',base)
p.write_text(source+'\n'+probe)
story=root/'ios/App/App/Base.lproj/Main.storyboard'
content=story.read_text()
if mode=='before':
    content=content.replace('customClass="CAPBridgeViewController" customModule="Capacitor"','customClass="SogrimProbeBridgeViewController" customModule="App" customModuleProvider="target"')
else:
    content=content.replace('customClass="SogrimBridgeViewController"','customClass="SogrimProbeBridgeViewController"')
story.write_text(content)
(root/'ios/App/App/public/native-auth-session-fixture.js').write_text((fixtures/'native-auth-session-fixture.js').read_text())
info=root/'ios/App/App/Info.plist'
with info.open('rb') as f: properties=plistlib.load(f)
properties['NSAppTransportSecurity']={'NSAllowsArbitraryLoads':True,'NSAllowsArbitraryLoadsInWebContent':True}
with info.open('wb') as f: plistlib.dump(properties,f)

project=root/'ios/App/App.xcodeproj/project.pbxproj'
model=json.loads(subprocess.check_output(['plutil','-convert','json','-o','-',str(project)]))
objects=model['objects']
def key(n): return 'AC071910000000000000'+str(n).zfill(4)
target,product,file,build,sources,frameworks,resources,configs,debug,release,dependency,proxy=[key(i) for i in range(12)]
objects[file]={'isa':'PBXFileReference','lastKnownFileType':'sourcecode.swift','path':'AuthProbeUITests.swift','sourceTree':'SOURCE_ROOT'}
objects[build]={'isa':'PBXBuildFile','fileRef':file}
objects[product]={'isa':'PBXFileReference','explicitFileType':'wrapper.cfbundle','includeInIndex':'0','path':'AuthProbeUITests.xctest','sourceTree':'BUILT_PRODUCTS_DIR'}
objects[sources]={'isa':'PBXSourcesBuildPhase','buildActionMask':'2147483647','files':[build],'runOnlyForDeploymentPostprocessing':'0'}
objects[frameworks]={'isa':'PBXFrameworksBuildPhase','buildActionMask':'2147483647','files':[],'runOnlyForDeploymentPostprocessing':'0'}
objects[resources]={'isa':'PBXResourcesBuildPhase','buildActionMask':'2147483647','files':[],'runOnlyForDeploymentPostprocessing':'0'}
settings={'CLANG_ENABLE_MODULES':'YES','SWIFT_VERSION':'5.0','IPHONEOS_DEPLOYMENT_TARGET':'15.0','PRODUCT_BUNDLE_IDENTIFIER':'com.sogrimhashbon.authprobe','PRODUCT_NAME':'$(TARGET_NAME)','GENERATE_INFOPLIST_FILE':'YES','TARGETED_DEVICE_FAMILY':'1,2','TEST_TARGET_NAME':'App','CODE_SIGNING_ALLOWED':'NO','SDKROOT':'iphoneos'}
for identifier,name in [(debug,'Debug'),(release,'Release')]: objects[identifier]={'isa':'XCBuildConfiguration','buildSettings':settings,'name':name}
objects[configs]={'isa':'XCConfigurationList','buildConfigurations':[debug,release],'defaultConfigurationIsVisible':'0','defaultConfigurationName':'Debug'}
objects[proxy]={'isa':'PBXContainerItemProxy','containerPortal':model['rootObject'],'proxyType':'1','remoteGlobalIDString':'504EC3031FED79650016851F','remoteInfo':'App'}
objects[dependency]={'isa':'PBXTargetDependency','target':'504EC3031FED79650016851F','targetProxy':proxy}
objects[target]={'isa':'PBXNativeTarget','buildConfigurationList':configs,'buildPhases':[sources,frameworks,resources],'buildRules':[],'dependencies':[dependency],'name':'AuthProbeUITests','productName':'AuthProbeUITests','productReference':product,'productType':'com.apple.product-type.bundle.ui-testing'}
objects['504EC2FB1FED79650016851F']['children'].append(file)
objects['504EC3051FED79650016851F']['children'].append(product)
objects[model['rootObject']]['targets'].append(target)
objects[model['rootObject']]['attributes']['TargetAttributes'][target]={'CreatedOnToolsVersion':'26.6','TestTargetID':'504EC3031FED79650016851F'}
with project.open('wb') as f: plistlib.dump(model,f)
scheme=root/'ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'
content=scheme.read_text()
ref=f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="AuthProbeUITests.xctest" BlueprintName="AuthProbeUITests" ReferencedContainer="container:App.xcodeproj"/>'
content=content.replace('<Testables>','<Testables><TestableReference skipped="NO">'+ref+'</TestableReference>')
content=content.replace('<BuildActionEntries>','<BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="NO">'+ref+'</BuildActionEntry>')
scheme.write_text(content)
test=r'''
import XCTest
final class AuthProbeUITests: XCTestCase {
    func testSystemAuthenticationReturn() {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "com.sogrimhashbon.app")
        app.launch()
        let result = app.staticTexts["native-auth-probe-result"]
        let deadline = Date().addingTimeInterval(130)
        while Date() < deadline && (!result.exists || !result.label.contains("signedIn")) {
            let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
            for container in [app,springboard] {
                for label in ["Continue","המשך","Allow","אפשר"] {
                    let button = container.alerts.buttons[label].firstMatch
                    if button.exists { button.tap() }
                }
            }
            if BEFORE && Date().timeIntervalSince(deadline.addingTimeInterval(-130)) > 20 {
                for label in ["Done","סיום"] {
                    let button = app.buttons[label].firstMatch
                    if button.exists { button.tap() }
                }
            }
            Thread.sleep(forTimeInterval: 1)
        }
        let report = result.label
        print("PROBE_UITEST_RESULT:"+report)
        let data = report.data(using: .utf8)!
        let state = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        if BEFORE {
            XCTAssertEqual(state["signedIn"] as? Bool,false)
            XCTAssertEqual(state["pkce"] as? Int,0)
            XCTAssertEqual(state["safari"] as? Bool,true)
        } else {
            XCTAssertEqual(state["signedIn"] as? Bool,true)
            XCTAssertEqual(state["gate"] as? Bool,false)
            XCTAssertEqual(state["eventVisible"] as? Bool,true)
            XCTAssertEqual(state["pkce"] as? Int,1)
            XCTAssertEqual(state["bound"] as? Bool,true)
            XCTAssertGreaterThan(state["writes"] as? Int ?? 0,0)
            XCTAssertEqual(state["writeValid"] as? Bool,true)
            app.terminate();app.launch()
            let restored = app.staticTexts["native-auth-probe-result"]
            let signedIn = NSPredicate(format: "label CONTAINS %@", "\"signedIn\":true")
            expectation(for:signedIn,evaluatedWith:restored)
            waitForExpectations(timeout:30)
            XCTAssertTrue(restored.label.contains("\"pkce\":1"))
        }
    }
}
'''.replace('BEFORE','true' if mode=='before' else 'false')
(root/'ios/App/AuthProbeUITests.swift').write_text(test)
print('Isolated native auth probe prepared: '+mode)
