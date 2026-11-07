final class StatusPublicationPolicyTests: XCTestCase {
    private func state(phase: String = "saved", backgrounds: Int = 0, poll: Int = 1) -> [String: Any] {
        return ["phase": phase,
                "native": ["backgrounds": backgrounds,
                           "statusPoll": ["requests": poll, "callbacks": poll]]]
    }

    func testIdenticalLabelDataIsSuppressedOnlyAfterPublication() throws {
        var policy = StatusPublicationPolicy()
        let firstState = state()
        let first = try XCTUnwrap(policy.candidate(for: firstState))
        XCTAssertEqual(try XCTUnwrap(policy.candidate(for: firstState)), first)
        XCTAssertFalse(String(decoding: first, as: UTF8.self).contains("statusPoll"))
        XCTAssertNotNil((firstState["native"] as? [String: Any])?["statusPoll"])
        policy.didPublish(first)
        XCTAssertNil(try policy.candidate(for: state(poll: 2)))
    }

    func testPhaseAndNativeChangesRemainVisible() throws {
        var policy = StatusPublicationPolicy()
        policy.didPublish(try XCTUnwrap(policy.candidate(for: state())))
        let resumed = try XCTUnwrap(policy.candidate(for: state(phase: "resumed")))
        policy.didPublish(resumed)
        let backgrounded = try XCTUnwrap(policy.candidate(for: state(phase: "resumed", backgrounds: 1)))
        XCTAssertNotEqual(resumed, backgrounded)
    }

    func testKeyOrderDoesNotCreateAnExtraPublication() throws {
        var policy = StatusPublicationPolicy()
        let first: [String: Any] = ["phase": "saved",
                                    "native": ["backgrounds": 0, "foregrounds": 1,
                                               "statusPoll": ["requests": 1]]]
        policy.didPublish(try XCTUnwrap(policy.candidate(for: first)))
        let reordered: [String: Any] = ["native": ["statusPoll": ["requests": 2],
                                                  "foregrounds": 1, "backgrounds": 0],
                                        "phase": "saved"]
        XCTAssertNil(try policy.candidate(for: reordered))
    }

    func testSerializationFailureDoesNotAdvanceThePublicationState() throws {
        var policy = StatusPublicationPolicy()
        let first = try XCTUnwrap(policy.candidate(for: state()))
        policy.didPublish(first)
        var invalid = state()
        invalid["native"] = ["backgrounds": Double.nan]
        XCTAssertThrowsError(try policy.candidate(for: invalid))
        XCTAssertNil(try policy.candidate(for: state()))
        XCTAssertNotNil(try policy.candidate(for: state(phase: "resumed")))
    }
}
