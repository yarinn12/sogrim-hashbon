import UIKit
import Capacitor
import GoogleSignIn
import AuthenticationServices

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

}

// ASWebAuthenticationSession delivers its result to this app's WKWebView,
// where the flow's PKCE verifier was created. A Safari page cannot read it.
@objc(SogrimBridgeViewController)
class SogrimBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SogrimAuthSessionPlugin())
    }
}

@objc(SogrimAuthSessionPlugin)
public class SogrimAuthSessionPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "SogrimAuthSessionPlugin"
    public let jsName = "SogrimAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]
    private var authenticationSession: ASWebAuthenticationSession?
    private var activeAttempt: UUID?
    private weak var anchorWindow: UIWindow?
    private static let callbackScheme = "com.sogrimhashbon.app"
    private static let callbackHost = "sogrim-hesbon-app.vercel.app"

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.reject("Authentication unavailable", "AUTH_UNAVAILABLE"); return }
            guard self.authenticationSession == nil else { call.reject("Authentication already active", "AUTH_BUSY"); return }
            guard let value = call.getString("url"),
                  var authorization = URLComponents(string: value),
                  authorization.scheme == "https", authorization.user == nil, authorization.password == nil,
                  authorization.port == nil || authorization.port == 443,
                  authorization.host?.hasSuffix(".supabase.co") == true,
                  authorization.path == "/auth/v1/authorize",
                  Self.singleQuery("provider", in: authorization) == "apple",
                  Self.singleQuery("code_challenge_method", in: authorization) == "s256",
                  let challenge = Self.singleQuery("code_challenge", in: authorization),
                  challenge.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil,
                  let redirect = Self.singleQuery("redirect_to", in: authorization),
                  var callback = URLComponents(string: redirect),
                  callback.scheme == "https", callback.host == Self.callbackHost,
                  callback.path == "/auth/callback", callback.user == nil, callback.password == nil,
                  callback.port == nil, callback.fragment == nil,
                  let flow = Self.singleQuery("auth_flow", in: callback),
                  flow.range(of: "^[A-Za-z0-9_-]{20,128}$", options: .regularExpression) != nil,
                  let window = self.bridge?.viewController?.view.window else {
                call.reject("Invalid authentication request", "AUTH_INVALID_REQUEST"); return
            }
            // Use the bound OS session's registered callback on every supported
            // version. HTTPS session matching also depends on Apple's cached
            // webcredentials association, which can lag a deployed update.
            callback.queryItems = (callback.queryItems ?? []).filter { $0.name != "native_auth_session" }
            callback.queryItems = (callback.queryItems ?? []) + [URLQueryItem(name: "native_auth_session", value: "1")]
            guard let redirectURL = callback.url else { call.reject("Invalid authentication return", "AUTH_INVALID_REQUEST"); return }
            authorization.queryItems = (authorization.queryItems ?? []).filter { $0.name != "redirect_to" } +
                [URLQueryItem(name: "redirect_to", value: redirectURL.absoluteString)]
            guard let authorizationURL = authorization.url else { call.reject("Invalid authentication request", "AUTH_INVALID_REQUEST"); return }
            let attempt = UUID()
            self.activeAttempt = attempt
            self.anchorWindow = window
            let completion: ASWebAuthenticationSession.CompletionHandler = { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self = self, self.activeAttempt == attempt else { return }
                    self.authenticationSession = nil
                    self.activeAttempt = nil
                    self.anchorWindow = nil
                    if let error = error {
                        let cancelled = (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue
                        call.reject(cancelled ? "Authentication cancelled" : "Authentication incomplete", cancelled ? "AUTH_CANCELLED" : "AUTH_INCOMPLETE")
                        return
                    }
                    guard let result = result,
                          let normalized = Self.normalizedCallback(result, expectedFlow: flow) else {
                        call.reject("Invalid authentication result", "AUTH_INVALID_CALLBACK"); return
                    }
                    call.resolve(["url": normalized.absoluteString])
                }
            }
            let session = ASWebAuthenticationSession(url: authorizationURL, callbackURLScheme: Self.callbackScheme, completionHandler: completion)
            // Isolate the return from a web worker installed by an older release.
            session.prefersEphemeralWebBrowserSession = true
            session.presentationContextProvider = self
            self.authenticationSession = session
            if !session.start() {
                self.authenticationSession = nil
                self.activeAttempt = nil
                self.anchorWindow = nil
                call.reject("Authentication could not start", "AUTH_UNAVAILABLE")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return anchorWindow ?? UIWindow()
    }

    private static func singleQuery(_ name: String, in components: URLComponents) -> String? {
        let items = (components.queryItems ?? []).filter { $0.name == name }
        return items.count == 1 ? items[0].value : nil
    }

    static func normalizedCallback(_ url: URL, expectedFlow: String) -> URL? {
        guard let result = URLComponents(url: url, resolvingAgainstBaseURL: false),
              result.scheme == callbackScheme && result.host == "auth" && result.path == "/callback",
              result.user == nil, result.password == nil, result.port == nil, result.fragment == nil,
              singleQuery("auth_flow", in: result) == expectedFlow else { return nil }
        let code = singleQuery("code", in: result)
        let error = singleQuery("error", in: result)
        let hasCode = (result.queryItems ?? []).contains { $0.name == "code" }
        let hasError = (result.queryItems ?? []).contains { $0.name == "error" }
        guard hasCode != hasError, let value = code ?? error, !value.isEmpty, value.count <= 2048,
              value.rangeOfCharacter(from: .whitespacesAndNewlines.union(.controlCharacters)) == nil else { return nil }
        var callback = URLComponents(string: "https://\(callbackHost)/auth/callback")!
        callback.queryItems = [URLQueryItem(name: "auth_flow", value: expectedFlow), URLQueryItem(name: hasCode ? "code" : "error", value: value)]
        return callback.url
    }
}
