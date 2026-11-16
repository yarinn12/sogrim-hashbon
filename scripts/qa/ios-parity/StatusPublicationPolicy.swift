import Foundation

// Timer reads must not queue up while WebKit is still answering. A capture
// requested during a read keeps one fresh follow-up, using the same timer and
// readiness/deadline rules as before.
struct StatusRefreshPolicy {
    private var requestInFlight = false
    private var capturePending = false

    mutating func begin(origin: String) -> Bool {
        if requestInFlight {
            capturePending = capturePending || origin == "capture"
            return false
        }
        requestInFlight = true
        return true
    }

    mutating func complete() -> Bool {
        guard requestInFlight else { return false }
        requestInFlight = false
        let pending = capturePending
        capturePending = false
        return pending
    }
}

// The UI label is a diagnostic transport. Capture reports and the status
// journal retain their complete native counters independently of this policy.
enum StatusPublicationPolicyError: Error {
    case invalidJSONObject
}

struct StatusPublicationPolicy {
    private var lastPublishedData: Data?

    func candidate(for state: [String: Any]) throws -> Data? {
        var labelState = state
        if var native = labelState["native"] as? [String: Any] {
            native.removeValue(forKey: "statusPoll")
            labelState["native"] = native
        }
        // Darwin can raise an Objective-C exception for NaN before Swift can catch it.
        guard JSONSerialization.isValidJSONObject(labelState) else {
            throw StatusPublicationPolicyError.invalidJSONObject
        }
        let encoded = try JSONSerialization.data(withJSONObject: labelState, options: [.sortedKeys])
        return encoded == lastPublishedData ? nil : encoded
    }

    mutating func didPublish(_ data: Data) {
        lastPublishedData = data
    }
}
