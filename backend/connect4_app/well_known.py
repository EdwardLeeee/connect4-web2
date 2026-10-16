"""Files the website serves under /.well-known/ for other platforms to read.

They are Python constants rather than data files so that they always ship inside the
package the Containerfile builds. app.py serves each as JSON before the SPA fallback.
"""

from __future__ import annotations

from typing import Any

# The iOS app's App ID: Apple Team ID, then the bundle ID (mobile/ios). It is public:
# Apple publishes it in this file for anyone to read.
IOS_APP_ID = "J89WNJYJ63.com.oraclelee.connect4"

# Universal Links: invite links open the iOS app when it is installed, and the website
# otherwise. Apple's CDN fetches this file for the app's Associated Domains entitlement
# (https://developer.apple.com/documentation/xcode/supporting-associated-domains), so it
# must stay at this exact path, as application/json, with no redirect.
APPLE_APP_SITE_ASSOCIATION: dict[str, Any] = {
    "applinks": {
        "details": [
            {
                "appIDs": [IOS_APP_ID],
                "components": [
                    {
                        "/": "/r/??????",
                        "comment": "An invite link: /r/ and a six-character room code.",
                    },
                    {
                        "/": "/",
                        "?": {"room": "??????"},
                        "comment": "An older invite link: /?room= and a six-character code.",
                    },
                ],
            }
        ]
    }
}
