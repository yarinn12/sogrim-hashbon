import Foundation

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
