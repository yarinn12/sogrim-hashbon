import Foundation

// The UI label is a diagnostic transport. Capture reports and the status
// journal retain their complete native counters independently of this policy.
struct StatusPublicationPolicy {
    private var lastPublishedData: Data?

    func candidate(for state: [String: Any]) throws -> Data? {
        var labelState = state
        if var native = labelState["native"] as? [String: Any] {
            native.removeValue(forKey: "statusPoll")
            labelState["native"] = native
        }
        let encoded = try JSONSerialization.data(withJSONObject: labelState, options: [.sortedKeys])
        return encoded == lastPublishedData ? nil : encoded
    }

    mutating func didPublish(_ data: Data) {
        lastPublishedData = data
    }
}
