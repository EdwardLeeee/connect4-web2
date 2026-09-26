import XCTest

/// Smoke tests for the bundled web app, run by hand from the Mobile workflow (smoke input).
/// testOnline… talks to the production server; testOffline… runs against a build whose API
/// origin cannot be reached, on a fresh install. The target is added in CI by
/// mobile/scripts/add-ui-test-target.rb.
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

    private func launchWebView() -> XCUIElement {
        app.launch()
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 60), "the web view never appeared")
        return web
    }

    private func playNow(_ web: XCUIElement) -> XCUIElement {
        let start = matching(web.buttons, "label CONTAINS %@", "立即對戰", "Play now").firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 60), "the lobby never showed Play now")
        XCTAssertTrue(waitUntil("isEnabled == true", start, timeout: 60), "Play now stayed disabled")
        return start
    }

    /// The header avatar shows the nickname's first character, or "?" when there is none; the
    /// profile sheet shows the whole default nickname ("玩家 NNNN" / "Player NNNN").
    private func checkDefaultNickname(_ web: XCUIElement, _ tag: String) {
        let profile = web.buttons.matching(NSPredicate(
            format: "label BEGINSWITH %@ OR label == %@ OR label BEGINSWITH %@ OR label == %@ OR label BEGINSWITH %@",
            "?", "玩", "玩家", "P", "Player ")).firstMatch
        XCTAssertTrue(profile.waitForExistence(timeout: 30), "no profile button in the header")
        XCTAssertFalse(profile.label.hasPrefix("?"), "the avatar shows ? instead of a default nickname")
        profile.tap()
        let nickname = web.textFields.matching(
            NSPredicate(format: "value MATCHES %@", "^(玩家|Player) [0-9]{4}$")).firstMatch
        XCTAssertTrue(nickname.waitForExistence(timeout: 10), "the profile sheet has no default nickname")
        print("SMOKE \(tag): avatar \"\(profile.label)\", nickname \"\(nickname.value as? String ?? "")\"")
        shot("\(tag)-profile")
        let cancel = matching(web.buttons, "label == %@", "取消", "Cancel").firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 5), "the profile sheet has no Cancel button")
        cancel.tap()
    }

    /// Plays the middle open column until the game ends or `maxMoves` of our moves are made, and
    /// checks that the AI (on the phone) answers every move within 30 seconds.
    @discardableResult
    private func play(_ web: XCUIElement, _ tag: String, maxMoves: Int = Int.max) -> Int {
        let ready = matching(web.buttons, "label ENDSWITH %@", "可以落子", "ready to drop")
        let finished = matching(web.buttons, "label CONTAINS %@", "再次挑戰", "Challenge again").firstMatch
        let deadline = Date().addingTimeInterval(300)
        var moves = 0
        var replies: [String] = []
        while moves < maxMoves && !finished.exists {
            XCTAssertLessThan(Date(), deadline, "the game did not finish within 5 minutes (\(moves) moves)")
            let count = ready.count
            guard count > 0 else {
                Thread.sleep(forTimeInterval: 0.3)
                continue
            }
            let column = ready.element(boundBy: count / 2)
            guard column.exists && column.isHittable else {
                Thread.sleep(forTimeInterval: 0.3)
                continue
            }
            column.tap()
            moves += 1
            let tapped = Date()
            Thread.sleep(forTimeInterval: 0.3)
            while ready.count == 0 && !finished.exists {
                XCTAssertLessThan(
                    Date().timeIntervalSince(tapped), 30, "the AI did not answer move \(moves) within 30 s")
                Thread.sleep(forTimeInterval: 0.2)
            }
            // The last move also waits for the ending animation before "Challenge again" shows.
            let seconds = String(format: "%.1f", Date().timeIntervalSince(tapped))
            replies.append(finished.exists ? "\(seconds)(end)" : seconds)
            if moves == 1 { shot("\(tag)-game") }
        }
        print("SMOKE \(tag): \(moves) of our moves; seconds until our next turn: \(replies.joined(separator: " "))")
        return moves
    }

    func testOnlineGameAndPrivacyPolicy() throws {
        let web = launchWebView()
        let start = playNow(web)
        shot("online-lobby")
        checkDefaultNickname(web, "online")
        start.tap()

        let moves = play(web, "online")
        XCTAssertGreaterThanOrEqual(moves, 4, "a finished game needs at least 4 of our moves")
        shot("online-result")

        // The privacy link must open in Safari while the app keeps its page.
        let profile = web.buttons.matching(
            NSPredicate(format: "label == %@ OR label BEGINSWITH %@", "玩", "玩家")).firstMatch
        XCTAssertTrue(profile.waitForExistence(timeout: 10), "no profile button")
        profile.tap()
        let privacy = matching(web.links, "label CONTAINS %@", "隱私權政策", "Privacy Policy").firstMatch
        XCTAssertTrue(privacy.waitForExistence(timeout: 10), "the profile sheet has no privacy link")
        privacy.tap()

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 30), "the privacy link did not open Safari")
        Thread.sleep(forTimeInterval: 3)
        shot("online-safari")

        app.activate()
        XCTAssertTrue(privacy.waitForExistence(timeout: 10), "the app lost its page after opening the link")
    }

    func testOfflineLobbyGameAndRestore() throws {
        let web = launchWebView()
        let banner = matching(web.staticTexts, "label CONTAINS %@", "沒有網路也沒關係", "No internet? No problem")
            .firstMatch
        XCTAssertTrue(banner.waitForExistence(timeout: 60), "the offline lobby banner never appeared")
        let start = playNow(web)
        shot("offline-lobby")
        checkDefaultNickname(web, "offline")
        start.tap()

        // Two of our moves, then leave the app while the game is in progress.
        play(web, "offline", maxMoves: 2)
        let chip = web.staticTexts.matching(
            NSPredicate(format: "label MATCHES %@", "^(第 [0-9]+ 手|Move [0-9]+)$")).firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 30), "no move counter during the game")
        let before = chip.label
        shot("offline-before-restart")

        app.terminate()
        let again = launchWebView()
        let restored = again.staticTexts.matching(NSPredicate(format: "label == %@", before)).firstMatch
        XCTAssertTrue(restored.waitForExistence(timeout: 60), "the unfinished game was not restored (\(before))")
        print("SMOKE offline: restored at \"\(before)\" after relaunch")
        shot("offline-restored")

        let moves = play(again, "offline-after-restore")
        XCTAssertGreaterThanOrEqual(moves, 2, "the restored game did not continue")
        shot("offline-result")
    }
}
