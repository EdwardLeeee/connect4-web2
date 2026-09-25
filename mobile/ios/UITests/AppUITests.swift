import XCTest

/// Plays one whole game against the AI in the bundled web app, then opens the privacy
/// link. It talks to the production server, so the Mobile workflow runs it only by hand.
/// The target is added in CI by mobile/scripts/add-ui-test-target.rb.
final class AppUITests: XCTestCase {
    private let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Elements whose label matches `format` for any of the Chinese or English words.
    private func matching(_ query: XCUIElementQuery, _ format: String, _ words: String...) -> XCUIElementQuery {
        query.matching(NSCompoundPredicate(orPredicateWithSubpredicates: words.map { NSPredicate(format: format, $0) }))
    }

    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func waitUntil(_ format: String, _ element: XCUIElement, timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: format), object: element)
        return XCTWaiter().wait(for: [expectation], timeout: timeout) == .completed
    }

    func testPlayOneGameAgainstTheAIAndOpenThePrivacyPolicy() throws {
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 60), "the web view never appeared")

        let start = matching(web.buttons, "label CONTAINS %@", "立即對戰", "Play now").firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 60), "the lobby never showed Play now")
        XCTAssertTrue(
            waitUntil("isEnabled == true", start, timeout: 60),
            "Play now stayed disabled: the app could not reach the server")
        shot("01-lobby")
        start.tap()

        // Our turn whenever a column reads "ready"; the AI answers after at least a second.
        let ready = matching(web.buttons, "label ENDSWITH %@", "可以落子", "ready to drop")
        let finished = matching(web.buttons, "label CONTAINS %@", "再次挑戰", "Challenge again").firstMatch
        let deadline = Date().addingTimeInterval(300)
        var moves = 0
        while !finished.exists {
            XCTAssertLessThan(Date(), deadline, "the game did not finish within 5 minutes (\(moves) moves)")
            let count = ready.count
            if count > 0 {
                let column = ready.element(boundBy: count / 2)
                if column.exists && column.isHittable {
                    column.tap()
                    moves += 1
                    if moves == 1 { shot("02-game") }
                }
            }
            Thread.sleep(forTimeInterval: 0.7)
        }
        shot("03-result")
        XCTAssertGreaterThanOrEqual(moves, 4, "a finished game needs at least 4 of our moves")

        // The privacy link must open in Safari while the app keeps its page.
        let profile = web.buttons.matching(NSPredicate(format: "label CONTAINS %@", "玩家")).firstMatch
        XCTAssertTrue(profile.waitForExistence(timeout: 10), "no profile button")
        profile.tap()
        let privacy = matching(web.links, "label CONTAINS %@", "隱私權政策", "Privacy Policy").firstMatch
        XCTAssertTrue(privacy.waitForExistence(timeout: 10), "the profile sheet has no privacy link")
        shot("04-profile")
        privacy.tap()

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 30), "the privacy link did not open Safari")
        Thread.sleep(forTimeInterval: 3)
        shot("05-safari")

        app.activate()
        XCTAssertTrue(privacy.waitForExistence(timeout: 10), "the app lost its page after opening the link")
        shot("06-back-in-app")
    }
}
